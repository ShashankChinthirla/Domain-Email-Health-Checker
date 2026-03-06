# 🩺 Domain & Email Health Checker

![Next.js](https://img.shields.io/badge/Next.js-15-black?style=for-the-badge&logo=next.js&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue?style=for-the-badge&logo=typescript&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4.0-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-yellow?style=for-the-badge)

> **The MRI Scanner for Your Domains.** 🚀

A powerful, **full-stack diagnostic tool** that performs deep health checks on thousands of domains in seconds. It allows you to analyze security protocols (SPF, DMARC, DKIM), server health, and blacklist status—all running locally on your machine with **zero cost** and **maximized privacy**.

## 📚 Comprehensive Documentation

We have deeply documented every aspect of this architecture inside the `/docs` folder:
1. **[Architecture and Data Flow](./docs/Architecture_and_System_Working.md)** - High level system map.
2. **[Backend Engineering](./docs/Backend_Documentation.md)** - API limits, Parallel DNS lookups.
3. **[Frontend Structure](./docs/Frontend_Documentation.md)** - React state and UI component layout.
4. **[User Manual](./docs/User_Manual_and_Features.md)** - Guide for end-users operating the dashboard.
5. **[Challenges & Bugs](./docs/Issues_and_Challenges.md)** - Technical roadblocks faced and overcome (Vercel limits, DoH, Socket Timeouts).

---

## ✨ What Makes This Special?

Unlike simple lookup tools, this application acts as a complete **Bulk Analysis Engine**. It doesn't just read records; it **simulates** real-world email and web traffic to give you 100% accurate results.

### 🔥 Power Features

*   **⚡ Bulk Processing Beast**: Upload an Excel file with **1,000+ domains** and watch them process in real-time.
*   **🛑 Smart Controls**:
    *   **Pause & Resume**: Need a break? Pause the batch instantly and resume exactly where you left off.
    *   **Instant Kill Switch**: Stop the entire operation immediately with zero lag.
*   **🛡️ Deep Security analysis**:
    *   **SPF**: Checks for syntax errors, lookup limits, and strictness.
    *   **DMARC**: Validates policy enforcement (`p=reject`) to prevent spoofing.
    *   **DKIM**: Probes standard keys to ensure email authenticity.
*   **🚫 Blacklist Monitor**: Checks your IP against major anti-spam lists (Spamhaus, Sorbs, Spamcop).
*   **📊 Excel Export**: One-click export of "Clean" vs "Error" domains for easy reporting.

---

## 🚀 How It Works

We bypass expensive 3rd-party APIs by using **Native Node.js Networking**:

1.  **DNS Direct**: We query authoritative nameservers directly for raw, uncached data.
2.  **SMTP Handshake**: We connect to the Mail Server (port 25/587) to "say hello" and verify it's active, without ever sending an email.
3.  **Web Simulation**: We act like a web browser to check if your site is secure (HTTPS) and loads correctly.

All of this happens in **Parallel** (up to 50 concurrent checks) for lightning-fast speeds.

---

## 🛠️ Tech Stack

Built with the latest and greatest web technologies:

*   **Framework**: [Next.js 16](https://nextjs.org/) (App Router)
*   **Language**: [TypeScript](https://www.typescriptlang.org/) (Strict Mode)
*   **Styling**: [Tailwind CSS 4](https://tailwindcss.com/) (Dark Mode UI)
*   **Icons**: [Lucide React](https://lucide.dev/)
*   **Spreadsheets**: [SheetJS](https://sheetjs.com/) (XLSX Processing)

---

## ⚡ Getting Started

### Prerequisites
*   Node.js 18+ installed on your machine.

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

3.  **Run the application**
    ```bash
    npm run dev
    ```

4.  **Start Checking!**
    Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 📸 Usage Guide

### Single Check
Simply type a domain (e.g., `google.com`) and hit Enter. You'll get a detailed report card in seconds.

### Bulk Check (The Fun Part)
1.  Click **"Bulk Check"** in the navigation.
2.  Upload an Excel file (`.xlsx`) with a column named `Domain`.
3.  Sit back and watch the progress bar fly! 🚀
4.  Use the **Pause/Resume** buttons if you need to pause the scan.
5.  Click **Export** to save your results.

---

## 🤝 Contributing

We love open source! If you have ideas for new features or faster algorithms, feel free to open an issue or submit a pull request.

---

## 📝 License

This project is licensed under the [MIT License](LICENSE). Check, fix, and secure as many domains as you want!
