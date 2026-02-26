const { MongoClient } = require('mongodb');
const fs = require('fs');

const envContent = fs.readFileSync('.env.local', 'utf8');
const match = envContent.match(/^MONGODB_URI=(.*)$/m);
const MONGODB_URI = match[1].trim().replace(/['"]/g, '');

async function run() {
    console.log("Connecting database...");
    const client = new MongoClient(MONGODB_URI);
    await client.connect();
    const db = client.db('vercel');

    console.log("Counting domains grouped by ownerUserId...");
    const counts = await db.collection('issue_domains').aggregate([
        { $group: { _id: "$ownerUserId", count: { $sum: 1 } } }
    ]).toArray();

    console.dir(counts);

    console.log("Counting domains grouped by user...");
    const userCounts = await db.collection('issue_domains').aggregate([
        { $group: { _id: "$user", count: { $sum: 1 } } }
    ]).toArray();

    console.dir(userCounts);

    client.close();
}
run();
