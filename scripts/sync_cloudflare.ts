import { NextResponse } from 'next/server';
import clientPromise from '../lib/mongodb';

async function runSync() {
    console.log('Starting Cloudflare Sync...');
    try {
        const client = await clientPromise;
        const db = client.db('vercel');
        const collection = db.collection('issue_domains');

        const CLOUDFLARE_API_TOKEN = process.env.CLOUDFLARE_API_TOKEN;

        if (!CLOUDFLARE_API_TOKEN) {
            console.error('Cloudflare API token not configured.');
            process.exit(1);
        }

        let allCloudflareDomains: string[] = [];
        let page = 1;
        let hasMore = true;

        // 1. Fetch ALL domains from Cloudflare
        while (hasMore) {
            console.log(`Fetching CF Page ${page}...`);
            const res = await fetch(`https://api.cloudflare.com/client/v4/zones?per_page=500&page=${page}`, {
                headers: {
                    'Authorization': `Bearer ${CLOUDFLARE_API_TOKEN}`,
                    'Content-Type': 'application/json'
                }
            });

            const data = await res.json();

            if (!res.ok || !data.success) {
                console.error("Cloudflare API Error:", data.errors);
                if (page === 1) process.exit(1);
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

        // 2. Fetch existing from MongoDB
        const existingDocs = await collection.find({}, { projection: { domain: 1 } }).toArray();
        const existingDomainsSet = new Set(existingDocs.map(doc => doc.domain));

        // 3. Find Delta
        const newDomains = allCloudflareDomains.filter(domain => !existingDomainsSet.has(domain));

        // 4. Insert into MongoDB
        if (newDomains.length > 0) {
            console.log(`Discovered ${newDomains.length} new domains! Inserting into DB...`);
            const docsToInsert = newDomains.map(domain => ({
                domain: domain,
                status: 'Pending',
                issueCategory: 'Needs_Scan',
                issuesDetected: 0,
                spfFull: null,
                dmarcFull: null,
                user: null,
                healthStatus: 'Awaiting initial automation scan',
                timestamp: new Date(),
                createdAt: new Date()
            }));

            await collection.insertMany(docsToInsert);
        } else {
            console.log('No new domains found in Cloudflare today.');
        }

        console.log('Sync Complete.');
        process.exit(0);

    } catch (error) {
        console.error('Fatal Error during sync:', error);
        process.exit(1);
    }
}

runSync();
