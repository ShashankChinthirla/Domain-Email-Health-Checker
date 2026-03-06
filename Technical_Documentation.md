# Domain Health Checker - Technical Documentation

**Project Name:** Domain Health Checker
**Description:** An automated system for analyzing and monitoring the health, security, and configuration of internet domains.
**Purpose:** To provide visibility into domain DNS configurations, email security protocols (SPF, DKIM, DMARC), web accessibility, and reputation, ensuring domains are secure, reachable, and untarnished.

---

## 2. Project Overview

**What the system does:**
The Domain Health Checker accepts a domain name as input and performs a suite of automated diagnostic checks. It analyzes DNS records, validates email security configurations, confirms website availability, and checks the domain against known spam/malware blacklists.

**Why the system exists:**
Misconfigured domains can lead to email spoofing, undelivered communications, website downtime, and security vulnerabilities. This system exists to detect these issues automatically, providing actionable data to fix problems before they affect users or businesses.

**Who will use the system:**
* **IT Administrators & DevOps:** To monitor and verify company domain infrastructure.
* **Security Teams:** To ensure strict email security protocols are properly enforced.
* **Developers:** To verify domain readiness after deployments or migrations.

**Main problems it solves:**
* Exposes weak or missing email authentication (SPF/DKIM/DMARC) which bad actors exploit for phishing.
* Detects website downtime or unreachable servers.
* Identifies poor domain reputation by scanning major blocklists.

---

## 3. System Architecture

**Overall Architecture:**
The system uses a client-server architecture. A frontend application provides the user interface, while a robust backend API handles the heavy lifting of network requests, DNS lookups, and data aggregation.

**Request Flow:**
Clients send HTTP requests containing the target domain to the Backend API. The API validates the input, parallelizes the various network/DNS checks using specific modules, aggregates the results into a unified JSON response, and returns the data to the client.

**Component Breakdown:**

* **API Layer:** Serves as the entry point for frontend requests. It handles routing, input sanitization, and rate-limiting.
* **Domain Analysis Engine:** The core controller that orchestrates the execution of all validation checks. It spawns asynchronous tasks for DNS, HTTP, and Blacklist checks to ensure fast response times.
* **DNS Check Module:** Interacts with naming servers to resolve A, AAAA, MX, TXT, and CNAME records.
* **Email Security Check Module:** Specifically parses TXT records to extract and validate the syntax and policies of SPF, DKIM, and DMARC configurations.
* **HTTP/HTTPS Availability Checker:** Attempts to establish network connections to the domain via ports 80 (HTTP) and 443 (HTTPS) to verify website up-time and redirect behavior.
* **Blacklist Checker:** Queries multiple external DNS-based Blackhole Lists (DNSBL) to see if the domain's IP addresses are flagged for malicious activity.
* **Response Generation:** Formats the raw data from all modules, generates human-readable health statuses, and suggests remediation steps for failures.

---

## 4. Architecture Flow Explanation

Here is the step-by-step flow when a domain check is initiated:

1. **User sends request:** The user enters a domain (e.g., `example.com`) in the UI and clicks "Check".
2. **API receives domain:** The frontend sends a REST API POST/GET request containing the domain to the backend server.
3. **System validates domain:** The API checks if the input is a structurally valid domain string (ignoring subdirectories or protocols like `http://`).
4. **Task Orchestration:** The Domain Analysis Engine triggers the following steps simultaneously:
   * **DNS queries are executed:** Lookups are performed for A, MX, and general TXT records.
   * **Email security checks run:** The system parses the returned TXT records to validate SPF and DMARC, and queries specific selectors for DKIM.
   * **HTTP availability check runs:** A lightweight ping/fetch request check is sent to `http://domain` and `https://domain` to confirm a 200 OK response.
   * **Blacklist checks run:** The resolved IP addresses of the domain are checked against third-party DNSBL databases.
5. **Results are aggregated:** The engine waits for all asynchronous checks to finish or timeout. It compiles the successes, warnings, and failures into a single programmatic object.
6. **Response returned to client:** The object is serialized into JSON and sent back to the user's browser, where it is rendered into a visual dashboard.

---

## 5. Technology Stack

| Component | Technology / Tool |
| :--- | :--- |
| **Backend Language & Runtime** | Node.js with TypeScript |
| **API Framework** | Express.js / Next.js API Routes |
| **DNS Lookup Library** | Node `dns` / `dns/promises` modules |
| **HTTP Request Library** | `axios` or native Node `fetch` |
| **Blacklist/Security lookup** | Custom DNSBL queries / Third-party APIs |
| **Hosting Environment** | Vercel / Cloud VPS (e.g., AWS, Linux server) |
| **Version Control** | Git & GitHub |
| **API Architecture Format**| RESTful JSON |

---

## 6. Core Features

* **Domain DNS Record Analysis:** Retrieves and maps the fundamental routing (A/AAAA records) and mail server (MX records) configurations of the domain.
* **SPF Record Validation:** Finds the Sender Policy Framework record and checks for syntax errors, multiple records, or overly permissive policies (e.g., `+all`).
* **DKIM Record Detection:** Checks for DomainKeys Identified Mail signatures to verify that emails originated from the domain owner.
* **DMARC Record Validation:** Ensures a DMARC policy exists and is set to a secure level (preferably `p=reject` or `p=quarantine`), preventing spoofed emails from reaching inboxes.
* **HTTP/HTTPS Website Accessibility Check:** Verifies that a web server is actively listening on the domain and accurately responding to web traffic, ensuring uptime.
* **Domain Blacklist Reputation Check:** Cross-references the domain against known spam databases to alert the owner if their emails might be blocked by spam filters.
* **Issue Detection and Classification:** Automatically categorizes found issues into "Critical", "Warning", or "Passed" to help users prioritize fixes.

---

## 7. Domain Health Checks (Detailed)

### SPF (Sender Policy Framework)
* **What it does:** Specifies which IP addresses and services are authorized to send email on behalf of the domain.
* **Why it is important:** It prevents spammers from sending unauthorized emails that appear to come from your domain.
* **How it performs the check:** Queries the domain's TXT records looking for a string starting with `v=spf1`. It validates the syntax and mechanism strictness.
* **Valid Example:** `v=spf1 include:_spf.google.com ~all`
* **Invalid Example:** `v=spf1 include:invalid_domain +all` (The `+all` allows anyone to send email).

### DKIM (DomainKeys Identified Mail)
* **What it does:** Adds a cryptographic signature to emails, proving the email was not tampered with in transit.
* **Why it is important:** Protects the integrity of email contents and helps build domain reputation with inbox providers.
* **How it performs the check:** Looks for a TXT CNAME or TXT record at common selectors (like `google._domainkey.example.com`) to verify a public key is published.
* **Valid Example:** `v=DKIM1; k=rsa; p=MIGfMA0GCSqGSIb3D...`

### DMARC (Domain-based Message Authentication, Reporting, and Conformance)
* **What it does:** Tells receiving mail servers what to do if an email fails SPF or DKIM checks (e.g., reject it, or send it to spam).
* **Why it is important:** It is the ultimate enforcement policy that definitively blocks spoofing and phishing attacks impersonating the domain.
* **How it performs the check:** Queries the TXT record at `_dmarc.yourdomain.com`. It checks if the policy (`p=`) is configured.
* **Valid Example:** `v=DMARC1; p=reject; rua=mailto:admin@example.com;`
* **Invalid Example:** `v=DMARC1; p=none;` (A policy of `none` provides no enforcement against spoofing).

### HTTP / HTTPS Availability
* **What it does:** Pings the domain's web servers.
* **Why it is important:** Ensures the website is online and accessible to customers.
* **How it performs the check:** Sends a lightweight GET or HEAD HTTP request.
* **Valid Example:** Returns an HTTP `200 OK` or a valid `301/302 Redirect`.
* **Invalid Example:** Returns `500 Internal Server Error` or the connection times out.

### DNS Resolution
* **What it does:** Checks if the domain successfully resolves to an IP address.
* **Why it is important:** If DNS is broken, none of the domain's services (web, email) will work.
* **How it performs the check:** Uses system DNS resolvers to fetch the 'A' record.
* **Valid Example:** Resolves successfully to `192.0.2.1`.
* **Invalid Example:** Returns `NXDOMAIN` (domain does not exist).

### Domain Blacklist Status
* **What it does:** Checks if the domain's IP is listed on spam directories (like Spamhaus).
* **Why it is important:** If blacklisted, all legitimate emails sent from the domain will likely land in the recipient's spam folder.
* **How it performs the check:** Reverses the IP address and queries it against known DNSBL servers.
* **Valid Example:** Not found on any blacklists.
* **Invalid Example:** Returns a positive match from a server like `zen.spamhaus.org`.

---

## 8. API Documentation

### Scan Domain Endpoint

* **Endpoint:** `/api/scan` (or `/api/healthcheck`)
* **Method Type:** `GET` or `POST`
* **Request Format:** JSON (if POST) or Query Parameter (if GET)
* **Request Parameters:**
  * `domain` (String, Required): The target domain name to scan.

**Example Request (POST):**
```json
POST /api/scan
Content-Type: application/json

{
  "domain": "example.com"
}
```

**Example Response (200 OK):**
```json
{
  "domain": "example.com",
  "status": "success",
  "results": {
    "dns_resolution": {
      "status": "passed",
      "ip_addresses": ["93.184.216.34"]
    },
    "spf": {
      "status": "warning",
      "current_record": "v=spf1 a -all",
      "issues": ["No major includes found, ensure all mail servers are listed."]
    },
    "dmarc": {
      "status": "failed",
      "current_record": null,
      "issues": ["No DMARC record found. Domain is vulnerable to spoofing."]
    },
    "blacklist": {
      "status": "passed",
      "listed_on": []
    }
  }
}
```

**Response Fields Explanation:**
* `status`: Overall success or failure of the API call itself.
* `results`: An object containing the output of every individual check.
* `status` (inside check): Defines if that specific check `passed`, had a `warning`, or `failed`.
* `issues`: Human-readable array of strings detailing what exactly is wrong.

**Error Responses:**
* `400 Bad Request`: If the domain parameter is missing or formatted incorrectly.
* `500 Internal Server Error`: If the backend fails to process the request entirely.

---

## 9. Error Handling

The system is designed to handle failures gracefully without crashing:
* **Invalid domains:** Analyzed via regex before processing. Returns a `400` error immediately asking the user for correct input.
* **DNS lookup failures:** Wrapped in `try/catch` blocks. If a domain lacks an MX record, it doesn't crash; it simply reports "MX Record: Missing" in the JSON response.
* **Network timeouts:** External API calls and HTTP checks use strict timeout limits (e.g., 5-10 seconds). If they timeout, the specific module returns a "Timeout/Unresponsive" status instead of hanging the entire request.
* **Missing DNS records:** Returns a predefined `Not Found` status for that specific check rather than throwing an exception.
* **API validation errors:** Clearly defined error messages are returned to the client frontend so the UI can display a helpful toast notification.

---

## 10. Security Considerations

Due to the nature of handling raw user inputs and making network requests, the following security guardrails are applied:

* **Input Validation:** Strict regex is applied to the `domain` input to ensure only valid domain structures are accepted. This prevents command injection or arbitrary code execution via forged shell-like inputs.
* **Domain Sanitization:** The system automatically strips `http://`, `https://`, paths, and trailing slashes so the backend only interacts with the raw hostname.
* **Rate Limiting:** IP-based rate limiting is implemented to prevent Denial-of-Service (DoS) attacks or abusive spamming of the API endpoints.
* **Query Timeouts:** To prevent Server-Side Request Forgery (SSRF)-style resource exhaustion, all outgoing HTTP checks and DNS lookups strictly enforce short timeouts.
* **Safe DNS Resolution:** The application uses isolated, non-blocking DNS resolution functions built into the runtime, mitigating risk from malicious naming servers.

---

## 11. Deployment and Setup

Follow these instructions to deploy the application locally:

**1. Clone the repository:**
```bash
git clone https://github.com/your-org/domain_healthcheck.git
cd domain_healthcheck
```

**2. Install dependencies:**
```bash
npm install
```

**3. Environment configuration:**
Create a `.env.local` or `.env` file in the root directory based on `.env.example`.
```bash
cp .env.example .env.local
```
*(Ensure all required database URIs or third-party API keys are filled out).*

**4. Running the application (Development):**
```bash
npm run dev
```
The localized server will typically start on `http://localhost:3000`.

**5. Building for Production:**
```bash
npm run build
npm run start
```

---

## 12. Performance Considerations

* **DNS Query Performance:** Because DNS lookups can be slow based on routing, the backend utilizes `Promise.all()` to fire off SPF, DMARC, HTTP, and Blacklist queries concurrently rather than sequentially. This reduces a potential 10-second wait down to the time of the single slowest check.
* **Timeout Handling:** Every external request bounds its execution time. A slow responding target HTTP server will fail fast (e.g., 5000ms) rather than holding the API connection open indefinitely.
* **External Service Dependencies:** Blacklist lookups rely on external DNS servers (like Spamhaus). If these third-party trackers throttle requests, the backend is designed to handle the rejection gracefully and inform the user.

---

## 13. Limitations

* **Subdomain Discovery:** The current system only checks the exact explicit domain provided. It does not fuzz or automatically verify hidden subdomains.
* **Internal Network Check:** It cannot check the health of intranet domains or domains hidden behind restrictive corporate firewalls.
* **DKIM Selector Guessing:** Because DKIM records rely on "selectors" (which are unique to the email provider), the system cannot easily detect DKIM unless common default selectors (like `google`, `default`, etc) are used or specified.

---

## 14. Future Improvements

To expand the capabilities of the system, the following features are planned for future releases:

* **SSL Certificate Validation:** Explicitly checking the expiry date and issuer trust of the domain's HTTPS certificate.
* **Subdomain Scanning:** Adding an optional feature to crawl and enumerate common subdomains (`www`, `mail`, `dev`, `staging`).
* **WHOIS Lookup:** Querying domain registration databases to alert users when a domain is natively expiring soon.
* **Domain Monitoring Dashboard:** Adding a cron-based scheduler to automatically check saved domains every 24 hours and send email alerts if health status changes.

---

## 15. Conclusion

The Domain Health Checker is an essential diagnostic tool designed to simplify the complex world of web and email infrastructure. By summarizing obscure DNS TXT records and network configurations into actionable, easy-to-understand metrics, it ensures both developers and IT administrators can maintain secure, highly reputable, and constantly available online domains.
