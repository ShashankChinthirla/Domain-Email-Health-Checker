/* eslint-disable @typescript-eslint/no-explicit-any */
import { MongoClient } from 'mongodb';
import { runFullHealthCheck } from '../lib/test-engine';
import * as fs from 'fs';
import * as path from 'path';

// Extract MONGODB_URI manually to avoid needing dotenv dependency
const envPath = path.resolve(__dirname, '../.env.local');
let MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/vercel';
if (!process.env.MONGODB_URI && fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    const match = envContent.match(/^MONGODB_URI=(.*)$/m);
    if (match) {
        MONGODB_URI = match[1].trim().replace(/['"]/g, '');
    }
}

// Helpers for Categorization
function determineIssueCategory(report: any): string {
    const categories = report.categories || {};

    const spfTests = categories['spf']?.tests || [];
    const dmarcTests = categories['dmarc']?.tests || [];
    const dkimTests = categories['dkim']?.tests || [];
    const webTests = categories['webServer']?.tests || [];
    const blacklistTests = categories['blacklist']?.tests || [];
    const dnsTests = categories['dns']?.tests || [];

    // Safeguard: If core tests failed to load due to network timeouts, skip the domain entirely
    const coreFailedToLoad = [...dnsTests, ...spfTests, ...dmarcTests, ...dkimTests].some((t: any) =>
        t.info === 'Timed Out' || t.info === 'Timeout'
    );

    if (coreFailedToLoad) {
        return 'SYSTEM_TIMEOUT';
    }

    // Must definitively say "Missing", not "DNS Error"
    const missingSpf = spfTests.some((t: any) => t.name?.includes('Record Found') && t.status === 'Error' && t.info === 'Missing');
    const missingDmarc = dmarcTests.some((t: any) => t.name?.includes('Record Found') && t.status === 'Error' && t.info === 'Missing');
    const multipleSpf = spfTests.some((t: any) => t.name?.includes('Multiple') && t.status === 'Error');
    const multipleDmarc = dmarcTests.some((t: any) => t.name?.includes('Multiple') && t.status === 'Error');
    const dmarcNone = dmarcTests.some((t: any) => t.name?.includes('Policy') && t.info?.toLowerCase().includes('none'));

    const dkimErrors = dkimTests.filter((t: any) => t.status === 'Error');

    // Prioritize Email Deliverability Issues Above Everything Else
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

const delay = (ms: number) => new Promise(res => setTimeout(res, ms));

async function processDomainWithRetry(doc: any, collection: any): Promise<any> {
    const MAX_RETRIES = 3;
    let attempt = 0;

    while (attempt < MAX_RETRIES) {
        attempt++;
        try {
            const report = await runFullHealthCheck(doc.domain);
            const newCategory = determineIssueCategory(report);

            if (newCategory === 'SYSTEM_TIMEOUT') {
                console.log(`[TIMEOUT - RETRYING ${attempt}/${MAX_RETRIES}] ${doc.domain}`);
                if (attempt < MAX_RETRIES) {
                    await delay(5000 * attempt); // exponential backoff
                    continue;
                } else {
                    return { success: false, domain: doc.domain, error: 'TIMEOUT_AFTER_RETRIES' };
                }
            }

            const newIssuesCount = calculateIssuesCount(report);
            const newStatus = newCategory === 'Clean' ? 'Secure' : 'At Risk';

            const spfRecord = report.rawSpf || doc.spfFull;
            const dmarcRecord = report.rawDmarc || doc.dmarcFull;

            await collection.updateOne(
                { _id: doc._id },
                {
                    $set: {
                        issueCategory: newCategory,
                        status: newStatus,
                        issuesDetected: newIssuesCount,
                        spfFull: spfRecord?.startsWith('v=') ? spfRecord : doc.spfFull,
                        dmarcFull: dmarcRecord?.startsWith('v=') ? dmarcRecord : doc.dmarcFull,
                    }
                }
            );
            return { success: true, domain: doc.domain, oldCat: doc.issueCategory, newCat: newCategory };

        } catch (error) {
            console.error(`[ERROR - RETRYING ${attempt}/${MAX_RETRIES}] ${doc.domain}:`, error);
            if (attempt < MAX_RETRIES) {
                await delay(5000 * attempt);
            } else {
                return { success: false, domain: doc.domain, error };
            }
        }
    }
}

async function processBatch(documents: any[], collection: any) {
    const promises = documents.map(doc => processDomainWithRetry(doc, collection));
    return await Promise.all(promises);
}

async function runRescan() {
    console.log('Connecting to MongoDB...');
    const client = new MongoClient(MONGODB_URI);

    try {
        await client.connect();
        console.log('Connected.');
        const db = client.db('vercel');
        const collection = db.collection('issue_domains');

        const scanAll = process.argv.includes('--all');
        const scanNew = process.argv.includes('--new');

        let query: Record<string, unknown>;
        if (scanNew) {
            query = { issueCategory: 'Needs_Scan' };
        } else if (scanAll) {
            query = { issueCategory: { $ne: 'Needs_Scan' } };
        } else {
            query = { issueCategory: { $nin: ['Clean', 'Needs_Scan'] } };
        }

        const userArgIndex = process.argv.indexOf('--user');
        if (userArgIndex !== -1 && process.argv.length > userArgIndex + 1) {
            query.ownerUserId = process.argv[userArgIndex + 1];
        }

        const skipArgIndex = process.argv.indexOf('--skip');
        const skipCount = skipArgIndex !== -1 ? parseInt(process.argv[skipArgIndex + 1], 10) : 0;

        const totalToScan = await collection.countDocuments(query);
        const scanTypeText = scanNew ? 'NEW DOMAINS ONLY' : (scanAll ? 'ALL DOMAINS' : 'TARGETED FIX');
        console.log(`\nFound ${totalToScan} domains for evaluation (${scanTypeText}). Skipping first ${skipCount}.\n`);

        const cursor = collection.find(query).skip(skipCount);

        let processed = skipCount;
        const BATCH_SIZE = 50; // Massively increased concurrency for 10k domains in 5 mins
        let batch = [];

        while (await cursor.hasNext()) {
            const doc = await cursor.next();
            batch.push(doc);

            if (batch.length >= BATCH_SIZE) {
                const results = await processBatch(batch, collection);
                processed += batch.length;

                results.forEach((r: any) => {
                    if (r.success) {
                        if (r.oldCat !== r.newCat) {
                            console.log(`[UPDATED] ${r.domain} : ${r.oldCat} -> ${r.newCat}`);
                        } else {
                            console.log(`[VERIFIED] ${r.domain} remains ${r.newCat}`);
                        }
                    } else if (!r.success && r.error === 'TIMEOUT_AFTER_RETRIES') {
                        console.log(`[SKIPPED - FAILED AFTER 3 RETRIES] ${r.domain} (Timeout Error)`);
                    } else {
                        console.log(`[FAILED] ${r.domain} : ${r.error}`);
                    }
                });

                console.log(`Progress: ${processed} / ${totalToScan} (${Math.round((processed / totalToScan) * 100)}%)`);
                batch = [];
            }
        }

        if (batch.length > 0) {
            const results = await processBatch(batch, collection);
            processed += batch.length;
            results.forEach((r: any) => {
                if (r.success) {
                    if (r.oldCat !== r.newCat) {
                        console.log(`[UPDATED] ${r.domain} : ${r.oldCat} -> ${r.newCat}`);
                    } else {
                        console.log(`[VERIFIED] ${r.domain} remains ${r.newCat}`);
                    }
                } else if (!r.success && r.error === 'TIMEOUT_AFTER_RETRIES') {
                    console.log(`[SKIPPED - FAILED AFTER 3 RETRIES] ${r.domain} (Timeout Error)`);
                } else {
                    console.log(`[FAILED] ${r.domain} : ${r.error}`);
                }
            });
            console.log(`Progress: ${processed} / ${totalToScan} (100%)`);
        }

        console.log('\n✅ Database Rescan Complete!');

    } catch (error) {
        console.error('Fatal Error:', error);
    } finally {
        await client.close();
        process.exit(0);
    }
}

runRescan();
