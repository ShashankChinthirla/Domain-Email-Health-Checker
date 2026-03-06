# Domain Health Checker - Backend Complete Documentation

This document explicitly details the server-side logic, data ingestion, database architectures, and core logic components.

---

## 1. Core API Endpoints

The system relies strictly on Next.js API Routes located inside `/app/api/`. 

### `POST /api/scan`
* **Trigger:** The primary `PrimaryAction.tsx` button click.
* **Payload:** `{ domain: string }`
* **Execution:** Initializes the `test-engine.ts` routine.
* **Response:** Returns a `FullHealthReport` interface struct mapped directly to JSON. Handles errors gracefully by issuing a 400 Bad Request on completely invalid syntax (e.g. `domain: #@%#@!`).

### `POST /api/recommend`
* **Trigger:** The user clicking "Remediate" to fix a broken SPF/DMARC record.
* **Payload:** `{ domain: string }`
* **Execution:** Synchronously fetches specifically the TXT records of the requested domain. Applies Regex replace functions (e.g., swapping `+all` to `~all`).
* **Response:** Returns the `current` state vs `recommended` state for instantaneous UI rendering.

### `GET /api/admin/domains`
* **Trigger:** The initial load of the `/admin` or `/dashboard` pages.
* **Execution:** Connects to MongoDB, validates Firebase JWT Authentication headers to ensure the requester is an authorized user or admin.
* **Response:** Returns an Array of previously scanned domains including their `score`, `healthStatus`, and specific missing `issues`.

---

## 2. Server Architecture (The Heart of the System)

The backend is fully asynchronous. It is powered by `Node.js v18+` via TypeScript execution. 

### The Engine Flow (`test-engine.ts`)
1. **Concurrency Handshake:** Instead of immediately requesting IPs, the code triggers a `Promise.allSettled()`.
2. **Phase 1: DNS Lookups:** Calls `resolve4` (A records), `resolveMx` (Email Servers), and `resolveTxt`.
3. **DNS Fallback (DoH):** If Vercel/Docker blocks standard Port 53 UDP traffic, the backend intelligently catches `EREFUSED` errors and instantly switches to `https://dns.google/resolve` over Port 443 TCP, bypassing cloud firewalls to guarantee the scan succeeds.
4. **Phase 2: Complex Deep Inspection:**
   - **SPF:** Iterates TXT mechanisms. Crucially, uses a *recursive look-around* (`getRecursiveSPFLookupCount()`). If your record includes `include:_goog.com`, the API fires a secondary internal scan to see what Google includes, actively tallying the steps up to the Hard Limit of 10.
   - **DMARC:** Splits tags using `split(';')`. Regex filters strictly for `mailto:` schema inside the `rua` and `ruf` reporting tags.
   - **DKIM:** Brute forces via common selector patterns (`google._domainkey`, `default._domainkey`).
   - **Web / HTTP:** Employs JS `fetch` to test `http://domain` and `https://domain`. Employs rigid `5000ms` `AbortControllers`. If a website doesn't load in 5 seconds, the server forcefully severs the socket to prevent the UI from freezing.
   - **DNSBL (Blacklists):** Takes the IP generated in Phase 1 (e.g., `192.168.1.1`), string-reverses it (`1.1.168.192`), appends `.zen.spamhaus.org`, and initiates an `A Record` search. A return of `127.0.0.x` signifies a Spam listing. Handles Throttle Codes (False Positives) elegantly by rejecting specific IP returns.

---

## 3. The MongoDB Database Schema

To enable historical persistence and Admin dashboard bulk reporting, the platform syncs all completed tests to a standard NoSQL model. 

Location config: `lib/mongodb.ts`.
Connection mapping: `lib/db.ts`.

### Collection: `issue_domains`

Upon every successfully resolved scan from `/api/scan`, a transaction updates or inserts the domain.

```json
{
  "_id": "ObjectId('...')",
  "domain": "airbnb.com",
  "user": "uid_from_firebase",
  "score": 85,
  "healthStatus": "Warning",
  "status": "At Risk",
  "spfFull": "v=spf1 include:_spf.google.com ~all",
  "updatedSpfFull": "v=spf1 include:_spf.google.com -all",
  "dmarcFull": null, 
  "updatedDmarcFull": "v=DMARC1; p=reject; rua=mailto:admin@airbnb.com",
  "issues": {
     "spf": "Policy Strictness: Soft Fail",
     "dmarc": "Missing Record",
     "dkim": null,
     "dns": null,
     "web": null,
     "blacklist": null,
     "smtp": null
  },
  "issuesDetected": 2,
  "timestamp": "2024-03-06T12:00:00Z"
}
```

**Upserting Methodology:**
Instead of flooding the DB with 50 rows of exactly the same scan, the backend utilizes `collection.bulkWrite()` with an `$set` and `upsert: true` conditional statement focused on the `domain` index. If `airbnb.com` exists, it simply overwrites the history and updates the `timestamp`. If it is a completely new scan, it creates the row.

---

## 4. Backend Dependencies & Lib Ecosystem

All core custom functionality outside the API boundary resides in `/lib`:

* `dns-cache.ts`: A custom caching wrapper for DNS requests. Since checking `SPF`, `A records`, and `MX` might interrogate the exact same nameserver, this file maintains an internal RAM `.get/.set` Cache valid for exactly 10 seconds. This massively speeds up duplicate queries during parallel scans.
* `dnsbl.ts`: Direct array of URL providers (Spamcop, Barracuda).
* `firebase-admin.ts`: Connects to Google IAM to validate that incoming frontend Browser Auth tokens match a valid server-side UID.
* `roles.ts`: Logic parsing the Database to determine if the requesting UID dictates Administrator privileges, dictating what Bulk operations are allowed on the UI.
* `health-utils.ts`: Small calculation functions transforming string statuses (`Error`, `Warning`, `Pass`) into a `score` integer from 0-100 to feed into the UI radial dials.

---

## 5. Security Models

* The backend specifically checks `isPrivateIP()` in `test-engine.ts`. If the resolved domain results in an internal network IP (e.g. `10.x.x.x` or `127.x.x.x`), the backend actively refuses to perform the HTTP fetch phase. This halts **SSRF (Server-Side Request Forgery)** attacks where a hacker tries to scan the company's private AWS cluster via the web app.
* Strict `AbortController` timeouts prevent memory bleed. By ensuring no DNS query takes longer than `2500ms`, the Node heap is completely protected from slow external nameservers attempting "Slowloris" type connection hangs.
