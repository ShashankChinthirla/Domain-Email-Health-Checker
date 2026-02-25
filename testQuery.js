const { MongoClient } = require('mongodb');
async function test() {
    const db = (await MongoClient.connect('mongodb+srv://chinthirlashashank_db_user:ItC6D2hdRbxiXuaT@cluster0.gvk4eqd.mongodb.net/vercel?retryWrites=true&w=majority&appName=Cluster0')).db('vercel');
    try {
        const docs = await db.collection('issue_domains').find({
            'issues.spf': { $not: { $regex: 'No SPF record found', $options: 'i' } }
        }).limit(2).toArray();
        console.log("No SPF record found NOT length:", docs.length);
    } catch (e) {
        console.error(e);
    }
    process.exit(0);
}
test();
