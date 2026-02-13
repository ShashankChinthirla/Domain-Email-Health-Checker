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
        const { domain, userId, userEmail } = body;

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

        // --- MONGODB INTEGRATION ---
        let dbEmail = null;
        try {
            const client = await clientPromise;
            const db = client.db("Test");
            const collection = db.collection("dfyinfrasetups");

            // 1. Find the existing document for this domain to get the user email (from schema)
            // CASE-INSENSITIVE SEARCH: Use regex to match regardless of capitalization
            const existingDoc = await collection.findOne({
                domain: { $regex: new RegExp(`^${cleanDomain}$`, "i") }
            });
            if (existingDoc) {
                // Prioritize top-level 'user' field as per instructions and sample data
                if ((existingDoc as any).user && (existingDoc as any).user.includes('@')) {
                    dbEmail = (existingDoc as any).user;
                }
                // Fallback to first contact email if 'user' isn't available
                else if ((existingDoc as any).contactDetails && (existingDoc as any).contactDetails.length > 0) {
                    dbEmail = (existingDoc as any).contactDetails[0].email;
                }
            }
        } catch (mongoError) {
            console.error('MongoDB Error:', mongoError);
        }

        return NextResponse.json({
            ...healthReport,
            dbEmail: dbEmail
        });

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
