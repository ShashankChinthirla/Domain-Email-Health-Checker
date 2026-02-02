# 🩺 Domain & Email Health Checker

![Next.js](https://img.shields.io/badge/Next.js-15-black?style=for-the-badge&logo=next.js&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue?style=for-the-badge&logo=typescript&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4.0-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-DNS_Module-green?style=for-the-badge&logo=node.js&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-yellow?style=for-the-badge)

A powerful, **full-stack diagnostic tool** that performs deep health checks on domains. It analyzes DNS configurations, email security protocols (SPF, DMARC, DKIM), mail server availability, and blacklist status—all running locally using native Node.js networking modules. **No expensive 3rd-party APIs required.**

---

## 🚀 Overview

The Domain Health Checker acts as a comprehensive "medical checkup" for any domain name. It ensures that a domain is trustworthy, secure, and capable of reliable email delivery.

Unlike other tools that rely on rate-limited or paid APIs (like MxToolbox), this project runs **native DNS, SMTP, and HTTP queries** directly from your server. This ensures **zero cost**, **maximized privacy**, and **unlimited performance**.

## ✨ Key Features

### 🛡️ Auth & Security (The "ID Cards")
- **SPF Analysis**: Deep syntax validation (`v=spf1`), mechanism checks, lookup limit verification (max 10), and deprecated `ptr` detection.
- **DMARC Inspection**: Policy enforcement checks (`p=reject/quarantine`), RUA/RUF reporting configuration, and percentage (`pct`) tag verification.
- **DKIM Heuristics**: Probing of standard selectors (e.g., `default._domainkey`) to verify key existence.

### 📨 Mail Server Diagnostics (The "Post Office")
- **SMTP Handshake**: Real-time connection tests on ports **25** (MTA) and **587** (Submission).
- **Banner Analysis**: Captures SMTP banners to verify server identity.
- **Reverse DNS (PTR)**: Ensures IP-to-Hostname matching for high deliverability.
- **TLS Support**: Detects `STARTTLS` availability for encrypted mail transport.

### ⛔ Blacklist Monitoring (The "Criminal Record")
- **Real-time lookup** against major anti-spam lists:
  - Spamhaus (Zen)
  - Spamcop
  - SORBS
  - Barracuda
  - And more...

### 🌐 Web & DNS Health
- **Web Server**: Checks HTTP/HTTPS reachability, SSL certificate validity, and secure redirection logic.
- **DNS Infrastructure**: Validates NS redundancy, SOA serial formatting, and TTL best practices.

### 📊 Reporting
- **Visual Dashboard**: Clean, responsive UI built with Tailwind CSS.
- **Excel Export**: Download comprehensive health reports in `.xlsx` format for clients or records.

---

## 🛠️ Tech Stack

- **Framework**: [Next.js 16](https://nextjs.org/) (App Router)
- **Language**: [TypeScript](https://www.typescriptlang.org/)
- **Styling**: [Tailwind CSS 4](https://tailwindcss.com/)
- **Icons**: [Lucide React](https://lucide.dev/)
- **Core Logic**: Native Node.js `dns`, `net`, `tls`, and `fetch` modules.

---

## ⚡ Getting Started

### Prerequisites
- Node.js 18+ installed.

### Installation

1.  **Clone the repository**
    ```bash
    git clone https://github.com/ShashankChinthirla/Domain-Email-Health-Checker.git
    cd domain_healthcheck
    ```

2.  **Install dependencies**
    ```bash
    npm install
    ```

3.  **Run the development server**
    ```bash
    npm run dev
    ```

4.  **Open your browser**
    Navigate to [http://localhost:3000](http://localhost:3000) and start checking domains!

---

## 🧠 How It Works

This tool bypasses intermediate APIs by acting as a direct DNS and Email client:

1.  **DNS Queries**: It uses `dns.resolveTxt`, `dns.resolveMx`, etc., to fetch records directly from authoritative nameservers.
2.  **SMTP Simulation**: It opens a raw TCP socket (`net.Socket`) to the target Mail Exchange (MX) server, initiates a handshake (`EHLO`), reads the banner, checks for `STARTTLS`, and then politely disconnects—proving the server is alive without sending spam.
3.  **Parallel Execution**: All categories (Security, Mail, Web, Blacklist) run concurrently using `Promise.all` for lightning-fast results (< 3 seconds).

---

## 🤝 Contributing

Contributions, issues, and feature requests are welcome!
Feel free to check the [issues page](https://github.com/ShashankChinthirla/Domain-Email-Health-Checker/issues).

---

## 📝 License

This project is licensed under the [MIT](https://choosealicense.com/licenses/mit/) License.
