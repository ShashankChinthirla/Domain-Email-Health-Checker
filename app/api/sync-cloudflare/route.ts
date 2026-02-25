import { NextRequest, NextResponse } from 'next/server';
import clientPromise from '@/lib/mongodb';
import { isAdmin } from '@/lib/roles';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
    try {
        const payload = await request.json().catch(() => ({}));
        const email = payload.email;

        if (!(await isAdmin(email))) {
            return NextResponse.json({ error: 'Unauthorized access' }, { status: 403 });
        }

        const client = await clientPromise;
        const db = client.db('vercel');
        const collection = db.collection('issue_domains');

        const CLOUDFLARE_API_TOKEN = process.env.CLOUDFLARE_API_TOKEN;

        if (!CLOUDFLARE_API_TOKEN) {
            return NextResponse.json({ error: 'Cloudflare API token not configured.' }, { status: 500 });
        }

        let allCloudflareDomains: string[] = [];
        let page = 1;
        let hasMore = true;

        // 1. Fetch ALL domains from Cloudflare (Paginated - 500 at a time for max speed)
        while (hasMore) {
            const res = await fetch(`https://api.cloudflare.com/client/v4/zones?per_page=500&page=${page}`, {
                headers: {
                    'Authorization': `Bearer ${CLOUDFLARE_API_TOKEN}`,
                    'Content-Type': 'application/json'
                }
            });

            const data = await res.json();

            if (!res.ok || !data.success) {
                console.error("Cloudflare API Error:", data.errors);
                // If it fails on the first page, throw. Otherwise break and use what we have.
                if (page === 1) throw new Error('Failed to fetch from Cloudflare API');
                break;
            }

            const domainsOnPage = data.result.map((zone: any) => zone.name);
            allCloudflareDomains.push(...domainsOnPage);

            const totalPages = data.result_info.total_pages;
            if (page >= totalPages) {
                hasMore = false;
            } else {
                page++;
            }
        }

        // 2. Fetch all existing domains from MongoDB to compare
        const existingDocs = await collection.find({}, { projection: { domain: 1 } }).toArray();
        const existingDomainsSet = new Set(existingDocs.map(doc => doc.domain));

        // 3. Find the Delta (New domains in CF but not in DB)
        const newDomains = allCloudflareDomains.filter(domain => !existingDomainsSet.has(domain));

        // 4. Insert new domains into MongoDB
        if (newDomains.length > 0) {
            const docsToInsert = newDomains.map(domain => ({
                domain: domain,
                status: 'Pending',
                issueCategory: 'Needs_Scan',
                issuesDetected: 0,
                spfFull: null,
                dmarcFull: null,
                user: null, // Unknown until scanned
                healthStatus: 'Awaiting initial automation scan',
                timestamp: new Date(),
                createdAt: new Date()
            }));

            await collection.insertMany(docsToInsert);
        }

        return NextResponse.json({
            success: true,
            message: 'Cloudflare sync complete',
            totalCloudflareDomains: allCloudflareDomains.length,
            newDomainsAdded: newDomains.length,
            addedDomainsList: newDomains
        });

    } catch (error: any) {
        console.error('Error during Cloudflare sync:', error);
        return NextResponse.json({ error: error.message || 'Internal server error during sync' }, { status: 500 });
    }
}
