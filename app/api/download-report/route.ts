import { NextRequest, NextResponse } from 'next/server';
import clientPromise from '@/lib/mongodb';
import * as xlsx from 'xlsx';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
    try {
        const searchParams = request.nextUrl.searchParams;
        const issueFilter = searchParams.get('filter') || 'All';
        const query = searchParams.get('query') || '';

        const client = await clientPromise;
        const db = client.db('vercel');
        const collection = db.collection('issue_domains');

        const filter: any = {};

        if (query) {
            filter.domain = { $regex: query, $options: 'i' };
        }

        if (issueFilter && issueFilter !== 'All') {
            filter.issueCategory = issueFilter;
        }

        // Fetch all matching domains for the report
        const domains = await collection.find(filter).sort({ domain: 1 }).toArray();

        // Format data for Excel
        const data = domains.map(d => ({
            Domain: d.domain,
            Status: d.status,
            'Issue Category': d.issueCategory || 'Clean',
            'Issues Detected': d.issuesDetected,
            'SPF Record': d.updatedSpfFull || d.spfFull || 'N/A',
            'DMARC Record': d.updatedDmarcFull || d.dmarcFull || 'N/A',
            'Last Scanned': d.timestamp ? new Date(d.timestamp).toISOString() : 'Unknown'
        }));

        if (data.length === 0) {
            // Provide an empty sheet with headers if no results
            data.push({
                Domain: 'No domains matched the filter.',
                Status: '',
                'Issue Category': '',
                'Issues Detected': 0,
                'SPF Record': '',
                'DMARC Record': '',
                'Last Scanned': ''
            });
        }

        // Generate Excel Workbook
        const worksheet = xlsx.utils.json_to_sheet(data);
        const workbook = xlsx.utils.book_new();
        xlsx.utils.book_append_sheet(workbook, worksheet, "Fleet Report");

        // Write to buffer
        const buffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });

        const filename = `DomainGuard_Report_${issueFilter === 'All' ? 'Full_Fleet' : issueFilter}.xlsx`;

        return new NextResponse(buffer, {
            status: 200,
            headers: {
                'Content-Disposition': `attachment; filename="${filename}"`,
                'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            }
        });

    } catch (error) {
        console.error('Error generating report:', error);
        return NextResponse.json({ error: 'Failed to generate report' }, { status: 500 });
    }
}
