# Architecture and System Working Document

## 1. Project Overview
The **Domain Health Checker** is a full-stack SaaS application built to audit and monitor internet domains. It automatically interrogates DNS networking layers, email security authentication protocols (SPF, DKIM, DMARC), and web server availability, translating complex network data into actionable insights via a modern web interface.

This document describes the high-level architecture of the system, illustrating how the frontend, backend APIs, worker modules, and database seamlessly operate together.

---

## 2. High-Level Architecture Diagram
The application utilizes a stateless API architecture coupled with a modern reactive frontend.

```text
       ┌────────────────────────────────────────────────────────┐
       │                 User Web Browser                       │
       │  (React / Next.js Client-Side Application)             │
       │  - UI Components (Hero, Dashboard, ResultTable)        │
       │  - State Management (React Hooks)                      │
       └──────────────────────────┬─────────────────────────────┘
                                  │
                          (HTTPS JSON Payload)
                                  │
       ┌──────────────────────────▼─────────────────────────────┐
       │                   Next.js API Routes                   │
       │                 (Backend Entry Points)                 │
       │  - POST /api/scan                                      │
       │  - POST /api/recommend                                 │
       │  - GET /api/admin/domains                              │
       └──────────────────────────┬─────────────────────────────┘
                                  │
       ┌──────────────────────────▼─────────────────────────────┐
       │               Domain Analysis Engine                   │
       │                    (test-engine.ts)                    │
       │                                                        │
       │   ┌────────────┐  ┌────────────┐  ┌────────────────┐   │
       │   │ DNS Worker │  │Email Config│  │ Web & Rep.     │   │
       │   │  (A, MX)   │  │ (SPF/DMARC)│  │ (HTTP/DNSBL)   │   │
       │   └────────────┘  └────────────┘  └────────────────┘   │
       └──────────────────────────┬─────────────────────────────┘
                                  │
       ┌──────────────────────────▼─────────────────────────────┐
       │         Data Aggregation & Issue Classification        │
       └──────────────────────────┬─────────────────────────────┘
                                  │
       ┌──────────────────────────▼─────────────────────────────┐
       │                 Persistent Storage                     │
       │             (MongoDB - `issue_domains`)                │
       └────────────────────────────────────────────────────────┘
```

---

## 3. Component Interaction Flow

The system operates synchronously for the end-user while executing massively parallel tasks in the background.

### 3.1. User Interaction (Frontend)
1. The user navigates to the application and enters a target domain (e.g., `example.com`) in the **Hero** or **DomainChecker** component.
2. The user clicks **Scan**.
3. The React component transitions to a loading state displaying a `ParticleBackground` or progress indicator.
4. A `fetch` POST request containing the domain is dispatched to the backend.

### 3.2. API Ingestion (Backend Router)
1. The Next.js API route (`/api/scan`) receives the request.
2. An initial middleware layer purifies the input—stripping out `https://`, spaces, or invalid directory paths, ensuring only a clean Top-Level string (FQDN) is injected into the engine.

### 3.3. Processing Engine (The Core)
1. The `test-engine.ts` initiates its "Event Loop" using `Promise.allSettled()`.
2. **Phase 1 (Routing):** It triggers `dns-cache.ts` to locate the native IP addresses and Nameservers. (Falls back to Google DNS-over-HTTPS if standard sockets are blocked).
3. **Phase 2 (Deep Scan):** Using Phase 1 data, the engine aggressively fires parallel commands:
   * It crawls `http://` and `https://` checking for `200 OK` status and redirect boundaries.
   * It reverses the assigned IP and queries Spamhaus / Spamcop via DNSBL for spam blacklisting.
   * It extracts `TXT` records, recursively chasing `SPF` includes to count DNS loads, and evaluates `DMARC` tag strictness.

### 3.4. Classification & Storage
1. All modules return their findings (e.g., `DMARC p=none`).
2. The engine evaluates these findings against Business Logic Rules (e.g., `p=none` = Warning).
3. The engine aggregates the categories into a single `FullHealthReport` JSON object.
4. MongoDB upserts the object into the `issue_domains` collection, linking the domain to the logged-in User ID (if authenticated) and stamping a `last_scanned_at` timestamp.

### 3.5. Result Rendering (Frontend)
1. The frontend receives the `HTTP 200` JSON response.
2. The React states populate the `ResultTable` and `HealthCards` components.
3. The UI color-codes findings (Green/Red/Yellow) based on severity, expanding detailed accordions for failed checks, giving the user immediate visual feedback.

---

## 4. Key Architectural Decisions

* **Stateless API:** The backend retains no connection-specific memory. Each request is atomic, making the application infinitely horizontally scalable strictly via Kubernetes or Vercel Edge networks.
* **Aggressive Parallelization:** Checking 5 blacklists + HTTP + 15 DNS records takes exactly as long as the single slowest connection (max ~5 seconds) instead of adding them all up (which would take ~30 seconds serially).
* **Database Upserting:** MongoDB utilizes an `upsert: true` filter on the domain name. This means when a user clicks "Rescan", the system overwrites the existing history record instead of creating duplicates, ensuring the admin dashboard always reflects the live reality of the infrastructure.
* **Component-Based UI:** The React structure strictly follows atomic design. The `DomainChecker.tsx` handles state, but relies on dumb components like `RawRecord.tsx` and `VerdictBanner.tsx` to handle display rendering.

---

## 5. System Environments

The architecture is built for standard cloud-native deployment:
* **Production Build:** `npm run build` statically compiles React components into HTML/CSS chunks while minifying TypeScript node routes.
* **Database Layer:** Hosted securely off-cluster (e.g., MongoDB Atlas). Connects via standard `MONGODB_URI` connection strings over TLS.
* **Authentication Layer:** Firebase sets secure JWT browser cookies to determine if the active session possesses an `Admin` or standard user role, thereby blocking unauthorized API access dynamically at the Next.js router level.
