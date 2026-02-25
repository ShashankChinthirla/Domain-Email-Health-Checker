import { NextResponse } from 'next/server';
import clientPromise from '../lib/mongodb';

async function syncUsers() {
    console.log('Starting Cross-Collection User Synchronization...');
    try {
        const client = await clientPromise;
        const vercelDb = client.db('vercel');
        const testDb = client.db('test');

        const issueCollection = vercelDb.collection('issue_domains');
        const dfyCollection = testDb.collection('dfyinfrasetups');

        // We only need to sync domains that currently lack a valid mapped 'user'
        // Or we can just run it globally to ensure it's always up-to-date.
        // For daily chron performance, let's fetch all active dfyinfrasetups.

        console.log('Fetching active mappings from dfyinfrasetups...');
        const allSetups = await dfyCollection.find({}).toArray();
        console.log(`Found ${allSetups.length} setup documents.`);

        if (allSetups.length === 0) {
            console.log('No dfyinfrasetups found. Exiting.');
            process.exit(0);
        }

        let updatedCount = 0;
        const bulkOps: any[] = [];

        // Build a massive lookup map for O(1) matching
        const mappedUsersByDomain = new Map<string, string>();

        for (const setup of allSetups) {
            if (!setup.domain) continue;

            const domain = setup.domain.toLowerCase().trim();

            // Priority 1: Direct user email field
            if (setup.user && typeof setup.user === 'string' && setup.user.includes('@')) {
                mappedUsersByDomain.set(domain, setup.user);
                continue;
            }

            // Priority 2: Fallback to first contactDetails email
            if (setup.contactDetails && Array.isArray(setup.contactDetails) && setup.contactDetails.length > 0) {
                const firstContact = setup.contactDetails[0];
                if (firstContact && firstContact.email) {
                    mappedUsersByDomain.set(domain, firstContact.email);
                }
            }
        }

        console.log(`Successfully extracted ${mappedUsersByDomain.size} distinct user mappings. Propagating to issue_domains...`);

        // Now we fetch all issue_domains that MATCH these domains and need an update
        const domainsToUpdate = Array.from(mappedUsersByDomain.keys());

        const existingIssueDomains = await issueCollection.find({
            domain: { $in: domainsToUpdate }
        }).toArray();

        for (const issueDoc of existingIssueDomains) {
            const domain = issueDoc.domain.toLowerCase();
            const correctUser = mappedUsersByDomain.get(domain);

            // Only update if it's different or missing to save DB writes
            if (correctUser && issueDoc.user !== correctUser) {
                bulkOps.push({
                    updateOne: {
                        filter: { _id: issueDoc._id },
                        update: { $set: { user: correctUser } }
                    }
                });
            }
        }

        if (bulkOps.length > 0) {
            console.log(`Committing ${bulkOps.length} user synchronization updates to MongoDB...`);
            const result = await issueCollection.bulkWrite(bulkOps);
            updatedCount = result.modifiedCount;
            console.log(`✅ Successfully synced ${updatedCount} user mappings!`);
        } else {
            console.log('✅ All users are already perfectly synced. No updates needed.');
        }

        process.exit(0);

    } catch (error) {
        console.error('Fatal Error during user sync:', error);
        process.exit(1);
    }
}

syncUsers();
