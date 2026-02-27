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
        const allNewDomainsAdded: string[] = [];

        // 1. Process all integrations in parallel
        await Promise.all(integrations.map(async (integration) => {
            const encryptedKey = integration.encryptedApiKey;
            const apiToken = decryptApiKey(encryptedKey);

            if (!apiToken) {
                console.error(`Failed to decrypt API key for integration ${integration.label}`);
                return;
            }

            const allCloudflareDomains: string[] = [];

            // 1a. Fetch Page 1 to get Total Pages
            const firstPageRes = await fetch(`https://api.cloudflare.com/client/v4/zones?per_page=500&page=1`, {
                headers: { 'Authorization': `Bearer ${apiToken}`, 'Content-Type': 'application/json' }
            });
            const firstPageData = await firstPageRes.json();

            if (!firstPageRes.ok || !firstPageData.success) {
                console.error("Cloudflare API Error on Page 1:", firstPageData.errors);
                return;
            }

            allCloudflareDomains.push(...firstPageData.result.map((zone: { name: string }) => zone.name));
            const totalPages = firstPageData.result_info?.total_pages || 1;

            // 1b. Fetch remaining pages IN PARALLEL
            if (totalPages > 1) {
                const pagePromises = [];
                for (let p = 2; p <= totalPages; p++) {
                    pagePromises.push(
                        fetch(`https://api.cloudflare.com/client/v4/zones?per_page=500&page=${p}`, {
                            headers: { 'Authorization': `Bearer ${apiToken}`, 'Content-Type': 'application/json' }
                        }).then(r => r.json())
                    );
                }

                const pageResults = await Promise.all(pagePromises);
                for (const pg of pageResults) {
                    if (pg.success) {
                        allCloudflareDomains.push(...pg.result.map((zone: { name: string }) => zone.name));
                    }
                }
            }

            totalCloudflareDomainsCount += allCloudflareDomains.length;

            if (allCloudflareDomains.length === 0) return;

            // 2. Fetch existing from MongoDB for THIS user
            const existingDocs = await domainsCollection.find(
                { domain: { $in: allCloudflareDomains }, ownerUserId: email },
                { projection: { domain: 1 } }
            ).toArray();

            const existingDomainsSet = new Set(existingDocs.map(doc => doc.domain));

            // 3. Find Delta
            const newDomains = allCloudflareDomains.filter(domain => !existingDomainsSet.has(domain));

            // 4. Insert new domains
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

                await domainsCollection.insertMany(docsToInsert, { ordered: false });
                totalNewInserted += newDomains.length;
                allNewDomainsAdded.push(...newDomains);
            }
        }));

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
