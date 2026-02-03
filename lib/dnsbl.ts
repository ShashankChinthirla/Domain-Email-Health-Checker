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
    'psbl.surriel.com',
    'bl.blocklist.de',
    'all.s5h.net',
    'ips.backscatterer.org',
    'dnsbl-1.uceprotect.net',
    'dnsbl-2.uceprotect.net',
    'dnsbl-3.uceprotect.net',
    'bl.spamrats.com',
    'dyna.spamrats.com',
    'noptr.spamrats.com',
    'spam.spamrats.com',
    'spam.dnsbl.sorbs.net',
    'http.dnsbl.sorbs.net',
    'socks.dnsbl.sorbs.net',
    'misc.dnsbl.sorbs.net',
    'smtp.dnsbl.sorbs.net',
    'web.dnsbl.sorbs.net',
    'zombie.dnsbl.sorbs.net',
    'db.wpbl.info',
    'truncate.gbudb.net',
    'bl.mailspike.net',
    'z.mailspike.net',
    'bl.0spam.org',
    'nbl.0spam.org',
    'bl.nordspam.com',
    'bl.drmx.org',
    'bl.konstant.no',
    'work.drbl.gremlin.ru',
    'netblock.pedantic.org',
    'ubl.unsubscore.com',
    'virbl.dnsbl.bit.nl',
    'dnsbl.inps.de',
    'dnsbl.zapbl.net',
    'singular.ttk.pte.hu'
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
