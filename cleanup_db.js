const { MongoClient } = require('mongodb');
const fs = require('fs');
const path = require('path');

const envPath = path.resolve(__dirname, '.env.local');
const envContent = fs.readFileSync(envPath, 'utf8');
const match = envContent.match(/^MONGODB_URI=(.*)$/m);
const MONGODB_URI = match[1].trim().replace(/['"]/g, '');

async function run() {
    console.log("Connecting database...");
    const client = new MongoClient(MONGODB_URI);
    try {
        await client.connect();
        const db = client.db('vercel');
        const collection = db.collection('issue_domains');

        console.log("Deleting all 'Pending' / 'Needs_Scan' domains...");
        const result = await collection.deleteMany({ issueCategory: 'Needs_Scan' });
        console.log(`Successfully deleted ${result.deletedCount} domains.`);

    } catch (e) {
        console.error(e);
    } finally {
        await client.close();
    }
}
run();
