import { NextRequest, NextResponse } from 'next/server';
import clientPromise from '@/lib/mongodb';
import { decryptApiKey } from '@/lib/encryption';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
    try {
        const payload = await request.json().catch(() => ({}));
        const email = payload.email;

        if (!email) {
            return NextResponse.json({ error: 'Unauthorized access' }, { status: 401 });
        }

        const client = await clientPromise;
        const db = client.db('vercel');
        const domainsCollection = db.collection('issue_domains');
        const integrationsCollection = db.collection('integrations');

        const integrations = await integrationsCollection.find({
            email: email,
            provider: 'cloudflare'
        }).toArray();

        if (integrations.length === 0) {
            return NextResponse.json({ error: 'No Cloudflare integrations found.' }, { status: 404 });
        }

        let totalNewInserted = 0;
        let totalCloudflareDomainsCount = 0;
        const allNewDomainsAdded = [];

        for (const integration of integrations) {
            const encryptedKey = integration.encryptedApiKey;
            const apiToken = decryptApiKey(encryptedKey);

            if (!apiToken) {
                console.error(`Failed to decrypt API key for integration ${integration.label}`);
                continue;
            }

            const allCloudflareDomains: string[] = [];
            let page = 1;
            let hasMore = true;

            // 1. Fetch ALL domains from Cloudflare for this integration
            while (hasMore) {
                const res = await fetch(`https://api.cloudflare.com/client/v4/zones?per_page=500&page=${page}`, {
                    headers: {
                        'Authorization': `Bearer ${apiToken}`,
                        'Content-Type': 'application/json'
                    }
                });

                const data = await res.json();

                if (!res.ok || !data.success) {
                    console.error("Cloudflare API Error:", data.errors);
                    break;
                }

                const domainsOnPage = data.result.map((zone: { name: string }) => zone.name);
                allCloudflareDomains.push(...domainsOnPage);

                const totalPages = data.result_info?.total_pages || 1;
                if (page >= totalPages) {
                    hasMore = false;
                } else {
                    page++;
                }
            }

            totalCloudflareDomainsCount += allCloudflareDomains.length;

            if (allCloudflareDomains.length === 0) {
                continue;
            }

            // 2. Fetch existing from MongoDB for THIS user
            const existingDocs = await domainsCollection.find(
                { domain: { $in: allCloudflareDomains }, ownerUserId: email },
                { projection: { domain: 1 } }
            ).toArray();

            const existingDomainsSet = new Set(existingDocs.map(doc => doc.domain));

            // 3. Find Delta (Domains this user doesn't already have linked)
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
                    user: email,
                    ownerUserId: email,
                    integrationId: integration.id,
                    healthStatus: 'Awaiting initial automation scan',
                    timestamp: new Date(),
                    createdAt: new Date()
                }));

                await domainsCollection.insertMany(docsToInsert);
                totalNewInserted += newDomains.length;
                allNewDomainsAdded.push(...newDomains);
            }
        }

        return NextResponse.json({
            success: true,
            message: 'Cloudflare sync complete',
            totalCloudflareDomains: totalCloudflareDomainsCount,
            newDomainsAdded: totalNewInserted,
            addedDomainsList: allNewDomainsAdded
        });

    } catch (error: unknown) {
        console.error('Error during Cloudflare sync:', error);
        return NextResponse.json({ error: error instanceof Error ? error.message : 'Internal server error during sync' }, { status: 500 });
    }
}
