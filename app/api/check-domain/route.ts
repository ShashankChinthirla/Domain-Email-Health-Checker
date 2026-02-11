import { NextResponse } from 'next/server';
import { runFullHealthCheck } from '@/lib/test-engine';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
    // 9-second fail-safe for Vercel Hobby (10s limit)
    const GLOBAL_TIMEOUT_MS = 9000;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), GLOBAL_TIMEOUT_MS);

    try {
        const body = await request.json();
        const { domain } = body;

        if (!domain || typeof domain !== 'string' || !domain.includes('.')) {
            return NextResponse.json({ error: 'Invalid domain format' }, { status: 400 });
        }

        const cleanDomain = domain.trim().toLowerCase();

        // Race the health check against the global timer
        const healthReport = await Promise.race([
            runFullHealthCheck(cleanDomain),
            new Promise<never>((_, reject) =>
                setTimeout(() => reject(new Error('Global Timeout')), GLOBAL_TIMEOUT_MS - 500)
            )
        ]);

        return NextResponse.json(healthReport);

    } catch (error: any) {
        if (error.message === 'Global Timeout' || error.name === 'AbortError') {
            return NextResponse.json({
                error: 'Timeout',
                message: 'The health check exceeded Vercel execution limits. Please try a single check or a shorter list.',
                status: 'partial'
            }, { status: 200 }); // Return 200 so UI can handle partial/failed state gracefully
        }
        console.error('API Error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    } finally {
        clearTimeout(timeoutId);
    }
}
