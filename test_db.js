require('dotenv').config({ path: '.env.local' });
const { MongoClient } = require('mongodb');

async function run() {
    const uri = process.env.MONGODB_URI;
    if (!uri) {
        console.error("Error: MONGODB_URI not found in environment variables");
        process.exit(1);
    }

    const client = new MongoClient(uri);
    try {
        await client.connect();
        const db = client.db('vercel');
        const docs = await db.collection('issue_domains')
            .find({ status: { $ne: 'Secure' } })
            .limit(2)
            .toArray();

        const fs = require('fs');
        fs.writeFileSync('samples.json', JSON.stringify(docs, null, 2));
        console.log("Successfully wrote samples.json");
    } finally {
        await client.close();
    }
}

run().catch(console.dir);
