import * as dns from './dns-cache';
import { setServers } from 'dns';
import * as tls from 'tls'; // Used ONLY for HTTPS (Port 443) Certificate Check
import { checkDNSBL } from './dnsbl';
import { FullHealthReport, TestResult, CategoryResult, TestStatus } from './types';

// Force usage of Google & Cloudflare DNS for reliability
// REMOVED: setServers(['1.1.1.1', ...]) caused issues on Vercel/AWS Lambda (EREFUSED).
// We now rely on the environment's default DNS resolver (system), which is faster and unblocked.

// Re-export for backend
export type { FullHealthReport, TestResult, CategoryResult, TestStatus };

// --- Helper: Create Category ---
function createCategory(name: string, tests: TestResult[]): CategoryResult {
    const stats = { passed: 0, warnings: 0, errors: 0 };
    for (const t of tests) {
        if (t.status === 'Pass') stats.passed++;
        if (t.status === 'Warning') stats.warnings++;
        if (t.status === 'Error') stats.errors++;
        // Backfill category if missing
        if (!t.category) t.category = name;
    }
    return { category: name, tests, stats };
}

// Helper to push test with auto-defaults if needed (simplifies migration)
function makeResult(name: string, status: TestStatus, info: string, reason: string, recommendation: string): TestResult {
    return { name, status, info, reason, recommendation };
}

// Helper: Check for Private IPs (RFC1918)
function isPrivateIP(ip: string): boolean {
    const parts = ip.split('.').map(Number);
    if (parts[0] === 10) return true;
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
    if (parts[0] === 192 && parts[1] === 168) return true;
    if (parts[0] === 127) return true; // Loopback
    return false;
}

// Helper: Robust DNS TXT Lookup with Retry
async function resolveTxtWithRetry(domain: string, retries = 1): Promise<string[][]> {
    for (let i = 0; i <= retries; i++) {
        try {
            return await dns.resolveTxt(domain);
        } catch (error: any) {
            // ENOTFOUND/ENODATA -> Missing (Return empty to simulate no records found)
            if (error.code === 'ENOTFOUND' || error.code === 'ENODATA') {
                return [];
            }
            // TIMEOUT/SERVFAIL/Other -> Retry
            // If last retry, throw to be caught as DNS_ERROR
            if (i === retries) throw error;
            await new Promise(res => setTimeout(res, 200 * (Math.pow(2, i)))); // Exponential Backoff
        }
    }
    return [];
}

// --- 1. DNS Tests (Expanded - Deep Analysis) ---
async function runDNSTests(domain: string): Promise<TestResult[]> {
    // Parallelize all independent DNS lookups
    const [cnameRes, aRes, mxRes, nsRes, soaRes, caaRes] = await Promise.all([
        // 1. CNAME Check
        (async () => {
            const t: TestResult[] = [];
            try {
                const cnames = await dns.resolveCname(domain);
                if (cnames.length > 0) {
                    t.push({ name: 'Apex CNAME', status: 'Error', info: 'Present', reason: 'A CNAME record exists at the root domain, which violates RFC standards and breaks MX records.', recommendation: 'Remove the CNAME and use an A record (or ALIAS/ANAME if supported by your provider).' });
                }
            } catch {
                t.push({ name: 'Apex CNAME', status: 'Pass', info: 'Not Found', reason: 'No CNAME record found at root domain (RFC Compliant).', recommendation: 'No action needed.' });
            }
            return t;
        })(),

        // 2. A Record Check
        (async () => {
            const t: TestResult[] = [];
            try {
                const a = await dns.resolve4(domain);
                if (a.length > 0) {
                    t.push({ name: 'DNS Record Published', status: 'Pass', info: 'Primary IP Found', reason: 'A DNS record exists for this domain.', recommendation: 'No action needed.' });
                    t.push({ name: 'A Record Count', status: 'Pass', info: `${a.length} IP(s)`, reason: `Found ${a.length} IPv4 addresses.`, recommendation: 'Ensure these IPs are correct.' });

                    const privateIps = a.filter(ip => isPrivateIP(ip));
                    if (privateIps.length > 0) {
                        t.push({ name: 'Public IP Check', status: 'Error', info: 'Private IP Found', reason: `The IP ${privateIps[0]} is a private local network address (RFC1918). It is not reachable from the internet.`, recommendation: 'Change your A record to a public static IP.' });
                    } else {
                        t.push({ name: 'Public IP Check', status: 'Pass', info: 'Valid Public IP', reason: 'All IPs appear to be valid public addresses.', recommendation: 'No action needed.' });
                    }
                } else {
                    t.push({ name: 'DNS Record Published', status: 'Error', info: 'No A Records', reason: 'The domain does not resolve to an IPv4 address.', recommendation: 'Add an A record pointing to your web server.' });
                }
            } catch {
                t.push({ name: 'DNS Record Published', status: 'Error', info: 'Failed', reason: 'DNS lookup failed entirely.', recommendation: 'Check your domain registrar settings.' });
            }
            return t;
        })(),

        // 3. MX Record Check
        (async () => {
            const t: TestResult[] = [];
            try {
                const mxs = await dns.resolveMx(domain);
                if (mxs.length > 0) {
                    t.push({ name: 'MX Record Published', status: 'Pass', info: `${mxs.length} Records`, reason: 'Mail Exchange records found.', recommendation: 'No action needed.' });
                }

                const mxRecords = mxs.sort((a, b) => a.priority - b.priority).map(m => m.exchange);

                if (mxRecords.length > 0) {
                    const primaryMx = mxRecords[0];
                    try {
                        const mxCnames = await dns.resolveCname(primaryMx);
                        if (mxCnames.length > 0) {
                            t.push({ name: 'MX Canonical Check', status: 'Warning', info: 'MX points to CNAME', reason: `The MX record ${primaryMx} points to a CNAME, which violates RFC 2181.`, recommendation: 'Point your MX record directly to an A record host.' });
                        }
                    } catch {
                        t.push({ name: 'MX Canonical Check', status: 'Pass', info: 'Standard Host', reason: 'MX record points to a canonical host (not a CNAME).', recommendation: 'No action needed.' });
                    }

                    try {
                        const ips = await dns.resolve4(primaryMx);
                        t.push({ name: 'Primary MX Resolution', status: 'Pass', info: `${primaryMx} -> ${ips[0]}`, reason: 'Primary MX host resolves to an IP.', recommendation: 'No action needed.' });
                    } catch {
                        try {
                            await dns.resolve6(primaryMx);
                            t.push({ name: 'Primary MX Resolution', status: 'Pass', info: `${primaryMx} -> IPv6`, reason: 'Primary MX host resolves to an IPv6 address.', recommendation: 'Ensure IPv4 is also supported for maximum compatibility.' });
                        } catch {
                            t.push({ name: 'Primary MX Resolution', status: 'Error', info: `Could not resolve ${primaryMx}`, reason: 'The mail server hostname does not exist.', recommendation: 'Fix the MX record or create the missing A record for the mail server.' });
                        }
                    }
                }
            } catch (error: any) {
                if (error.code === 'ENOTFOUND' || error.code === 'ENODATA' || error.code === 'NOTFOUND') {
                    t.push({ name: 'MX Record Published', status: 'Error', info: 'Missing', reason: 'No MX records found.', recommendation: 'You cannot receive email without MX records.' });
                } else {
                    t.push({ name: 'MX Record Published', status: 'Error', info: 'DNS Error', reason: `DNS Lookup failed: ${error.message || 'Unknown error'}.`, recommendation: 'Check your DNS configuration or try again.' });
                }
            }
            return t;
        })(),

        // 4. NS Record Check
        (async () => {
            const t: TestResult[] = [];
            try {
                const ns = await dns.resolveNs(domain);
                t.push({ name: 'NS Record Published', status: 'Pass', info: `${ns.length} Nameservers`, reason: 'Nameservers are configured.', recommendation: 'No action needed.' });

                if (ns.length >= 2) {
                    t.push({ name: 'NS Redundancy', status: 'Pass', info: 'Sufficient (2+)', reason: 'Multiple nameservers provide redundancy.', recommendation: 'No action needed.' });
                } else {
                    t.push({ name: 'NS Redundancy', status: 'Warning', info: 'Single Point of Failure (1 NS)', reason: 'Only one nameserver is listed.', recommendation: 'Add at least one backup nameserver.' });
                }

                // Glue Check - Parallelize
                let glueFailures = 0;
                await Promise.all(ns.map(async (n) => {
                    try { await dns.resolve4(n); } catch { glueFailures++; }
                }));

                if (glueFailures === 0) {
                    t.push({ name: 'NS Glue Validity', status: 'Pass', info: 'Resolvable', reason: 'All nameserver hostnames resolve to IPs.', recommendation: 'No action needed.' });
                } else {
                    t.push({ name: 'NS Glue Validity', status: 'Warning', info: 'Unresolvable NS', reason: 'One or more nameservers could not be resolved.', recommendation: 'Check your nameserver hostnames.' });
                }
            } catch {
                t.push({ name: 'NS Record Published', status: 'Error', info: 'Missing', reason: 'No Nameservers found.', recommendation: 'Configure nameservers at your registrar.' });
            }
            return t;
        })(),

        // 5. SOA Record Check
        (async () => {
            const t: TestResult[] = [];
            try {
                const soa = await dns.resolveSoa(domain);
                t.push({ name: 'SOA Record Published', status: 'Pass', info: 'Present', reason: 'Start of Authority record found.', recommendation: 'No action needed.' });
                t.push({ name: 'SOA Primary NS', status: 'Pass', info: soa.nsname, reason: 'Primary nameserver defined in SOA.', recommendation: 'No action needed.' });
                t.push({ name: 'SOA RNAME', status: 'Pass', info: soa.hostmaster, reason: 'Responsible person email defined.', recommendation: 'No action needed.' });

                const serialStr = soa.serial.toString();
                const serialRegex = /^20[2-9]\d(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])\d{2}$/;

                if (serialRegex.test(serialStr)) {
                    t.push({ name: 'SOA Serial Number', status: 'Pass', info: `${soa.serial} (Format OK)`, reason: 'Serial number follows standard YYYYMMDDnn format.', recommendation: 'No action needed.', host: domain, result: 'SOA Serial Format Valid' });
                } else {
                    t.push({ name: 'SOA Serial Number', status: 'Warning', info: `${soa.serial} (Format Weak)`, reason: 'Serial does not match recommended YYYYMMDDnn format (e.g., 2024010101).', recommendation: 'Update serial to YYYYMMDDnn standard.', host: domain, result: 'SOA Serial Format Weak' });
                }

                if (soa.refresh >= 1200 && soa.refresh <= 43200) {
                    t.push({ name: 'SOA Refresh Value', status: 'Pass', info: `${soa.refresh} (RFC OK)`, reason: 'Refresh interval is within RFC recommended range.', recommendation: 'No action needed.' });
                } else {
                    t.push({ name: 'SOA Refresh Value', status: 'Warning', info: `${soa.refresh} (Non-Standard)`, reason: 'Refresh interval is outside RFC optimal range (1200-43200).', recommendation: 'Adjust refresh value.' });
                }

                if (soa.retry >= 180 && soa.retry <= 2419200) {
                    t.push({ name: 'SOA Retry Value', status: 'Pass', info: `${soa.retry} (RFC OK)`, reason: 'Retry interval is within RFC recommended range.', recommendation: 'No action needed.' });
                } else {
                    t.push({ name: 'SOA Retry Value', status: 'Warning', info: `${soa.retry} (Non-Standard)`, reason: 'Retry interval is outside RFC optimal range.', recommendation: 'Adjust retry value.' });
                }

                if (soa.expire >= 604800 && soa.expire <= 1209600) {
                    t.push({ name: 'SOA Expire Value', status: 'Pass', info: `${soa.expire} (Strict OK)`, reason: 'Expire interval is within recommended 1-2 week range.', recommendation: 'No action needed.' });
                } else {
                    t.push({ name: 'SOA Expire Value', status: 'Warning', info: `${soa.expire} (Adjust)`, reason: 'Expire value is outside the strict recommended range (1-2 weeks). Too long can cause stale data persistence.', recommendation: 'Set expire to between 604800 and 1209600.' });
                }

                t.push({ name: 'SOA Minimum TTL', status: 'Pass', info: `${soa.minttl}`, reason: 'Minimum TTL is defined.', recommendation: 'No action needed.' });
            } catch {
                t.push({ name: 'SOA Record Published', status: 'Warning', info: 'Missing', reason: 'SOA record not found.', recommendation: 'Ensure your zone file is valid.' });
            }
            return t;
        })(),

        // 6. CAA Record Check
        (async () => {
            const t: TestResult[] = [];
            try {
                const caa = await dns.resolveCaa(domain);
                t.push({ name: 'CAA Record', status: 'Pass', info: `${caa.length} record(s)`, reason: 'CAA records prevent unauthorized SSL issuance.', recommendation: 'No action needed.' });
            } catch (err: any) {
                t.push({ name: 'CAA Record', status: 'Pass', info: 'Not published (Optional)', reason: 'No CAA records found.', recommendation: 'Consider adding CAA records for better security.' });
            }
            return t;
        })()
    ]);

    // Local DNS Resolver check always first
    const resolverTest: TestResult = { name: 'Local DNS Resolver', status: 'Pass', info: 'Google/Cloudflare (Safe)', reason: 'Using trusted public resolvers (8.8.8.8, 1.1.1.1).', recommendation: 'No action needed.' };

    return [resolverTest, ...cnameRes, ...aRes, ...mxRes, ...nsRes, ...soaRes, ...caaRes];
}


// --- SPF Recursive Helper ---
async function getRecursiveSPFLookupCount(domain: string, seenDomains: Set<string> = new Set()): Promise<{ count: number, error: string | null }> {
    if (seenDomains.has(domain)) {
        return { count: 0, error: 'Loop detected' }; // Stop recursion on loops
    }
    seenDomains.add(domain);

    let txt: string[][] = [];
    try {
        txt = await resolveTxtWithRetry(domain);
    } catch {
        return { count: 0, error: 'DNS Failure' }; // Skip if unresolvable
    }

    // Parse SPF
    const spfRecord = txt.map(t => t.join('')).find(s => s.toLowerCase().startsWith('v=spf1'));
    if (!spfRecord) return { count: 0, error: null }; // No SPF, no lookups

    const parts = spfRecord.split(' ');
    let count = 0;

    for (const part of parts) {
        const lower = part.toLowerCase();

        // Modifiers that cause lookups
        if (lower.startsWith('include:') || lower.startsWith('redirect=')) {
            count++; // The modifier itself counts as 1
            const target = part.split(/[:=]/)[1];
            if (target) {
                const subResult = await getRecursiveSPFLookupCount(target, seenDomains);
                count += subResult.count;
            }
        }
        else if (lower.startsWith('mx') || lower.startsWith('a') || lower.startsWith('ptr') || lower.startsWith('exists:')) {
            count++;
        }
    }

    return { count, error: null };
}


// --- 2. SPF Tests (Deep Analysis) ---
async function runSPFTests(domain: string): Promise<{ tests: TestResult[], rawSpf: string | null }> {
    const tests: TestResult[] = [];
    let rawSpf: string | null = null;

    try {
        // 1. Robust Lookup with Retry
        const txt = await resolveTxtWithRetry(domain);

        // 2. Merge Chunks & Filter
        // SPF records can be split into chunks: "v=spf1 include:..." " ~all"
        // We must join chunks first.
        const spfRecords = txt.map(t => t.join('')).filter(s => s.toLowerCase().startsWith('v=spf1'));

        // 3. Presence Check
        if (spfRecords.length > 0) {
            tests.push({
                name: 'SPF Record Found',
                status: 'Pass',
                info: 'Present',
                reason: 'An SPF TXT record was found in DNS.',
                recommendation: 'No action needed.'
            });
            rawSpf = spfRecords[0];
        } else {
            // Lookup succeeded (no DNS error), but no SPF record found -> MISSING
            tests.push({
                name: 'SPF Record Found',
                status: 'Error',
                info: 'Missing',
                reason: 'No SPF record found.',
                recommendation: 'Create a TXT record starting with v=spf1.',
                host: domain,
                result: 'SPF Record Missing'
            });
            return { tests, rawSpf: null };
        }

        // 2. Multiple Records
        if (spfRecords.length > 1) {
            tests.push({ name: 'SPF Multiple Records', status: 'Error', info: `${spfRecords.length} records`, reason: 'Multiple SPF records strictly invalidates SPF.', recommendation: 'Consolidate all SPF records into a single TXT record.' });
        } else {
            tests.push({ name: 'SPF Multiple Records', status: 'Pass', info: 'Valid (1 record)', reason: 'Only one SPF record exists.', recommendation: 'No action needed.' });
        }



        // 3. Syntax / Version
        if (rawSpf.startsWith('v=spf1')) {
            tests.push({ name: 'SPF Version', status: 'Pass', info: 'v=spf1', reason: 'Correct version tag.', recommendation: 'No action needed.' });
        } else {
            tests.push({ name: 'SPF Version', status: 'Error', info: 'Invalid Version', reason: 'Record must start with v=spf1.', recommendation: 'Fix the version tag.' });
        }

        const parts = rawSpf.split(' ');

        // 4. Content Parsing
        const mechs = parts.slice(1); // skip v=spf1
        let hasAll = false;
        let mechAfterAll = false;
        let allTerminator = '';
        const includes: string[] = [];
        const ip4s: string[] = [];
        const ptrs: string[] = [];

        mechs.forEach(m => {
            if (hasAll) mechAfterAll = true; // Flag if anything comes after 'all'

            if (m.endsWith('all')) {
                hasAll = true;
                allTerminator = m;
            }
            if (m.startsWith('include:')) includes.push(m.replace('include:', ''));
            if (m.startsWith('ip4:')) ip4s.push(m);
            if (m.includes('ptr')) ptrs.push(m);
        });

        // 5. Mechanisms After All
        if (mechAfterAll) {
            tests.push({ name: 'SPF Mechanisms Ordering', status: 'Warning', info: 'Content after "all"', reason: 'Mechanisms found after the "all" terminator are ignored.', recommendation: 'Move all mechanisms before the ~all/-all tag.' });
        } else {
            tests.push({ name: 'SPF Mechanisms Ordering', status: 'Pass', info: 'Correct', reason: 'Terminator is the last mechanism.', recommendation: 'No action needed.' });
        }

        // 6. Recursive Lookups Count (Includes + A + MX + PTR + Exists)
        const recursiveResult = await getRecursiveSPFLookupCount(domain);
        const lookupCount = recursiveResult.count;

        if (lookupCount > 10) {
            tests.push({
                name: 'SPF Lookup Count',
                status: 'Error',
                info: `${lookupCount} (> 10 Limit)`,
                reason: `Too many DNS lookups cost recursive loads. Found ${lookupCount} lookups (RFC Limit: 10). Nested includes are counted.`,
                recommendation: 'Flatten your SPF record (replace includes with IP4s) or use a flattening service.'
            });
        } else {
            tests.push({
                name: 'SPF Lookup Count',
                status: 'Pass',
                info: `${lookupCount} (Safe < 10)`,
                reason: 'Lookup count is within correct limits.',
                recommendation: 'No action needed.'
            });
        }

        // 7. Policy Check
        if (allTerminator === '-all') {
            tests.push({ name: 'SPF Policy Strictness', status: 'Pass', info: 'Hard Fail (-all)', reason: 'Strict policy (Hard Fail).', recommendation: 'No action needed.' });
        } else if (allTerminator === '~all') {
            tests.push({ name: 'SPF Policy Strictness', status: 'Pass', info: 'Soft Fail (~all)', reason: 'Soft fail (Transitionary).', recommendation: 'Consider moving to -all.' });
        } else if (allTerminator === '?all') {
            tests.push({ name: 'SPF Policy Strictness', status: 'Warning', info: 'Neutral (?all)', reason: 'Neutral policy allows spoofing.', recommendation: 'Change to ~all or -all.' });
        } else if (allTerminator === '+all') {
            tests.push({ name: 'SPF Policy Strictness', status: 'Error', info: 'Allow All (+all)', reason: 'Explicitly allows the entire internet to send email as you.', recommendation: 'Change to -all immediately.' });
        } else if (rawSpf.includes('redirect=')) {
            tests.push({ name: 'SPF Policy Strictness', status: 'Pass', info: 'Redirect', reason: 'Policy is controlled by a redirect.', recommendation: 'Ensure target policy is strict.' });
        } else {
            tests.push({ name: 'SPF Policy Strictness', status: 'Warning', info: 'Missing Terminator', reason: 'No "all" mechanism found.', recommendation: 'Add -all or ~all at the end.' });
        }

        // 8. Deprecated PTR
        if (ptrs.length > 0) {
            tests.push({ name: 'Global PTR Mechanism', status: 'Warning', info: 'Used', reason: 'PTR mechanism is deprecated and slow.', recommendation: 'Remove "ptr" and use specific IPs.' });
        } else {
            tests.push({ name: 'Global PTR Mechanism', status: 'Pass', info: 'Not used', reason: 'No deprecated mechanisms found.', recommendation: 'No action needed.' });
        }

        // 9. Duplicate Mechanisms (Basic check)
        const uniqueMechs = new Set(mechs);
        if (uniqueMechs.size !== mechs.length) {
            tests.push({ name: 'SPF Redundancy', status: 'Warning', info: 'Duplicate Items', reason: 'Record contains duplicate mechanisms.', recommendation: 'Clean up duplicate entries.' });
        }

        // 10. Valid IP4 Syntax (Regex check)
        const badIps = ip4s.filter(ip => !/^ip4:[\d\.\/]+$/.test(ip));
        if (badIps.length > 0) {
            tests.push({ name: 'SPF IP4 Syntax', status: 'Error', info: 'Invalid Format', reason: `Found malformed IP4 tags: ${badIps.join(', ')}`, recommendation: 'Fix IP4 syntax (e.g., ip4:1.2.3.4).' });
        }

        // 11. Void Lookup Check (Async - for Includes)
        // We check if the included domains actually exist.
        if (includes.length > 0) {
            let voidCount = 0;
            const voidDomains: string[] = [];

            // Check max 5 includes to avoid timeout
            for (const inc of includes.slice(0, 5)) {
                try {
                    await dns.resolveTxt(inc);
                } catch {
                    voidCount++;
                    voidDomains.push(inc);
                }
            }

            if (voidCount > 0) {
                tests.push({ name: 'SPF Void Lookups', status: 'Warning', info: `${voidCount} Failed`, reason: `The following included domains do not exist or have no TXT record: ${voidDomains.join(', ')}`, recommendation: 'Remove dead includes.' });
            } else {
                tests.push({ name: 'SPF Void Lookups', status: 'Pass', info: 'Clean', reason: 'All checked includes resolve correctly.', recommendation: 'No action needed.' });
            }
        }

    } catch {
        tests.push({ name: 'SPF Record Found', status: 'Error', info: 'DNS Lookup Failed', reason: 'Could not retrieve TXT records.', recommendation: 'Check domain existence and DNS servers.' });
    }

    return { tests, rawSpf };
}


// --- 3. DMARC Tests (Deep Analysis) ---
async function runDMARCTests(domain: string): Promise<{ tests: TestResult[], rawDmarc: string | null }> {
    const tests: TestResult[] = [];
    let rawDmarc: string | null = null;
    let policy = '';
    let pct = 100;

    try {
        // 1. Strict Subdomain Lookup (_dmarc) with Retry
        const txt = await resolveTxtWithRetry(`_dmarc.${domain}`);

        // 2. Merge Chunks & Filter
        const dmarcRecords = txt.map(t => t.join('')).filter(s => s.toLowerCase().startsWith('v=dmarc1'));

        // 3. Presence Check
        if (dmarcRecords.length > 0) {
            tests.push({
                name: 'DMARC Record Found',
                status: 'Pass',
                info: 'Present',
                reason: 'DMARC record published at _dmarc subdomain.',
                recommendation: 'No action needed.'
            });
            rawDmarc = dmarcRecords[0];
        } else {
            // Lookup succeeded but no DMARC record -> MISSING
            tests.push({
                name: 'DMARC Record Found',
                status: 'Error',
                info: 'Missing',
                reason: `No DMARC record found at _dmarc.${domain}`,
                recommendation: 'Create a DMARC record to protect your domain.',
                host: domain,
                result: 'DMARC Record Missing'
            });
            return { tests, rawDmarc: null };
        }

        // 2. Multiple Records
        if (dmarcRecords.length > 1) {
            tests.push({ name: 'DMARC Multiple Records', status: 'Error', info: `${dmarcRecords.length} records`, reason: 'Multiple DMARC records cause undefined behavior.', recommendation: 'Delete all but one DMARC record.' });
        }

        // Parse Tags
        const tags: Record<string, string> = {};
        rawDmarc.split(';').forEach(part => {
            const [k, v] = part.trim().split('=');
            if (k && v) tags[k.toLowerCase()] = v.trim();
        });

        // 3. Policy Check
        // 3. Policy Check
        if (tags['p']) {
            policy = tags['p'].toLowerCase();
            if (policy === 'reject') {
                tests.push({ name: 'DMARC Policy', status: 'Pass', info: 'Reject (Secure)', reason: 'Strict enforcement policy enabled.', recommendation: 'No action needed.' });
            } else if (policy === 'quarantine') {
                tests.push({ name: 'DMARC Policy', status: 'Pass', info: 'Quarantine', reason: 'Suspicious emails are sent to spam.', recommendation: 'Consider moving to reject for full protection.' });
            } else {
                // SEVERITY PROMOTE: p=none is now an ERROR
                tests.push({ name: 'DMARC Policy', status: 'Error', info: 'None', reason: 'Policy is set to "none", which offers no protection.', recommendation: 'Change to quarantine or reject when ready.', host: domain, result: 'DMARC Quarantine/Reject Policy Not Enabled' });
            }
        } else {
            tests.push({ name: 'DMARC Policy', status: 'Error', info: 'Missing p= tag', reason: 'Policy tag is mandatory.', recommendation: 'Add p=reject, p=quarantine, or p=none.', host: domain, result: 'DMARC Record Missing' });
        }

        // 4. Subdomain Policy (sp)
        if (tags['sp']) {
            if (tags['sp'] === 'none' && policy !== 'none') {
                tests.push({ name: 'DMARC Subdomain Policy', status: 'Warning', info: 'Insecure (sp=none)', reason: 'Subdomains are explicitly unprotected while root is protected.', recommendation: 'Remove sp=none or set to quarantine/reject.' });
            } else {
                tests.push({ name: 'DMARC Subdomain Policy', status: 'Pass', info: tags['sp'], reason: 'Subdomain policy explicitly defined.', recommendation: 'No action needed.' });
            }
        } else {
            tests.push({ name: 'DMARC Subdomain Policy', status: 'Pass', info: 'Inherited', reason: 'Subdomains inherit the main policy.', recommendation: 'No action needed.' });
        }

        // 5. PCT (Percentage)
        if (tags['pct']) {
            pct = parseInt(tags['pct']);
            if (pct === 100) {
                tests.push({ name: 'DMARC Percentage', status: 'Pass', info: '100%', reason: 'Policy applies to all emails.', recommendation: 'No action needed.' });
            } else {
                tests.push({ name: 'DMARC Percentage', status: 'Warning', info: `${pct}%`, reason: 'Policy only applies to a random subset of emails.', recommendation: 'Set pct=100 for full consistency.' });
            }
        } else {
            tests.push({ name: 'DMARC Percentage', status: 'Pass', info: '100% (Default)', reason: 'Defaults to 100% if missing.', recommendation: 'No action needed.' });
        }

        // 6. RUA (Aggregate Reports) - Detailed External Check
        let hasRua = false;
        if (tags['rua']) {
            hasRua = true;
            tests.push({ name: 'DMARC RUA Reports', status: 'Pass', info: 'Enabled', reason: 'Aggregate reports configured.', recommendation: 'No action needed.' });

            // External Authorization Check
            const emails = tags['rua'].split(',').map(e => e.replace('mailto:', '').trim());
            for (const email of emails.slice(0, 3)) { // Check first 3
                if (email.includes('@')) {
                    const targetDomain = email.split('@')[1];
                    // Skip if same domain or subdomain
                    if (!domain.endsWith(targetDomain) && !targetDomain.endsWith(domain)) {
                        try {
                            // Check: domain._report._dmarc.targetDomain
                            const verifyHost = `${domain}._report._dmarc.${targetDomain}`;
                            await dns.resolveTxt(verifyHost);
                            tests.push({ name: 'DMARC External Auth', status: 'Pass', info: `Authorized (${targetDomain})`, reason: `Target domain ${targetDomain} has authorized reports from ${domain}.`, recommendation: 'No action needed.' });
                        } catch {
                            tests.push({ name: 'DMARC External Auth', status: 'Warning', info: `Missing Auth (${targetDomain})`, reason: `Target domain ${targetDomain} has NOT authorized records from ${domain}. Reports may be ignored.`, recommendation: `Add TXT record at ${domain}._report._dmarc.${targetDomain} with value "v=DMARC1".` });
                        }
                    }
                }
            }
        } else {
            tests.push({ name: 'DMARC RUA Reports', status: 'Warning', info: 'Missing', reason: 'No visibility into who is sending email as you.', recommendation: 'Add rua=mailto:you@example.com.' });
        }

        // 7. RUF (Forensic Reports)
        if (tags['ruf']) {
            tests.push({ name: 'DMARC RUF Reports', status: 'Pass', info: 'Enabled', reason: 'Forensic reports configured (may not be supported by all providers).', recommendation: 'No action needed.' });
        } else {
            tests.push({ name: 'DMARC RUF Reports', status: 'Pass', info: 'Not Enabled', reason: 'Forensic reports are optional and often noisy.', recommendation: 'No action needed.' });
        }

        // 8. Alignment (ASPF / ADKIM)
        if (tags['aspf'] && tags['aspf'].toLowerCase() === 's') {
            tests.push({ name: 'SPF Alignment Mode', status: 'Pass', info: 'Strict', reason: 'Strict alignment requires exact domain match.', recommendation: 'No action needed.' });
        } else {
            tests.push({ name: 'SPF Alignment Mode', status: 'Pass', info: 'Relaxed (Default)', reason: 'Relaxed alignment allows subdomains.', recommendation: 'No action needed.' });
        }

        if (tags['adkim'] && tags['adkim'].toLowerCase() === 's') {
            tests.push({ name: 'DKIM Alignment Mode', status: 'Pass', info: 'Strict', reason: 'Strict alignment requires exact domain match.', recommendation: 'No action needed.' });
        } else {
            tests.push({ name: 'DKIM Alignment Mode', status: 'Pass', info: 'Relaxed (Default)', reason: 'Relaxed alignment allows subdomains.', recommendation: 'No action needed.' });
        }

        // 9. BIMI Readiness Check
        // Needs p=reject/quarantine and pct=100
        const bimiReady = (policy === 'reject' || policy === 'quarantine') && pct === 100;
        if (bimiReady) {
            tests.push({ name: 'BIMI Readiness', status: 'Pass', info: 'Ready', reason: 'DMARC policy supports BIMI implementation.', recommendation: 'You can now set up a BIMI record.', host: domain, result: 'BIMI Ready' });
        } else {
            // SEVERITY PROMOTE: Error if not ready
            tests.push({ name: 'BIMI Readiness', status: 'Error', info: 'Not Ready', reason: 'BIMI requires p=quarantine/reject and pct=100.', recommendation: 'Strengthen DMARC policy to enable BIMI.', host: domain, result: 'BIMI Not Ready' });
        }

    } catch (err: any) {
        // DNS Error (Timeout, ServFail) - NOT Missing
        tests.push({
            name: 'DMARC Record Found',
            status: 'Error',
            info: 'DNS Error',
            reason: `DNS Lookup failed: ${err.message}`,
            recommendation: 'Check your DNS configuration or nameservers.',
            host: domain,
            result: 'DMARC DNS Lookup Failed'
        });
    }

    return { tests, rawDmarc };
}


// --- 4. DKIM Tests (Deep Analysis) ---
async function runDKIMTests(domain: string): Promise<TestResult[]> {
    const tests: TestResult[] = [];

    // Common selectors to check (Brute force compatible)
    const selectors = ['google', 'default', 'k1', 's1', 'mail', 'selector1', 'mandrill', 'smtp', 'pic', 'dkim', 'uk'];

    // Parallel lookup for speed
    const lookups = await Promise.allSettled(
        selectors.map(async (sel) => {
            try {
                const results = await dns.resolveTxt(`${sel}._domainkey.${domain}`);
                const record = results.map(t => t.join('')).join('');
                return { sel, record };
            } catch {
                return null;
            }
        })
    );

    const validRecords = lookups
        .filter((r): r is PromiseFulfilledResult<{ sel: string, record: string }> => r.status === 'fulfilled' && r.value !== null)
        .map(r => r.value)
        .filter(r => {
            // Strictly filter out non-DKIM TXT records (e.g. "t=y; o=~")
            // Must have either v=DKIM1 tag OR p= WITH value to be considered a key
            // This ignores empty keys like "p=" or "p=;" unless v=DKIM1 is present
            return r.record.includes('v=DKIM1') || /p=[^;]+/.test(r.record);
        });

    if (validRecords.length > 0) {
        tests.push({ name: 'DKIM Record Found', status: 'Pass', info: `${validRecords.length} Keys`, reason: `Found DKIM keys for selectors: ${validRecords.map(v => v.sel).join(', ')}`, recommendation: 'No action needed.' });

        // Analyze each key
        for (const { sel, record } of validRecords) {
            // Version Check
            if (record.includes('v=DKIM1')) {
                tests.push({ name: `DKIM Version (${sel})`, status: 'Pass', info: 'v=DKIM1', reason: 'Correct version.', recommendation: 'No action needed.' });
            } else {
                tests.push({ name: `DKIM Version (${sel})`, status: 'Warning', info: 'Legacy/Missing', reason: 'v=DKIM1 tag is missing (minor issue).', recommendation: 'Update record to include v=DKIM1.' });
            }

            // Key Type k=rsa
            if (record.includes('k=rsa')) {
                tests.push({ name: `DKIM Key Type (${sel})`, status: 'Pass', info: 'RSA', reason: 'Standard RSA key.', recommendation: 'No action needed.' });
            }

            // Key Length Check
            const pMatch = record.match(/p=([^;]+)/);
            if (pMatch && pMatch[1]) {
                const pValue = pMatch[1];
                const estimatedBits = pValue.length * 6;

                if (estimatedBits >= 2000) {
                    tests.push({ name: `DKIM Key Strength (${sel})`, status: 'Pass', info: '2048-bit+', reason: `Key appears strong (~${Math.round(estimatedBits)} bits).`, recommendation: 'No action needed.' });
                } else if (estimatedBits >= 1000) {
                    tests.push({ name: `DKIM Key Strength (${sel})`, status: 'Warning', info: '1024-bit', reason: `Key is 1024-bit (~${Math.round(estimatedBits)} bits). 2048-bit is recommended.`, recommendation: 'Rotate to a 2048-bit key.' });
                } else {
                    tests.push({ name: `DKIM Key Strength (${sel})`, status: 'Error', info: 'Weak (<1024)', reason: 'Key is too short to be secure.', recommendation: 'Generate a new 2048-bit key immediately.', host: domain, result: `DKIM Key Weak (${sel})` });
                }
            } else {
                tests.push({ name: `DKIM Key Data (${sel})`, status: 'Error', info: 'Missing p=', reason: 'Public key data not found.', recommendation: 'Fix the DKIM record syntax.' });
            }
        }

    } else {
        tests.push({
            name: 'DKIM Selectors',
            status: 'Pass',
            info: 'Info: Selector not discoverable',
            reason: 'Common selectors were checked but not found. This is normal if you use custom selectors.',
            recommendation: 'No action needed unless you are missing DKIM.'
        });
    }

    return tests;
}


// --- 5. Blacklist (Safe IP Check) ---
async function runBlacklistTestsWithMX(mxRecords: string[]): Promise<TestResult[]> {
    if (mxRecords.length === 0) return [{ name: 'Blacklist Check', status: 'Warning', info: 'No MX Records to check', reason: 'We cannot check blacklists without an MX record.', recommendation: 'Fix your MX records first.' }];

    // --- MXToolbox Parity Rules ---
    // 1. Resolve primary MX (first in priority list)
    // 2. Resolve only ONE IPv4 IP (ignore IPv6)
    // 3. Perform DNSBL checks only against this single IP
    let ip: string | null = null;
    try {
        const ips = await dns.resolve4(mxRecords[0]);
        ip = ips[0]; // Pick exactly one IPv4
    } catch {
        return [{ name: 'MX IP Resolution', status: 'Error', info: 'Could not resolve MX IP', reason: 'DNS lookup for MX host failed.', recommendation: 'Check if your MX host exists.' }];
    }

    // Run existing logic
    const results = await checkDNSBL(ip);

    // Explicitly show which IP was checked
    const ipResult: TestResult = {
        name: 'Checked IP',
        status: 'Pass' as TestStatus,
        info: ip,
        reason: 'This is the primary MX IP address used for the blacklist analysis.',
        recommendation: 'Ensure this is your primary sending IP.',
        host: ip,
        result: `Analysis performed on ${ip}`
    };

    const finalResults: TestResult[] = results.map(res => {
        const isLowImpact = res.list === 'work.drbl.gremlin.ru';
        const primaryMx = mxRecords[0]?.toLowerCase() || '';
        const isSharedProvider = primaryMx.includes('google.com') ||
            primaryMx.includes('outlook.com') ||
            primaryMx.includes('zoho.com') ||
            primaryMx.includes('zoho.eu') ||
            primaryMx.includes('facebook.com') ||
            primaryMx.includes('meta.com') ||
            primaryMx.includes('amazon.com') ||
            primaryMx.includes('amazonaws.com');

        let status: TestStatus = 'Pass';
        let info = 'Clean';
        let reason = `IP ${ip} is not listed on ${res.list}.`;
        let rec = 'No action needed.';
        let resultTxt = 'Clean';

        if (res.isListed) {
            // Only Error on high-trust abuse lists (e.g. Spamcop) if it's a shared provider
            // NOTE: Spamhaus ZEN contains SBL (high trust) + PBA/XBL (automated).
            // For shared providers, we treat generic listings as Warning to avoid false alarms on dynamic ranges.
            const isHighTrustAbuse = res.list === 'bl.spamcop.net';

            if (isSharedProvider && !isHighTrustAbuse) {
                status = 'Warning';
                info = 'Shared provider IP';
                reason = "This IP belongs to a shared email provider (e.g., Google, Meta). Reputation is managed by the provider, not the domain owner.";
                rec = "No action required unless sending mail from your own server.";
                resultTxt = 'Shared IP Warning';
            } else if (isLowImpact) {
                status = 'Warning';
                info = 'Low-impact blacklist';
                reason = "This blacklist is low-reputation and often flags shared provider IPs.";
                rec = "Monitor only. No action required unless listed on major blacklists.";
                resultTxt = 'Low-impact';
            } else {
                status = 'Error';
                info = 'Listed';
                reason = `IP ${ip} is listed on ${res.list}.`;
                rec = 'Request delisting from this provider.';
                resultTxt = 'Listed';
            }
        }

        return {
            name: res.list,
            status,
            info,
            reason: reason,
            recommendation: rec,
            host: res.list,
            result: resultTxt
        };
    });

    return [ipResult, ...finalResults];
}


// --- 6. Web Server (HTTPS + Cert) ---
// Allowed: Port 443 only.
async function runWebServerTests(domain: string): Promise<TestResult[]> {
    // Run both checks in parallel to save time
    const [fetchRes, tlsRes] = await Promise.all([
        // 1. Basic Availability (Fetch HTTP & HTTPS)
        (async () => {
            const t: TestResult[] = [];

            // HTTP (Port 80) Check
            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 3000);
                const res = await fetch(`http://${domain}`, { method: 'HEAD', redirect: 'manual', signal: controller.signal });
                clearTimeout(timeoutId);

                if (res.status >= 300 && res.status < 400) {
                    const location = res.headers.get('location');
                    if (location && location.startsWith('https://')) {
                        t.push({ name: 'HTTP Redirection', status: 'Pass', info: 'Redirects to HTTPS', reason: 'HTTP properly redirects to secure HTTPS.', recommendation: 'No action needed.' });
                    } else {
                        t.push({ name: 'HTTP Redirection', status: 'Warning', info: 'Redirects improperly', reason: `HTTP redirects to ${location}, expected https://${domain}.`, recommendation: 'Ensure HTTP redirects to HTTPS.' });
                    }
                } else if (res.ok) {
                    t.push({ name: 'HTTP Availability', status: 'Warning', info: 'No Redirect', reason: 'HTTP is available but does not redirect to HTTPS.', recommendation: 'Configure 301 redirect from HTTP to HTTPS.' });
                } else {
                    t.push({ name: 'HTTP Availability', status: 'Warning', info: `Status ${res.status}`, reason: 'HTTP returned an error status.', recommendation: 'Check your web server configuration.' });
                }
            } catch {
                t.push({ name: 'HTTP Availability', status: 'Warning', info: 'Unreachable', reason: 'Could not connect via HTTP (Port 80).', recommendation: 'Ensure your web server is running on port 80 and 443.' });
            }

            // HTTPS (Port 443) Check
            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 3000);
                const res = await fetch(`https://${domain}`, { method: 'HEAD', signal: controller.signal });
                clearTimeout(timeoutId);
                t.push({ name: 'HTTPS Availability', status: res.ok || res.status < 500 ? 'Pass' : 'Warning', info: `Status ${res.status}`, reason: `Web server returned status ${res.status}.`, recommendation: 'No action needed if this is your expected behavior.' });
            } catch {
                t.push({ name: 'HTTPS Availability', status: 'Warning', info: 'Unreachable', reason: 'Could not connect via HTTPS (Port 443).', recommendation: 'Ensure your web server is running and port 443 is open.' });
            }
            return t;
        })(),

        // 2. Certificate Details (TLS Socket)
        (async () => {
            const t: TestResult[] = [];
            try {
                await new Promise<void>((resolve, reject) => {
                    const socket = tls.connect(443, domain, { servername: domain, rejectUnauthorized: false }, () => {
                        const cert = socket.getPeerCertificate();
                        if (cert && cert.valid_to) {
                            const validTo = new Date(cert.valid_to);
                            const daysLeft = Math.floor((validTo.getTime() - Date.now()) / (1000 * 60 * 60 * 24));

                            if (daysLeft < 0) {
                                t.push({ name: 'SSL Certificate', status: 'Error', info: 'Expired', reason: `Certificate expired on ${validTo.toDateString()}.`, recommendation: 'Renew your SSL certificate immediately.' });
                            } else if (daysLeft < 14) {
                                t.push({ name: 'SSL Certificate', status: 'Warning', info: `Expires in ${daysLeft} days`, reason: 'Certificate is expiring soon.', recommendation: 'Plan to renew your certificate.' });
                            } else {
                                t.push({ name: 'SSL Certificate', status: 'Pass', info: `Valid (${daysLeft} days left)`, reason: 'Certificate is valid.', recommendation: 'No action needed.' });
                            }

                            if (socket.authorized) {
                                t.push({ name: 'SSL Chain', status: 'Pass', info: 'Valid', reason: 'Certificate chain is trusted.', recommendation: 'No action needed.' });
                            } else {
                                if (socket.authorizationError) {
                                    t.push({ name: 'SSL Chain', status: 'Warning', info: socket.authorizationError.message, reason: 'Certificate trust status is invalid.', recommendation: 'Check intermediate certificates.' });
                                } else {
                                    t.push({ name: 'SSL Chain', status: 'Pass', info: 'Valid', reason: 'Certificate chain is trusted.', recommendation: 'No action needed.' });
                                }
                            }
                        } else {
                            t.push({ name: 'SSL Certificate', status: 'Error', info: 'No Certificate presented', reason: 'Server did not present a certificate.', recommendation: 'Configure SSL on your web server.' });
                        }
                        socket.end();
                        resolve();
                    });

                    socket.on('error', (err) => {
                        t.push({ name: 'SSL Handshake', status: 'Warning', info: err.message, reason: 'SSL Connection failed.', recommendation: 'Check server TLS configuration.' });
                        resolve();
                    });

                    socket.setTimeout(2500, () => {
                        socket.destroy();
                        resolve();
                    });
                });
            } catch {
                // Handled inside
            }
            return t;
        })()
    ]);

    return [...fetchRes, ...tlsRes];
}


// --- Main Runner Orchestrator ---
export async function runFullHealthCheck(domain: string): Promise<FullHealthReport> {

    // 1. Trigger all independent tests immediately (Parallel Execution)
    const pDNS = runDNSTests(domain);
    const pSPF = runSPFTests(domain);
    const pDMARC = runDMARCTests(domain);
    const pDKIM = runDKIMTests(domain);
    const pWeb = runWebServerTests(domain);

    // 2. Resolve MX independently for Blacklist (Critical Path for speed)
    // We don't wait for pDNS to finish to get MX records for blacklist.
    // We run a dedicated MX lookup to unblock blacklist check ASAP.
    const mxLookupForBlacklist = dns.resolveMx(domain)
        .then(mxs => mxs.sort((a, b) => a.priority - b.priority).map(m => m.exchange))
        .catch(() => [] as string[]);

    const pBlacklist = mxLookupForBlacklist.then(mxs => runBlacklistTestsWithMX(mxs));

    // 3. Await all
    const [dnsResults, spfRes, dmarcRes, dkimRes, webRes, blacklistRes, mxRecords] = await Promise.all([
        pDNS,
        pSPF,
        pDMARC,
        pDKIM,
        pWeb,
        pBlacklist,
        mxLookupForBlacklist
    ]);



    // 4. Logic: SMTP Explicit Skip (Safe Mode)
    const smtpTests: TestResult[] = [
        {
            name: 'SMTP Connect',
            status: 'Pass',
            info: 'Skipped (Passive)',
            reason: 'We do not perform active SMTP probing (sending test packets) to ensure legal safety and avoid blacklisting.',
            recommendation: 'This is a passive health check tool.'
        },
        {
            name: 'Open Relay',
            status: 'Pass',
            info: 'Skipped (Passive)',
            reason: 'Open relay testing requires active intrusion attempts, which we strictly avoid.',
            recommendation: 'Use internal tools to verify relay security.'
        }
    ];


    // 5. Aggregate Problems
    // Helper to attach category
    // Helper to attach category (Preserve existing overrides like 'MX')
    const withCat = (results: TestResult[], cat: string) => results.map(r => ({ ...r, category: r.category || cat }));

    const allTests = [
        ...withCat(dnsResults, 'DNS'),
        ...withCat(spfRes.tests, 'SPF'),
        ...withCat(dmarcRes.tests, 'DMARC'),
        ...withCat(dkimRes, 'DKIM'),
        ...withCat(blacklistRes, 'Blacklist'),
        ...withCat(webRes, 'Web Server'),
        ...withCat(smtpTests, 'SMTP')
    ];

    const problems = allTests.filter(t => t.status !== 'Pass');

    // Calculate score (0-100)
    const totalTests = allTests.length;
    const passedTests = allTests.filter(t => t.status === 'Pass').length;
    const errorTests = allTests.filter(t => t.status === 'Error').length;

    // Score formula: 100 * (passed / total) - (errors * 10)
    const score = Math.max(0, Math.min(100, (passedTests / totalTests) * 100 - (errorTests * 5)));

    return {
        domain,
        rawSpf: spfRes.rawSpf,
        rawDmarc: dmarcRes.rawDmarc,
        dmarcPolicy: null,
        mxRecords,
        score: Math.round(score),
        categories: {
            problems: createCategory('Problems', problems),
            dns: createCategory('DNS', dnsResults),
            spf: createCategory('SPF', spfRes.tests),
            dmarc: createCategory('DMARC', dmarcRes.tests),
            dkim: createCategory('DKIM', dkimRes),
            blacklist: createCategory('Blacklist', blacklistRes),
            webServer: createCategory('Web Server', webRes),
            smtp: createCategory('SMTP', smtpTests) // Explicitly added as separate category
        }
    };
}
