import { NextRequest, NextResponse } from 'next/server';
import clientPromise from '@/lib/mongodb';
import { isAdmin } from '@/lib/roles';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
    try {
        const searchParams = request.nextUrl.searchParams;
        const email = searchParams.get('email');

        if (!email) {
            return new NextResponse('Unauthorized access', { status: 401 });
        }

        const client = await clientPromise;
        const db = client.db('vercel');

        // Find the most recent report from the automation_reports collection
        const reportsCollection = db.collection('automation_reports');
        const latestReport = await reportsCollection.find().sort({ timestamp: -1 }).limit(1).toArray();

        if (!latestReport || latestReport.length === 0) {
            return NextResponse.json({ error: 'No automation report found.' }, { status: 404 });
        }

        const report = latestReport[0];

        // The field containing the filename based on the schema
        const filename = report.file_name || `automation_report_${new Date().toISOString().split('T')[0]}.xlsx`;

        // file_data contains the BSON Binary object
        const bsonBinaryData = report.file_data;

        // BSON Binary type has a .buffer property representing the underlying bytes
        const buffer = Buffer.isBuffer(bsonBinaryData)
            ? bsonBinaryData
            : bsonBinaryData?.buffer
                ? Buffer.from(bsonBinaryData.buffer) // If it's a BSON Binary type
                : Buffer.from(bsonBinaryData || '', 'base64'); // Fallback in case it ever saves as a plain base64 string

        return new NextResponse(buffer, {
            status: 200,
            headers: {
                'Content-Disposition': `attachment; filename="${filename}"`,
                'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            }
        });

    } catch (error) {
        console.error('Error fetching automation report:', error);
        return NextResponse.json({ error: 'Failed to fetch automation report' }, { status: 500 });
    }
}
