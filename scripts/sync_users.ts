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

        // Build a massive lookup map for O(1) matching. Store the whole document payload for rich syncing.
        const mappedDataByDomain = new Map<string, any>();

        for (const setup of allSetups) {
            if (!setup.domain) continue;
            const domain = setup.domain.toLowerCase().trim();

            let bestUser = null;

            // Priority 1: Direct user email field
            if (setup.user && typeof setup.user === 'string' && setup.user.includes('@')) {
                bestUser = setup.user;
            } else if (setup.contactDetails && Array.isArray(setup.contactDetails) && setup.contactDetails.length > 0) {
                // Priority 2: Fallback to first contactDetails email
                const firstContact = setup.contactDetails[0];
                if (firstContact && firstContact.email) {
                    bestUser = firstContact.email;
                }
            }

            // Store the rich payload mapped to the domain
            mappedDataByDomain.set(domain, {
                user: bestUser,
                contactDetails: setup.contactDetails || [],
                purchaseTxnId: setup.purchaseTxnId || null,
                startDate: setup.startDate || null,
                endDate: setup.endDate || null,
                forwardDomain: setup.forwardDomain || null
            });
        }

        console.log(`Successfully extracted ${mappedDataByDomain.size} distinct domain payloads. Propagating to issue_domains...`);

        // Now we fetch all issue_domains that MATCH these domains and need an update
        const domainsToUpdate = Array.from(mappedDataByDomain.keys());

        const existingIssueDomains = await issueCollection.find({
            domain: { $in: domainsToUpdate }
        }).toArray();

        for (const issueDoc of existingIssueDomains) {
            const domain = issueDoc.domain.toLowerCase();
            const richData = mappedDataByDomain.get(domain);

            if (richData) {
                // We always explicitly push the most up-to-date rich data from dfyinfrasetups.
                // It's a chron job, so overwriting ensures dates/contacts never drift out of sync.
                const updatePayload: any = {
                    updatedAt: new Date()
                };

                if (richData.user) updatePayload.user = richData.user;
                if (richData.contactDetails.length > 0) updatePayload.contactDetails = richData.contactDetails;
                if (richData.purchaseTxnId) updatePayload.purchaseTxnId = richData.purchaseTxnId;
                if (richData.startDate) updatePayload.startDate = richData.startDate;
                if (richData.endDate) updatePayload.endDate = richData.endDate;
                if (richData.forwardDomain) updatePayload.forwardDomain = richData.forwardDomain;

                // Only append to bulk Ops if there's actual new stuff to write
                if (Object.keys(updatePayload).length > 1) { // >1 because updatedAt is always there
                    bulkOps.push({
                        updateOne: {
                            filter: { _id: issueDoc._id },
                            update: { $set: updatePayload }
                        }
                    });
                }
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
