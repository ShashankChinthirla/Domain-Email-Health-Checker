import { NextRequest, NextResponse } from 'next/server';
import clientPromise from '@/lib/mongodb';

export async function POST(request: NextRequest) {
    try {
        // Authenticate the webhook request
        const authHeader = request.headers.get('Authorization');
        // You should set a WEBHOOK_SECRET in your .env.local
        const EXPECTED_SECRET = process.env.WEBHOOK_SECRET;

        if (authHeader !== `Bearer ${EXPECTED_SECRET}`) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();

        // Validate required fields
        if (!body.domain || !body.status || !body.issueCategory) {
            return NextResponse.json({ error: 'Missing required fields: domain, status, issueCategory' }, { status: 400 });
        }

        const client = await clientPromise;
        const db = client.db();
        const collection = db.collection('issue_domains');

        // Construct the update document matching the exact schema from Excel
        const updateDoc: any = {
            $set: {
                domain: body.domain,
                user: body.user || null,
                score: body.score !== undefined ? body.score : null,
                healthStatus: body.healthStatus || null,
                status: body.status, // "Secure" or "At Risk"
                issueCategory: body.issueCategory || 'Clean', // e.g. "No_SPF_AND_DMARC"
                spfFull: body.spfFull || null,
                updatedSpfFull: body.updatedSpfFull || null,
                dmarcFull: body.dmarcFull || null,
                updatedDmarcFull: body.updatedDmarcFull || null,
                issuesDetected: body.issuesDetected || 0,
                timestamp: new Date() // Always update the timestamp when automation runs
            }
        };

        // If the python script passes specific issues (blacklist, dns, etc)
        if (body.issues) {
            updateDoc.$set.issues = body.issues;
        }

        // Upsert the domain document
        const result = await collection.updateOne(
            { domain: body.domain },
            updateDoc,
            { upsert: true }
        );

        return NextResponse.json({
            success: true,
            message: 'Domain updated successfully',
            upsertedId: result.upsertedId,
            modifiedCount: result.modifiedCount
        }, { status: 200 });

    } catch (error) {
        console.error('Webhook error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
