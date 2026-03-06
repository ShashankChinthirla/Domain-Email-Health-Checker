# Domain Health Checker - Backend Engineering Documentation

---

## 1. SYSTEM OVERVIEW

**What the system does:**
The Domain Health Checker backend is a highly specialized diagnostic utility that interrogates a given domain name to determine its routing, web server availability, email security configurations, and IP reputation statuses. 

**The problem it solves:**
Domains are the cornerstone of digital business. Misconfigurations in DNS records (A/AAAA, MX), incomplete or incorrect email authentication (SPF, DKIM, DMARC), or domain IP blacklisting can lead to website outages, severe limitations in email deliverability, and vulnerabilities to impersonation attacks. The system automates the traditionally manual and fragmented process of interrogating these various infrastructure components into a unified interface.

**Who uses it:**
* Software Engineering teams executing infrastructure audits.
* DevOps/SREs verifying environment setups after DNS migrations.
* Security engineers checking domains against impersonation policies (DMARC/SPF).
* Marketing or IT operational staff ensuring mass sender capabilities and blocklist safety.

**Why it exists:**
To provide a fast, centralized API that acts as a single source of truth for a domain’s foundational networking and security health, abstracting away the complexities of manual `dig`/`nslookup/curl` commands and disparate third-party blocklist searches.

**How it fits into infrastructure:**
It acts as a standalone microservice or serverless API architecture. It receives HTTP connections from front-end applications, CRM tools, or CI/CD pipeline automation scripts, executes highly parallelized outbound networking diagnostic requests, persists historical snapshots into a database backend, and returns structured JSON datasets.

---

## 2. HIGH LEVEL ARCHITECTURE

The overall system architecture involves a frontend pushing domain strings to an API node, which orchestrates various downstream workers that handle distinct infrastructure concepts. 

```text
Client (Web App / CI Pipeline)
         │
         ▼ HTTP POST / GET (JSON)
[ API Gateway / Load Balancer ]
         │
         ▼
[ Backend API Service (Node.js/Express/Next.js) ]
         │
         ▼
[ Domain Analysis Engine (Controller) ]
         │
         ├─► [ DNS Resolver Unit (A/MX/TXT) ]
         ├─► [ Email Security Analyzer (SPF/DMARC/DKIM parsing) ]
         ├─► [ HTTP Availability Checker (Axios/Fetch HTTP/HTTPS) ]
         └─► [ Blacklist Lookup Service (DNSBL Queries) ]
         │
         ▼
[ Result Aggregator & Issue Classifier ]
         │
         ├─► (Write snapshot) ► [ Primary Database (PostgreSQL/MongoDB) ]
         │
         ▼ Return JSON payload
Client (Web App / CI Pipeline)
```

**Component Explanations:**
* **API Gateway / Load Balancer:** Receives external requests, terminates SSL, handles basic request routing and rate limiting.
* **Backend API Service:** Exposes the RESTful endpoints, handles structural payload validation, user authentication (if applicable), and builds the request context.
* **Domain Analysis Engine:** The core orchestration module. It takes the sterilized domain input and spawns parallel asynchronous promises for all distinct network operations.
* **Sub-Modules (DNS, Email, HTTP, Blacklist):** Isolated worker functions responsible for exact networking tasks (e.g., executing a DNS query via UDP/TCP, pinging a web server URL, executing reversed IP queries on spam blocklists).
* **Result Aggregator & Issue Classifier:** Waits for all parallel threads to resolve, map data to a normalized schema, and executes business logic to determine if a specific data point represents a `Passed`, `Warning`, or `Critical` status.
* **Database:** The persistent storage layer holding historical scans, system logs, and cached analytics.

---

## 3. BACKEND SERVICE ARCHITECTURE

Internally, the backend Node.js codebase is structured using a service-oriented approach to maximize code reuse, testability, and separation of concerns.

* **API Layer (Controllers/Routes):** The entry point logic (`handlers/api.ts`). Responsible only for receiving the HTTP request, unwrapping parameters, authenticating the caller, and passing the raw domain string to the Domain Processing Engine. It translates domain outputs into standard HTTP status codes and responses.
* **Request Validation Layer (Middlewares):** Employs strict validation schemas (e.g., Joi, Zod) to ensure inputs are actually fully-qualified domain names (FQDNs), escaping nasty shell characters and truncating protocols (`http://`).
* **Domain Processing Engine (Service):** Located in `services/domainScanner.ts`. A central asynchronous pipeline acting as a "Director." It manages dependency trees (e.g., DNS A-Records must resolve efficiently before Blacklist lookups can begin on IP targets).
* **Worker Modules (Providers):** Found in `lib/analyzers/` or `lib/dns/`. These are highly specialized utility scripts utilizing Node `dgram` or `dns/promises` modules to directly interface with internet protocols, disconnected from any HTTP route logic. 
* **Result Aggregator:** The engine runs `Promise.allSettled()` to catch all Worker Module outputs, mapping them to the expected data transfer object (DTO).
* **Storage Layer (Repositories):** An abstraction layer executing ORM commands or native DB queries to push the finalized DTO into the tables.

**Communication Between Modules:**
Communication occurs through strongly-typed internal Javascript objects (TypeScript interfaces). The Domain Processing Engine calls worker modules as native asynchronous functions. It injects a timeout controller signal into these functions to force early termination if a module hangs.

---

## 4. REQUEST LIFECYCLE

The strict lifecycle of an inbound HTTP request consists of 10 sequential phases:

1. **User sends domain:** A JSON payload `{"domain": "example.com"}` hits `/api/scan`.
2. **API receives request:** The backend framework handles the incoming connection, checking JWT tokens or rate limit headers.
3. **Domain validation:** Zod/Regex validation ensures the input isn't empty, too long, or containing invalid TLD formats. 
4. **Domain normalization:** The input string `https://www.example.com/login` is aggressively stripped down to the root FQDN: `example.com`.
5. **DNS resolution:** A foundational check is triggered. Before heavy processing, the system attempts to resolve the root A-Record. If this fails (`NXDOMAIN`), the system can short-circuit non-applicable HTTP checks.
6. **Parallel checks executed:** Assuming primary resolution, the system uses `Promise.allSettled` to spawn tasks: `checkSPF()`, `checkDMARC()`, `checkDKIM()`, `checkHTTP()`, and `checkBlacklist(ips)`. All run concurrently to minimize latency. 
7. **Data aggregation:** As promises fulfill or timeout/reject, the framework collects the outputs into a raw system object.
8. **Issue classification:** The Business Logic layer evaluates the object. e.g. "Does `checkSPF.record` contain `+all`?" If true, a `Warning` label is stamped on that module's result.
9. **Data stored in database:** A single transaction executes inserting the new `scan_results` row mapped to the unique domain entry.
10. **Response returned:** The REST schema is finalized and serialized out to the client as an `HTTP 200 OK` JSON document.

---

## 5. CORE PROCESSING ENGINE

The Domain Analysis Engine is built around asynchronous Javascript event-loops rather than threads. 

**Asynchronous Processing & Parallel Checks:**
Node.js natively provides `dns.promises` allowing the service to send networking requests without blocking the main event thread. The core methodology employs `Promise.allSettled()`. This guarantees that if one module (e.g., testing `HTTPS:443`) experiences packet-drop and stalls, the `checkSPF` and `checkMX` modules will still safely finish their analysis.

**Dependency Management:**
Some checks are interdependent. 
* *Blocklist lookups* require IP addresses, which require *DNS A-Record lookups*.
The engine handles this by dividing operations into two phases: 
* **Phase 1:** Core Network Checks (DNS A, AAAA, MX, general TXT).
* **Phase 2:** Advanced Checks (Blocklists utilizing Phase 1 IPs, HTTP using Phase 1 A records, parsed SPF/DMARC structures using Phase 1 TXT records).

**Timeout Handling:**
Due to unreliable remote nameservers and web hosts, hanging sockets are a major threat. `AbortController` functionality or internal `Promise.race` constructs wrap *every* outbound network call. If a DNS server or website doesn’t respond in `X` milliseconds (e.g., 5000ms), an explicit `TimeoutError` is thrown, caught by `allSettled()`, and categorized safely. 

**Result Aggregation:**
Outputs from varied modules (which may spit out arrays of IPs, strings of parsed policies, or Error stack traces) are transformed by mappers into a ubiquitous status footprint structure:
`{ module: string, status: Enum, details: object, messages: [string] }`

---

## 6. DATABASE DESIGN

**Why a database is used:**
A relational or NoSQL database is required to establish historically accurate temporal views (tracking when a domain *became* blacklisted or how often an HTTP server goes down). 

**What Data is Stored:**
The database tracks top-level generic entities (the domain string itself), distinct scans (unique timestamps of evaluation), and optionally broken-out records for complicated sub-configurations.

**Example Relational Schema (PostgreSQL design style):**

**`domains` table**
| Field | Type | Description |
| :--- | :--- | :--- |
| `id` | UUID (PK) | Unique identifier for the domain entry. |
| `domain_name` | VARCHAR | The actual root FQDN string (e.g., `google.com`). Unique index applied. |
| `created_at` | TIMESTAMP | The first time the system ever processed this domain. |
| `last_scanned_at` | TIMESTAMP | Update hook tracking the most recent scan time. |

**`scan_results` table**
| Field | Type | Description |
| :--- | :--- | :--- |
| `id` | UUID (PK) | Unique ID for the specific diagnostic scan run. |
| `domain_id` | UUID (FK) | References `domains.id`. Establishing a 1-to-Many relationship. |
| `scan_timestamp` | TIMESTAMP | The exact time this batch of queries was executed. |
| `overall_status` | VARCHAR | Denormalized summary status: `Clean`, `Warning`, or `Critical`. |
| `scan_duration_ms`| INTEGER | Total execution time useful for monitoring system performance. |
| `dns_raw_data` | JSONB | A JSON blob of A, MX, CNAME records. |
| `security_raw_data`| JSONB | Object maintaining parsed SPF, DMARC, DKIM policies. |
| `http_availability`| JSONB | Array of port responses and timings. |
| `blacklist_hits` | INTEGER | Number of databases this domain triggered positive against. |

**Relationships:**
`domains` holds a `1:N` relationship with `scan_results`. Querying `domains` JOIN `scan_results` ORDER BY `scan_timestamp DESC LIMIT 10` establishes a historical health timeline for a given domain structure. 

*(If using MongoDB, the `domains` collection typically embeds the most recent scan result to limit query complexity, while a historical timeseries collection maintains older scan payloads).*

---

## 7. DATA FLOW

Data traces through the system layers sequentially and irreversibly per request:

1. **Client Request:** Frontend payload `POST /api/healthcheck {"target": "example.com"}` received by Node process.
2. **Backend API:** Body parsing middleware translates JSON stream to JavaScript Object. Zod validates schema.
3. **Processing Engine:** Rejects payload if validation fails. Otherwise, passes pure string `example.com` to internal scanner service.
4. **External DNS Queries:** Process initiates UDP/TCP calls to local resolvers (or `8.8.8.8`). Requests leave backend environment boundary.
5. **Analysis Modules:** Responses arrive. Domain string and raw DNS/IP data injected into specific parsers.
6. **Aggregation:** Modules return formatted JSON interfaces representing their specific sector of concern. Aggregator unifies into comprehensive `Report` object.
7. **Database Storage:** The `Report` object is mapped to DB models and inserted via the database connection pool (e.g., `INSERT INTO scan_results...`).
8. **API response:** Express/Next sends an HTTP `200` with the serialized representation of the final `Report` object over the open socket connection back to the client application.

---

## 8. DOMAIN ANALYSIS MODULES

The atomic worker modules are defined by their specialization. Each operates essentially as a pure function where feasible. 

### DNS Resolution
* **Purpose:** Establish the fundamental structural routing values of the domain.
* **Algorithm:** Node native `dns.promises.resolve*` functions querying root and authoritative DNS servers.
* **Input:** String `domain`.
* **Output:** JSON mapping `A`, `AAAA`, `MX` (with priorities), and unparsed `TXT` data clusters.
* **Edge Cases:** CNAME chaining logic (domain points to CNAME, which points to A); DNS `SERVFAIL`, unexpected UDP packet truncation.

### SPF Analysis
* **Purpose:** Ensure the domain restricts outbound mail IP authorization correctly via Sender Policy Framework.
* **Algorithm:** Iterates TXT records, finds string starting `v=spf1`. Parses space-delimited mechanisms.
* **Input:** Raw TXT arrays.
* **Output:** Formatted SPF statement, matched mechanisms, and strictness rating (`Pass`, `SoftFail`, `HardFail`).
* **Edge Cases:** Multiple SPF records (which is technically invalid RFC standard), over-authorization limits (too many DNS lookups allowed in `include:` arguments).

### DKIM Detection
* **Purpose:** Ascertain DomainKeys Identified Mail usage.
* **Algorithm:** Requires specific knowledge of a selector to find explicit keys (e.g. `google._domainkey.example.com`). Often operates heuristically trying known common selectors.
* **Input:** String `domain` and potentially a known `selector` array.
* **Output:** Extracted public RSA/Ed25519 key policy strings.
* **Edge Cases:** Unknown custom selectors make DKIM verification functionally hard to brute-force accurately.

### DMARC Validation
* **Purpose:** Authenticate the final layer of SPF/DKIM enforcement and domain alignment policies.
* **Algorithm:** DNS lookup specifically for TXT records at `_dmarc.targetdomain.com`. Regex applied to parse `v=DMARC1; p=...` parameters.
* **Input:** String `domain`.
* **Output:** Separated values for `policy (p)`, `subdomain policy (sp)`, `reporting points (rua/ruf)`.
* **Edge Cases:** Valid DMARC is present, but policy is set to `p=none` (Monitoring mode, which is technically insecure).

### HTTP Availability Check
* **Purpose:** Validate web server up/down status.
* **Algorithm:** `Axios.head()` or `Axios.get()` against `http://example.com` and `https://example.com`.
* **Input:** String `domain`.
* **Output:** Boolean `up`, HTTP status code, response time in MS, redirection destination.
* **Edge Cases:** Dealing with 301/302 redirect loops, self-signed SSL certificates rejecting the Node TLS validation, web application firewalls (Cloudflare) sending 403 Forbidden on programmatic tools blocking automated scrapers. 

### Blacklist Detection
* **Purpose:** Verify IPs are safe from global spam reputation databases (DNSBL).
* **Algorithm:** Extract IPv4 string (e.g., `192.168.1.1`), reverse it (`1.1.168.192`), append to target blacklist (e.g. `zen.spamhaus.org`), execute A-record DNS query. Positive resolution (usually yielding a `127.0.0.X` code) signifies listing.
* **Input:** IPv4 Addresses.
* **Output:** Array of DBs where listed vs checked.
* **Edge Cases:** IPv6 query structure is distinct and can break naive IP reversers. Provider throttling queries and sending warning codes back as A responses (false positives).

---

## 9. BUSINESS LOGIC

The ultimate value of the API lies in translating technical data points into human-actionable alerts. Issue classification applies defined rules to module outputs. Each issue carries a severity flag, and the domain receives the overall highest encountered severity.

**Classification Tiers:**
* **Passed:** Configuration is fully compliant with modern operational and security standards. 
* **Warning:** Configuration functions, but is non-optimal, mildly insecure, or technically violates strict RFCS without catastrophic impact. 
* **Critical:** Fundamental failure ensuring downtime, or actively dangerous security postures exposing organizations to immediate threats.

**Example Decision Rules:**
* **DNS module returns `NXDOMAIN`** → *Critical* (The domain literally does not resolve internet traffic).
* **DMARC record missing entirely** → *Critical* (High risk of domain spoofing and phishing).
* **DMARC present, but `p=none`** → *Warning* (Domain intends to implement security, but currently takes no enforcement against failures).
* **SPF record includes `+all`** → *Critical* (Any IP on the internet is authorized to send email on behalf of this domain).
* **SPF record uses `~all` (SoftFail) instead of `-all` (HardFail)** → *Warning* (Debatable RFC preference, but non-critical).
* **Blacklist check resolves positively on Spamhaus** → *Critical* (Outbound email campaigns will fail drastically).
* **HTTP `403 Forbidden` response** → *Warning* (Server is active and online, but restricts data—often due to WAFs detecting bots).

---

## 10. ERROR HANDLING STRATEGY

Graceful degradation is a paramount directive. A failure in one quadrant must not fail the system globally. 

* **DNS lookup failure (Temporary/Timeout):** Caught inside the worker module loop. Logged and output natively as `Failed to Resolve`. Status does not throw an API 500 error; it gracefully populates the JSON with `DNS Status: Critical Issue`.
* **Network timeout (HTTP checking):** Node networking limits applied strictly (e.g., 5000ms). The `AxiosError ECONNABORTED` is swallowed, and mapped to a clean user-space message: `"HTTP endpoint unreachable or timed out."`
* **Invalid domain (Regex failure):** Caught immediately in API Request Validation. Throws `HTTP 400 Bad Request` prior to any computing resources being instantiated. 
* **External API/DNS server unreachable:** Failsafes and fallback DNS providers (if possible). Internal modules return standard "Service Unavailable" JSON sub-blocks. 
* **Blacklist service unavailable:** DNSBL queries heavily prone to rate-limiting by Spamhaus/Barracuda. If query logic returns generic `127.255.255.255` (throttle IP code), backend accurately identifies this as **Not Blacklisted**, logs the throttle internally into monitoring, and issues a standard response array bypassing the service gracefully.

---

## 11. SECURITY MODEL

As a tool generating outbound network requests based heavily on untrusted user parameters, defense-in-depth is employed systematically.

* **Input Validation:** Strict parsing. Only characters `[a-z0-9.-]` are authorized. Input sizes hard-capped at 253 characters (RFC standard limit).
* **Request Sanitization:** Excludes control characters, spaces, and `\n` to prevent Command Injection or DNS Poisoning attacks via Node binaries. 
* **SSRF (Server-Side Request Forgery) Prevention:** Since the tool pings the URL defined by the user (HTTP Availability module), it represents an SSRF surface. The system prevents checking local interfaces (e.g. `localhost`, `127.0.0.1`, `10.0.0.0/8`, `169.254.169.254` AWS Metadata URLs). Node DNS resolution forces checking external IP ranges before finalizing internal `HTTP` execution. 
* **Rate Limiting:** The API is shielded by sliding-window token buckets per IP/User to prevent malicious actors from utilizing the architecture as an automated massive spam-checker DDoS tool against third parties.
* **Timeout Protection:** Hard delays on Promises. Prevents Slowloris-style thread hanging where malicious payload servers deliberately trickle packets back to exhaust Node.js runtime memory.

---

## 12. PERFORMANCE DESIGN

Node.js provides excellent internal I/O capability for networking, provided the event loop is never synchronously blocked.

* **Asynchronous Processing:** No `fs.readFileSync` or blocking logic exists. All DB saving and network pinging use fully non-blocking architectures.
* **Parallel Core Execution:** By enforcing `Promise.all()` structures, a scan examining DNS, 5 blacklists, and HTTP headers requires computing time matching only the slowest single external response limit (usually HTTP Timeout bounding at 5 seconds), rather than summing 10 queries together serially (which could take 20s+).
* **Connection Pooling:** Postgres/MongoDB connections utilize pools (e.g., pg-pool/Mongoose bounds) rather than opening/closing per request. 
* **Deduplication caches:** (If architecturally enabled) Redis caches blocklist outputs for repetitive similar scans or shared IP addresses in multi-scan arrays preventing duplicate queries and aggressive DNSBL rate-limiting.

---

## 13. SCALING STRATEGY

As traffic increases heavily from single domains to bulk-upload queues:

* **Horizontal Scaling:** API layer is fundamentally stateless (besides database persistence). It exists neatly in Docker containers that can horizontally scale via Kubernetes pods based on CPU/RAM autoscaling logic behind a standard ingress load balancer.
* **Queue Processing (Off-Main-Thread):** Upgrading bulk processing queues to utilize `Redis` + `BullMQ` or `AWS SQS`. Instead of holding the API connection open dynamically waiting for a 5 second scan, API returns a `202 ACCEPTED / Scan_ID`, placing the job on the queue. Worker microservices process jobs out of the queue and write to the DB. Frontend subsequently polls or receives Webhooks upon DB write completion.
* **Distributed Scanning Services:** Offloading DNS checks to separate geographical node runners to guarantee highly-accurate geo-routing analysis without overloading centralized API CPU limits.

---

## 14. RISK ANALYSIS

Maintaining infrastructure checking architectures involves significant third-party unreliability risks.

* **Risk - DNS poisoning/Spoofing against the runner:** Backend relying on poisoned ISP nameservers may incorrectly validate policies. **Mitigation:** Hardcode internal `dns` library requests against trusted public resolvers globally (1.1.1.1 or 8.8.8.8 over DoH where applicable).
* **Risk - External dependency unreliability:** DNS Blacklist maintainers regularly block high-volume AWS/GCP IPs from query access unless utilizing paid tiers. **Mitigation:** Graceful API design ensures failing to reach a Blacklist results in an empty list locally, explicitly flagged as a scanner timeout rather than returning a false clean or throwing a system error.
* **Risk - API abuse/Large scale scanning load:** Creating millions of concurrent timeouts crashes processes via RAM explosions. **Mitigation:** Nginx/Gateway rate limiters, plus queue decoupling for any bulk uploads. Strict `max-connections` configurations on upstream socket implementations (`http.Agent`/`https.Agent`).

---

## 15. OBSERVABILITY

Backend teams require absolute visibility into failures inside stateless environments.

* **Request Logs:** Nginx/API logs track inbound connections, parsing latency metrics (`morgan`/`pino`).
* **Scan Logs:** Business-specific metrics. Tracking `domain_name`, `user_id`, and `duration_ms` inside Elasticsearch or Datadog enables dashboarding of average resolution time, classifying whether global API slowdowns mirror target slowness or internal bottlenecking.
* **Error Logs:** Utilizing structured logging outputs (Sentry.io). Any caught exception not manually thrown by domain validation creates full stack traces linked to request-IDs ensuring backtracing of catastrophic memory leaks or network stack failures. 
* **Metrics Collection:** Prometheus targets exposing `Number of Scans Triggered`, `DNS Queries Yielding Timeout`, `Database Write Latencies`.

---

## 16. DEPLOYMENT ARCHITECTURE

The deployment model assumes standard SaaS-based operational practices.

* **API Hosting/Runtime:** Containerized Node.js (v18+) Alpine images optimized for minimal footprints. Managed and orchestrated by AWS ECS or Kubernetes clusters (alternatively deployed globally optimized via serverless infrastructures like Vercel API routes or AWS Lambdas depending on traffic concurrency patterns).
* **Database:** Managed Cloud relational DB instance (e.g. Amazon RDS PostgresSQL / MongoDB Atlas) securely residing inside a private VPC. Backend workers securely communicate over the private local subnets.
* **Environment Variables:** All application secrets (DB credentials, proprietary Blacklist API tokens, SSL params) injected strictly through `.env` variable files locally or Vault/K8s Secrets natively. 
* **Production Setup:** Enforces mandatory TLS encrypted connections inbound, logging pipelines outbound into remote SIEMs, and rigid environment separation (Dev/Staging/Production).

---

## 17. LIMITATIONS

* **TCP Port Blocking:** Scanners operating inside tightly controlled Data Center rulesets (VPCs/Docker) may occasionally struggle to complete random HTTP pings if firewall outbound rules only prioritize internal data routing instead of external generic web port access.
* **Rate Limits from Targets:** Large scale scanning of domains sitting behind singular proxies (like Cloudflare networks) heavily trips their automated defense mechanisms causing mass False `Warning` readings of unreachability, not easily solvable without distributed IPs. 
* **True CNAME resolution complexity:** Deeply nested, cross-organizational CNAME records require sophisticated recursive crawling which can artificially bloat execution times beyond acceptable SLA limitations if unbounded.

---

## 18. FUTURE IMPROVEMENTS

Backend logic constantly requires maintenance to support adapting internet standards. Expected expansions include:

* **SSL Certificate Validation Pipeline:** Utilizing HTTP connections to parse out TLS handshake metrics, extracting the certificate issuer string, SAN list, and specifically checking against the UTC time required for automated Expiry Alerting queues.
* **WHOIS Integration Service:** Bridging the gap natively between technical infrastructure and managerial operations. Extracting registrar expiration dates via custom implementations of `tcp:43` socket protocols to WHOIS servers.
* **Subdomain Bruteforcing/Scanning:** Employing dictionary-based enumeration scripts to find and analyze generic unlinked systems (e.g., `dev.example.com`, `mail.example.com`).
* **Automated Continuous Monitoring:** Leveraging the DB storage and queues to write internal Cron jobs (EventBridge). A nightly sweep picking up all previously scanned databases and actively checking for newly dropped SPF policies or fresh blacklist applications, notifying users asynchronously. 
