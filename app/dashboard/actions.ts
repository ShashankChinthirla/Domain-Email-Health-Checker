'use server';

import clientPromise from '@/lib/mongodb';
import { isAdmin } from '@/lib/roles';

export async function getDashboardMetrics(email: string, integrationId?: string) {
    try {
        if (!email) {
            return { success: false, error: "Unauthorized access" };
        }

        const client = await clientPromise;
        const db = client.db();

        const integrationsCount = await db.collection('integrations').countDocuments({ email });
        if (integrationsCount === 0) {
            return {
                totalDomains: 0,
                secureCount: 0,
                atRiskCount: 0,
                addedToday: 0,
                success: true
            };
        }

        const collection = db.collection('issue_domains');

        const baseFilter: Record<string, unknown> = { ownerUserId: email };
        if (integrationId && integrationId !== 'All') {
            baseFilter.integrationId = integrationId;
        }

        // Aggregate counts
        const totalDomains = await collection.countDocuments(baseFilter);
        const secureCount = await collection.countDocuments({ ...baseFilter, status: 'Secure' });
        const atRiskCount = totalDomains - secureCount;

        // Calculate 'Added Today' dynamically
        const oneDayAgo = new Date();
        oneDayAgo.setDate(oneDayAgo.getDate() - 1);

        const addedToday = await collection.countDocuments({
            ...baseFilter,
            createdAt: { $gte: oneDayAgo }
        });

        return {
            totalDomains,
            secureCount,
            atRiskCount,
            addedToday,
            success: true
        };
    } catch (error) {
        console.error("Error fetching metrics:", error);
        return { success: false, error: "Failed to fetch metrics" };
    }
}

export async function getPaginatedDomains(email: string, query = "", issueFilter = "", integrationId = "All", page = 1, limit = 50) {
    try {
        if (!email) {
            return { success: false, error: "Unauthorized access" };
        }

        const client = await clientPromise;
        const db = client.db();

        const integrationsCount = await db.collection('integrations').countDocuments({ email });
        if (integrationsCount === 0) {
            return {
                success: true,
                domains: [],
                totalCount: 0,
                totalPages: 1
            };
        }

        const collection = db.collection('issue_domains');

        const filter: Record<string, unknown> = { ownerUserId: email };

        if (integrationId && integrationId !== 'All') {
            filter.integrationId = integrationId;
        }

        if (query) {
            filter.domain = { $regex: query, $options: 'i' };
        }

        if (issueFilter && issueFilter !== 'All') {
            switch (issueFilter) {
                case 'Clean':
                    filter.status = 'Secure';
                    // also ensure it doesn't just show Needs_Scan under Clean, although Secure handles it
                    break;
                case 'Needs_Scan':
                    filter.issueCategory = 'Needs_Scan';
                    break;
                case 'blacklist_issue':
                    filter.$or = [{ issueCategory: 'blacklist_issue' }, { 'issues.blacklist': { $regex: 'ERROR|WARNING', $options: 'i' } }];
                    break;
                case 'http_issue':
                    filter.$or = [{ issueCategory: 'http_issue' }, { 'issues.web': { $regex: 'ERROR', $options: 'i' } }];
                    break;
                case 'No_SPF_AND_DMARC':
                    filter.$or = [{ issueCategory: 'No_SPF_AND_DMARC' }, { $and: [{ 'issues.spf': { $regex: 'No SPF record found', $options: 'i' } }, { 'issues.dmarc': { $regex: 'No DMARC record found', $options: 'i' } }] }];
                    break;
                case 'No_DMARC_Only':
                    filter.$or = [{ issueCategory: 'No_DMARC_Only' }, { $and: [{ 'issues.dmarc': { $regex: 'No DMARC record found', $options: 'i' } }, { 'issues.spf': { $not: { $regex: 'No SPF record found', $options: 'i' } } }] }];
                    break;
                case 'No_SPF_Only':
                    filter.$or = [{ issueCategory: 'No_SPF_Only' }, { $and: [{ 'issues.spf': { $regex: 'No SPF record found', $options: 'i' } }, { 'issues.dmarc': { $not: { $regex: 'No DMARC record found', $options: 'i' } } }] }];
                    break;
                case 'DKIM_Issues':
                    filter.$or = [{ issueCategory: 'DKIM_Issues' }, { 'issues.dkim': { $regex: 'ERROR', $options: 'i' } }];
                    break;
                case 'Multiple_SPF':
                    filter.$or = [{ issueCategory: 'Multiple_SPF' }, { 'issues.spf': { $regex: 'Multiple', $options: 'i' } }];
                    break;
                case 'Multiple_DMARC':
                    filter.$or = [{ issueCategory: 'Multiple_DMARC' }, { 'issues.dmarc': { $regex: 'Multiple', $options: 'i' } }];
                    break;
                case 'DMARC_Policy_None':
                    filter.$or = [{ issueCategory: 'DMARC_Policy_None' }, { 'issues.dmarc': { $regex: 'Policy.*none', $options: 'i' } }];
                    break;
                default:
                    filter.issueCategory = issueFilter;
            }
        }

        const skip = (page - 1) * limit;

        const [domains, totalCount] = await Promise.all([
            collection.find(filter).sort({ domain: 1 }).skip(skip).limit(limit).toArray(),
            collection.countDocuments(filter)
        ]);

        // Sanitize for Client Component (Strict pick to avoid Next.js serialization crashes with BSON objects / Stripe data)
        const sanitizedDomains = domains.map(d => ({
            _id: d._id.toString(),
            domain: d.domain || '',
            status: d.status || 'Warning',
            issuesDetected: d.issuesDetected || 0,
            timestamp: d.timestamp ? d.timestamp.toISOString() : null,
            user: typeof d.ownerUserId === 'string' ? d.ownerUserId : (d.user?.email || null),
            issueCategory: d.issueCategory || null,
            issues: d.issues || {}
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
