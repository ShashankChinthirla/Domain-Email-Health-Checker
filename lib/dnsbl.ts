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
            await resolve4(lookup);
            return { list, isListed: true };
        } catch {
            return { list, isListed: false };
        }
    });

    // Global 3s Timeout Race
    // If it takes longer than 3s, valid results are discarded and we return "Clean" (Pass)
    // to prevent user waiting.
    const timeoutPromise = new Promise<string>((resolve) =>
        setTimeout(() => resolve('TIMEOUT'), 3000)
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
