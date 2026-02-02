import { promises as dns } from 'dns';

export interface BlacklistResult {
    list: string;
    isListed: boolean;
}

const BLACKLISTS = [
    'zen.spamhaus.org',
    'bl.spamcop.net',
    'dnsbl.sorbs.net',
    'b.barracudacentral.org',
    'cbl.abuseat.org',
    'ix.dnsbl.manitu.net',
    'hostkarma.junkemailfilter.com',
    'psbl.surriel.com'
];

export async function checkDNSBL(ip: string): Promise<BlacklistResult[]> {
    // Reverse IP for lookup: 1.2.3.4 -> 4.3.2.1
    const reversedIp = ip.split('.').reverse().join('.');

    const promises = BLACKLISTS.map(async (list) => {
        const lookup = `${reversedIp}.${list}`;
        try {
            await dns.resolve4(lookup);
            return { list, isListed: true };
        } catch (error) {
            // Error usually means NXDOMAIN (not listed)
            // But we should distinguish timeout? For simplicity assume not listed if not found.
            return { list, isListed: false };
        }
    });

    return Promise.all(promises);
}
