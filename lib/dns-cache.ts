import { promises as dnsPromises, MxRecord, SoaRecord, CaaRecord, setServers as _setServers } from 'dns';

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
// Increased to 128 to handle bulk bursts better while still avoiding OS exhaustion
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

// Generic wrapper to cache DNS calls
async function cachedResolve<T>(
    key: string,
    resolveFn: () => Promise<T>
): Promise<T> {
    const now = Date.now();
    const headersKey = `DNS:${key}`;

    const entry = cache.get(headersKey);

    // Return valid cached data
    if (entry && (now - entry.timestamp < TTL)) {
        return entry.promise;
    }

    // New Request
    // TIMEOUT WRAPPER: Force fail after 2500ms for Vercel compatibility
    const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('DNS Timeout')), 2500)
    );

    const promise = (async () => {
        await acquireSlot();
        try {
            return await Promise.race([resolveFn(), timeoutPromise]);
        } finally {
            releaseSlot();
        }
    })()
        .then(data => {
            // Update cache with data on success
            cache.set(headersKey, { promise, timestamp: Date.now(), data });
            return data;
        })
        .catch(err => {
            // On error, remove from cache so we retry next time
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

export const setServers = _setServers; // Pass-through
