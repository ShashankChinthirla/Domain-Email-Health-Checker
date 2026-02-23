import { NextResponse } from 'next/server';
import clientPromise from '@/lib/mongodb';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const client = await clientPromise;
        const db = client.db('vercel'); // Matched to Python config.DB_NAME
        // Find the most recent report document
        const reportCollection = db.collection('automation_reports');

        const latestReport = await reportCollection.findOne(
            {},
            { sort: { timestamp: -1 } }
        );

        if (!latestReport) {
            return NextResponse.json({ error: 'No report found.' }, { status: 404 });
        }

        const { file_data, file_name, content_type } = latestReport;

        // file_data is stored as a BSON Binary object in MongoDB
        // We can extract its buffer
        // We can extract its buffer as a Uint8Array
        const buffer = new Uint8Array(file_data.buffer);

        const headers = new Headers();
        headers.set('Content-Disposition', `attachment; filename="${file_name || 'report.xlsx'}"`);
        headers.set('Content-Type', content_type || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');

        return new NextResponse(buffer, {
            status: 200,
            headers,
        });
    } catch (error) {
        console.error('Error fetching report from MongoDB:', error);
        return NextResponse.json({ error: 'Failed to download report' }, { status: 500 });
    }
}
