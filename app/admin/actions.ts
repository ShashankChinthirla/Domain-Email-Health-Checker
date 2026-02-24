'use server';

import clientPromise from '@/lib/mongodb';

export async function getAdminMetrics() {
    try {
        const client = await clientPromise;
        const db = client.db();
        const collection = db.collection('issue_domains');

        // Aggregate counts
        const totalDomains = await collection.countDocuments();
        const secureCount = await collection.countDocuments({ status: 'Secure' });
        const atRiskCount = totalDomains - secureCount;

        // "Added Today" - simple mock or calculate based on timestamps if available
        // For now we'll derive it from domains added in last 24h if we had real creation dates.
        // Since we just seeded them all today, querying by date might just return 12000.
        // We'll just return a dynamic baseline for demo 
        return {
            totalDomains,
            secureCount,
            atRiskCount,
            addedToday: 12, // Example fixed or calculated
            success: true
        };
    } catch (error) {
        console.error("Error fetching metrics:", error);
        return { success: false, error: "Failed to fetch metrics" };
    }
}

export async function getPaginatedDomains(query = "", issueFilter = "", page = 1, limit = 50) {
    try {
        const client = await clientPromise;
        const db = client.db();
        const collection = db.collection('issue_domains');

        const filter: any = {};

        if (query) {
            filter.domain = { $regex: query, $options: 'i' };
        }

        if (issueFilter && issueFilter !== 'All') {
            filter.issueCategory = issueFilter;
        }

        const skip = (page - 1) * limit;

        const [domains, totalCount] = await Promise.all([
            collection.find(filter).sort({ domain: 1 }).skip(skip).limit(limit).toArray(),
            collection.countDocuments(filter)
        ]);

        // Sanitize _id for Client Component
        const sanitizedDomains = domains.map(d => ({
            ...d,
            _id: d._id.toString(),
            timestamp: d.timestamp ? d.timestamp.toISOString() : null
        }));

        return {
            success: true,
            domains: sanitizedDomains,
            totalCount,
            totalPages: Math.ceil(totalCount / limit)
        };
    } catch (error) {
        console.error("Error fetching domains:", error);
        return { success: false, error: "Failed to fetch domains" };
    }
}
