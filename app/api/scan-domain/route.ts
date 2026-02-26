import { NextRequest, NextResponse } from 'next/server';
import clientPromise from '@/lib/mongodb';
import { runFullHealthCheck } from '@/lib/test-engine';
import { ObjectId } from 'mongodb';

export const dynamic = 'force-dynamic';
const GLOBAL_TIMEOUT_MS = 9000; // Vercel hobby limit safeguard

// Helpers for Categorization (from rescan_db.ts)
function determineIssueCategory(report: any): string {
    const categories = report.categories || {};
    const spfTests = categories['spf']?.tests || [];
    const dmarcTests = categories['dmarc']?.tests || [];
    const dkimTests = categories['dkim']?.tests || [];
    const webTests = categories['webServer']?.tests || [];
    const blacklistTests = categories['blacklist']?.tests || [];
    const dnsTests = categories['dns']?.tests || [];

    const coreFailedToLoad = [...dnsTests, ...spfTests, ...dmarcTests, ...dkimTests].some((t: any) =>
        t.info === 'Timed Out' || t.info === 'Timeout'
    );
    if (coreFailedToLoad) return 'SYSTEM_TIMEOUT';

    const missingSpf = spfTests.some((t: any) => t.name?.includes('Record Found') && t.status === 'Error' && t.info === 'Missing');
    const missingDmarc = dmarcTests.some((t: any) => t.name?.includes('Record Found') && t.status === 'Error' && t.info === 'Missing');
    const multipleSpf = spfTests.some((t: any) => t.name?.includes('Multiple') && t.status === 'Error');
    const multipleDmarc = dmarcTests.some((t: any) => t.name?.includes('Multiple') && t.status === 'Error');
    const dmarcNone = dmarcTests.some((t: any) => t.name?.includes('Policy') && t.info?.toLowerCase().includes('none'));
    const dkimErrors = dkimTests.filter((t: any) => t.status === 'Error');

    if (missingSpf && missingDmarc) return 'No_SPF_AND_DMARC';
    if (missingDmarc) return 'No_DMARC_Only';
    if (missingSpf) return 'No_SPF_Only';
    if (multipleSpf) return 'Multiple_SPF';
    if (multipleDmarc) return 'Multiple_DMARC';
    if (dkimErrors.length > 0) return 'DKIM_Issues';
    if (dmarcNone) return 'DMARC_Policy_None';

    const blacklistErrors = blacklistTests.filter((t: any) => t.status === 'Error' && t.info !== 'Timed Out');
    if (blacklistErrors.length > 0) return 'blacklist_issue';

    const webErrors = webTests.filter((t: any) => t.status === 'Error' && !t.info?.includes('Timeout'));
    if (webErrors.length > 0) return 'http_issue';

    return 'Clean';
}

function calculateIssuesCount(report: any): number {
    let count = 0;
    if (!report.categories) return count;
    for (const catKey of Object.keys(report.categories)) {
        const tests = report.categories[catKey].tests || [];
        count += tests.filter((t: any) => t.status === 'Error' || t.status === 'Warning').length;
    }
    return count;
}

export async function POST(request: NextRequest) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), GLOBAL_TIMEOUT_MS);

    try {
        const body = await request.json();
        const { domainId, email, domain } = body;

        if (!email || (!domainId && !domain)) {
            return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 });
        }

        const client = await clientPromise;
        const db = client.db('vercel');
        const collection = db.collection('issue_domains');

        // Verify ownership
        const query: any = { ownerUserId: email };
        if (domainId) query._id = new ObjectId(domainId);
        else query.domain = domain;

        const existingDoc = await collection.findOne(query);
        if (!existingDoc) {
            return NextResponse.json({ error: 'Domain not found or unauthorized' }, { status: 404 });
        }

        const targetDomain = existingDoc.domain;

        // Run Health Check with timeout
        const report: any = await Promise.race([
            runFullHealthCheck(targetDomain),
            new Promise((_, reject) =>
                setTimeout(() => reject(new Error('Global Timeout')), GLOBAL_TIMEOUT_MS - 500)
            )
        ]);

        const newCategory = determineIssueCategory(report);

        if (newCategory === 'SYSTEM_TIMEOUT') {
            return NextResponse.json({
                success: false,
                message: 'DNS lookup timed out due to rate limits. Try again later.',
                status: 'partial'
            });
        }

        const newIssuesCount = calculateIssuesCount(report);
        const newStatus = newCategory === 'Clean' ? 'Secure' : 'At Risk';
        const spfRecord = report.rawSpf || existingDoc.spfFull;
        const dmarcRecord = report.rawDmarc || existingDoc.dmarcFull;

        // Update DB
        await collection.updateOne(
            { _id: existingDoc._id },
            {
                $set: {
                    issueCategory: newCategory,
                    status: newStatus,
                    issuesDetected: newIssuesCount,
                    spfFull: spfRecord?.startsWith('v=') ? spfRecord : existingDoc.spfFull,
                    dmarcFull: dmarcRecord?.startsWith('v=') ? dmarcRecord : existingDoc.dmarcFull,
                    healthStatus: 'Scanned via Dashboard',
                    timestamp: new Date()
                }
            }
        );

        return NextResponse.json({
            success: true,
            message: `Domain scanned: ${newStatus === 'Secure' ? 'Clean' : newIssuesCount + ' issues found'}`,
            category: newCategory
        });

    } catch (error: any) {
        if (error.message === 'Global Timeout' || error.name === 'AbortError') {
            return NextResponse.json({ error: 'Timeout', message: 'Scan took too long.' }, { status: 504 });
        }
        console.error('Scan Error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    } finally {
        clearTimeout(timeoutId);
    }
}
