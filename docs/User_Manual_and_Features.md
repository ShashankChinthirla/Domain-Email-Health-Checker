# Domain Health Checker - End User Manual & Feature Guide

Welcome to the Domain Health Checker! This tool is designed to make internet infrastructure simple. Whether you are an IT professional making sure your website is online, or a marketing manager ensuring your newsletters don't go to the spam folder, this software automatically finds and fixes invisible problems with your domain.

---

## 1. What Can This Software Do?

Think of this software as a dedicated mechanic for your internet domain. It instantly runs a 25-point inspection covering:

* **Website Uptime:** Is the site down right now?
* **Email Safety (SPF/DKIM/DMARC):** Are you protected against hackers trying to spoof your company's email address?
* **Spam Blacklists:** Have popular security companies blocked your IP addresses from sending mail?
* **DNS Settings:** Are your internal routing rules (like MX records and Nameservers) perfectly compliant with global internet rules?

---

## 2. Using the Dashboard: Step-by-Step

### Step 1: Scanning a Single Domain
1. Log into the application and go to the **Home** (`/`) page.
2. You will see a large search bar labeled **"Enter a domain to analyze..."**.
3. Type in any domain (for example, `google.com` or `yourcompany.com`). *You do not need to type `http://` or `www.`.*
4. Click the **Analyze** or **Scan** button.
5. The screen will display a loading animation. Please wait (this takes about 3-5 seconds as the system reaches out to dozens of servers globally).

### Step 2: Reading the Results (The Health Report)
Once the scan finishes, you will see a massive dashboard of data:

* **The Health Score Dial:** At the very top, you'll see a score from 0-100 indicating the total perfection of your domain.
* **Problems Section (The Red/Yellow Box):** We instantly filter out everything that *Passed* and show you exactly what is broken right at the top. 
* **The Full Result Table:** Scroll down to see every individual test. Look for the colorful badges:
  * 🟢 **Pass:** Everything is perfect. No action needed.
  * 🟡 **Warning:** The setting works, but it's not following best security practices. It should be fixed eventually.
  * 🔴 **Critical/Error:** This is actively broken. Emails are likely bouncing or the website is currently down. Fix immediately.

---

## 3. The "Remediate" Feature (Fixing the Problem)

If you have a broken `SPF` or `DMARC` record, you don't need an IT degree to figure out how to write a new one.

1. Find an Email Security row in the Result Table that says "Error".
2. You will see a button labeled **"Remediate"** or **"Get Recommendation"**. Click it.
3. The system will magically review your broken config and generate a **100% Secure, Copy-Paste Ready** string of text.
4. Simply copy that text, log into your domain provider (like GoDaddy or Cloudflare), and paste it into your DNS settings!

---

## 4. The Admin Panel (For Managing Hundreds of Domains)

If you are a Systems Administrator, checking domains "one by one" takes too long.

1. Click **Admin Dashboard** in the top navigation bar.
2. Here you will see a giant spreadsheet (The `BulkResultsTable`) containing every single domain anyone has ever scanned on the platform.
3. **Filter Button:** Click "Filter by: At Risk" to instantly hide all the healthy domains, exposing only the ones that need your attention.
4. **Force Rescan All Button:** Did you just spend an hour fixing 20 broken domains in Cloudflare? Don't scan them manually again! Click this button, step away from your computer, and the system will automatically re-scan every domain in the database sequentially and update the dashboard live.

---

## 5. Frequently Asked Questions & Troubleshooting

**Q: I fixed my DNS in GoDaddy, but the Scanner still says it is broken!**
A: DNS updates are not instantaneous. Sometimes it takes 15 minutes, and rarely, up to 24 hours for a change to "propagate" across the entire globe. Wait a few minutes and hit the **Scan** button again.

**Q: What does "Timeout" mean?**
A: When pinging your website, the tool waited 5 full seconds but your server never responded. This usually means your website hosting is completely offline or freezing.

**Q: It says "Private IP Error", but I have an IP address!**
A: Some companies accidentally put `192...` or `10...` IP addresses into their public DNS. These are "Local Network" IPs, meaning nobody outside of your physical office building can reach your website. The tool explicitly catches this mistake.

**Q: Spamhaus says I am Blacklisted. What do I do?**
A: This means your server IP has been caught sending vast amounts of spam. You must click the provided link to Spamhaus's website in the dashboard and fill out their "Delisting Request" form manually to prove you aren't a malicious hacker. 
