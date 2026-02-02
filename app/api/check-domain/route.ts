import { NextResponse } from 'next/server';
import { runFullHealthCheck } from '@/lib/test-engine';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { domain } = body;

        // Basic Validation
        if (!domain || typeof domain !== 'string' || !domain.includes('.')) {
            return NextResponse.json(
                { error: 'Invalid domain format' },
                { status: 400 }
            );
        }

        const cleanDomain = domain.trim().toLowerCase();

        // Perform Full Health Check
        const healthReport = await runFullHealthCheck(cleanDomain);

        return NextResponse.json(healthReport);

    } catch (error) {
        console.error('API Error:', error);
        return NextResponse.json(
            { error: 'Internal Server Error' },
            { status: 500 }
        );
    }
}
