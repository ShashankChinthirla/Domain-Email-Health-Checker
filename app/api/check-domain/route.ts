import { NextResponse } from 'next/server';
import { runFullHealthCheck } from '@/lib/test-engine';
import clientPromise from '@/lib/mongodb';

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

        // 1. RUN ORIGINAL TEST LOGIC (Exactly as it was)
        // This ensures HTTP and internal timeouts are handled by the engine normally
        const healthReport = await Promise.race([
            runFullHealthCheck(cleanDomain),
            new Promise<never>((_, reject) =>
                setTimeout(() => reject(new Error('Global Timeout')), GLOBAL_TIMEOUT_MS - 500)
            )
        ]);

        // 2. FETCH MONGODB EMAIL (Simple, separate step)
        let dbEmail = null;
        try {
            const client = await clientPromise;
            // Database: "vercel", Collection: "dfyinfrasetups" (from your screenshot)
            const db = client.db("vercel");
            const collection = db.collection("dfyinfrasetups");

            // Search for the domain (case-insensitive)
            const doc = await collection.findOne({
                domain: { $regex: new RegExp(`^${cleanDomain}$`, "i") }
            });

            if (doc) {
                // Priority: 'user' field, then first contact email
                dbEmail = (doc as any).user || (doc as any).contactDetails?.[0]?.email || null;
            }
        } catch (mongoError) {
            console.error("MongoDB fetch failed (optional):", mongoError);
        }

        return NextResponse.json({
            ...healthReport,
            dbEmail: dbEmail
        });

    } catch (error: any) {
        if (error.message === 'Global Timeout' || error.name === 'AbortError') {
            return NextResponse.json({
                error: 'Timeout',
                message: 'The health check exceeded execution limits. Please try again.',
                status: 'partial'
            }, { status: 200 });
        }
        console.error('API Error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    } finally {
        clearTimeout(timeoutId);
    }
}
