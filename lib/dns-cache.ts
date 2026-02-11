import { promises as dnsPromises, MxRecord, SoaRecord, CaaRecord } from 'dns';

// Cache structure: Key -> { promise, timestamp, data }
interface CacheEntry<T> {
    promise: Promise<T>;
    timestamp: number;
    data?: T;
    error?: any;
}

const cache = new Map<string, CacheEntry<any>>();
const TTL = 10 * 60 * 1000; // 10 Minutes

// Global DNS Concurrency Control
// Increased to 128 to prevent queuing delays that cause timeouts on Vercel
const MAX_CONCURRENT_QUERIES = 128;
let runningQueries = 0;
const queryQueue: ((value: void | PromiseLike<void>) => void)[] = [];

async function acquireSlot(): Promise<void> {
    if (runningQueries < MAX_CONCURRENT_QUERIES) {
        runningQueries++;
        return;
    }
    return new Promise(resolve => queryQueue.push(resolve));
}

function releaseSlot(): void {
    runningQueries--;
    if (queryQueue.length > 0) {
        const next = queryQueue.shift();
        if (next) {
            runningQueries++;
            next();
        }
    }
}

/**
 * Generic wrapper to cache DNS calls with global concurrency
 */
async function cachedResolve<T>(
    key: string,
    resolveFn: () => Promise<T>,
    retryCount = 0 // Default to NO retry for bulk speed
): Promise<T> {
    const now = Date.now();
    const headersKey = `DNS:${key}`;

    const entry = cache.get(headersKey);

    // Return valid cached data
    if (entry && (now - entry.timestamp < TTL)) {
        return entry.promise;
    }

    const promise = (async () => {
        let lastError: any;

        for (let attempt = 0; attempt <= retryCount; attempt++) {
            await acquireSlot();

            // TIMEOUT WRAPPER: 2500ms (Strictly optimized for Vercel 10s limit)
            const timeoutPromise = new Promise<never>((_, reject) =>
                setTimeout(() => reject(new Error('DNS Timeout')), 2500)
            );

            try {
                return await Promise.race([resolveFn(), timeoutPromise]);
            } catch (err: any) {
                lastError = err;
                const shouldRetry = attempt < retryCount &&
                    (err.message === 'DNS Timeout' || err.code === 'ETIMEOUT' || err.code === 'ESERVFAIL');

                if (!shouldRetry) throw err;
                await new Promise(resolve => setTimeout(resolve, 300));
            } finally {
                releaseSlot();
            }
        }
        throw lastError;
    })()
        .then(data => {
            cache.set(headersKey, { promise, timestamp: Date.now(), data });
            return data;
        })
        .catch(err => {
            cache.delete(headersKey);
            throw err;
        });

    cache.set(headersKey, { promise, timestamp: now });
    return promise;
}

// Exported wrappers matching used methods
export async function resolve4(hostname: string): Promise<string[]> {
    return cachedResolve(`A:${hostname}`, () => dnsPromises.resolve4(hostname));
}

export async function resolve6(hostname: string): Promise<string[]> {
    return cachedResolve(`AAAA:${hostname}`, () => dnsPromises.resolve6(hostname));
}

export async function resolveMx(hostname: string): Promise<MxRecord[]> {
    return cachedResolve(`MX:${hostname}`, () => dnsPromises.resolveMx(hostname));
}

export async function resolveTxt(hostname: string): Promise<string[][]> {
    return cachedResolve(`TXT:${hostname}`, () => dnsPromises.resolveTxt(hostname));
}

export async function resolveNs(hostname: string): Promise<string[]> {
    return cachedResolve(`NS:${hostname}`, () => dnsPromises.resolveNs(hostname));
}

export async function resolveCname(hostname: string): Promise<string[]> {
    return cachedResolve(`CNAME:${hostname}`, () => dnsPromises.resolveCname(hostname));
}

export async function resolveSoa(hostname: string): Promise<SoaRecord> {
    return cachedResolve(`SOA:${hostname}`, () => dnsPromises.resolveSoa(hostname));
}

export async function resolveCaa(hostname: string): Promise<CaaRecord[]> {
    return cachedResolve(`CAA:${hostname}`, () => dnsPromises.resolveCaa(hostname));
}

// setServers is a dummy/unsupported when using native promises directly for some providers,
// but we keep the export for compatibility if needed.
export const setServers = (servers: string[]) => { /* No-op to avoid breaking Vercel */ };
