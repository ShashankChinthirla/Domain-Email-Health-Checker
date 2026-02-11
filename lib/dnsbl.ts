import { resolve4 } from './dns-cache';

export interface BlacklistResult {
    list: string;
    isListed: boolean;
}

// Critical Blacklists ONLY (Performance Optimized)
const BLACKLISTS = [
    'zen.spamhaus.org',
    'bl.spamcop.net',
    'b.barracudacentral.org'
];

export async function checkDNSBL(ip: string): Promise<BlacklistResult[]> {
    const reversedIp = ip.split('.').reverse().join('.');

    const checkPromises = BLACKLISTS.map(async (list) => {
        const lookup = `${reversedIp}.${list}`;
        try {
            // Use cached resolve4
            const resultIps = await resolve4(lookup);

            // Check specifically for Spamhaus return codes indicating "Blocked/Refused" (Rate Limited)
            // https://docs.spamhaus.com/dnsbl/docs/faq/dnsbl/return-codes
            // 127.255.255.0/24 are return codes for blocked queries, NOT listings.
            if (list === 'zen.spamhaus.org') {
                const isBlocked = resultIps.some(ip => ip.startsWith('127.255.255.'));
                if (isBlocked) return { list, isListed: false };
            }

            return { list, isListed: resultIps.length > 0 };
        } catch {
            return { list, isListed: false };
        }
    });

    // Global 8s Timeout Race
    // If it takes longer than 8s, valid results are discarded and we return "Clean" (Pass)
    // to prevent user waiting.
    const timeoutPromise = new Promise<string>((resolve) =>
        setTimeout(() => resolve('TIMEOUT'), 8000)
    );

    const result = await Promise.race([
        Promise.all(checkPromises),
        timeoutPromise
    ]);

    if (result === 'TIMEOUT') {
        // Fallback: Return all clean if timeout occurs
        return BLACKLISTS.map(list => ({ list, isListed: false }));
    }

    return result as BlacklistResult[];
}
