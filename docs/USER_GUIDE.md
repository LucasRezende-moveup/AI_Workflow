# MoveupMedia SEO Platform — User Guide

Welcome! This guide walks new users through everything the platform does and how to use each tool. No technical background required.

The platform is a suite of SEO tools that pull **real data** from Google Search Console, Google (via SerpAPI), PageSpeed Insights, your Looker Studio spreadsheets, and your server logs — then layer AI analysis on top to turn that data into actionable recommendations.

---

## Table of Contents

1. [Getting Started](#getting-started)
2. [The Navigation Menu](#the-navigation-menu)
3. [Tools](#tools)
   - [GSC Dashboard](#gsc-dashboard)
   - [SEO Health](#seo-health)
   - [Indexation Control](#indexation-control)
   - [Technical Auditor](#technical-auditor) — Core Web Vitals · Crawl Audit · Log Analysis
   - [On-Page Auditor](#on-page-auditor) — Header · Schema · Image Alt · E-E-A-T
   - [URL Comparator](#url-comparator)
   - [Internal Linking](#internal-linking)
   - [SERP Analyzer](#serp-analyzer)
   - [FS Stealer](#fs-stealer)
   - [Tracking](#tracking)
   - [History](#history)
   - [Users](#users-admin-only)
4. [Alerts & Notifications](#alerts--notifications)
5. [Data Sources & Usage Limits](#data-sources--usage-limits)
6. [FAQ & Troubleshooting](#faq--troubleshooting)

---

## Getting Started

1. **Log in** with your email and password. Sessions stay active for 24 hours, after which you'll be asked to sign in again.
2. There are two roles:
   - **Editor** — full access to all SEO tools.
   - **Super-admin** — everything an editor can do, plus the **Users** panel to manage accounts.
3. If you don't have an account, ask a super-admin to create one for you.

> **Tip:** Many tools support optional **HTTP authentication** (a username/password field, usually hidden behind a "🔒 Authentication" toggle). Use this only when the page you're analyzing sits behind a password-protected staging environment.

---

## The Navigation Menu

The left sidebar lists every tool. Click any item to open it. The bell icon (🔔) at the top shows **alerts** from keyword tracking. Your initials at the bottom open your profile / logout.

---

## Tools

### GSC Dashboard

**What it does:** Your Google Search Console command center — clicks, impressions, CTR, and average position for a property over a date range.

**How to use:**
1. Pick a **property** (verified site) and a **date range**.
2. Review the metrics and the data table (queries × pages).
3. Click **Generate AI Insights** for an automatic read-out: Rank-1 opportunities (queries sitting at #2–3), quick wins (positions 4–20 with low CTR), CTR gaps, and keyword cannibalization.
4. Use the **AI chat** box to ask questions about the data in plain language (e.g., *"Which pages lost the most clicks?"*).

---

### SEO Health

**What it does:** A single health score (0–100) per client, built from the KPIs in your Looker Studio Google Sheets data sources. Great for an at-a-glance status across all clients.

**How to use:**
1. Each configured site shows a **health gauge**, a **7-day score sparkline**, and metrics grouped by category (Traffic, Rankings, Backlinks, Technical, Conversions).
2. Click **why?** under the gauge to see what's dragging the score down.
3. Click **Refresh** to pull the latest numbers (auto-refreshes every 24 h).

> **History is automatic.** A daily job records each site's score, so the sparkline fills in over time — even if nobody opens the page. Historical snapshots are stored in the database, so you'll see trends build day by day.

*Setup note:* sites come from the `SEO_HEALTH_SITES` configuration. Ask an admin to add a client's spreadsheet if it's missing.

---

### Indexation Control

**What it does:** Checks whether your URLs are actually indexed by Google, cross-referencing the indexation API, your sitemap, and GSC's URL Inspection.

**How to use:**
- **Check** individual URLs for indexed status.
- **Sitemap check** — pull every URL from a sitemap and see coverage.
- **Range / timeline check** — see indexed status per URL across days (PASS / NEUTRAL / FAIL coloring), with a URL filter to narrow the list.

---

### Technical Auditor

A tabbed workspace for site-health diagnostics.

#### Core Web Vitals
Real performance metrics from Google PageSpeed Insights.
1. Enter a **page URL** and choose **Mobile** or **Desktop**.
2. Get a **performance score**, the key metrics (LCP, FCP, CLS, TBT, Speed Index, TTI), and the **top optimization opportunities** with estimated time savings.
3. A **score-history sparkline** appears once you have more than one measurement — track performance (and regressions) over time. A daily job can snapshot configured URLs automatically.

#### Crawl Audit
Upload a **Screaming Frog** crawl (`.seospider`, `.dbseospider`, or an *Internal All* CSV/XLSX export).
- See a crawl overview: total URLs, 200 OKs, missing titles, missing meta descriptions.
- Click **Generate AI Insights** for a prioritized read of the crawl.

#### Log Analysis
Analyze your server access logs to understand how bots (especially Googlebot) crawl your site.
1. Pick a **log site** and how many **days** to load.
2. Click **Load & Analyze**. You'll get: total hits, 404/5xx errors, unique IPs, Googlebot hits & rate, a status-code breakdown, top requested paths, traffic over time, and a bot/crawler breakdown.
3. **Filter** the log table by status code, bot, path, IP, or custom user-agent, and **Export All CSV** to stream every matching entry.

> **Fast re-runs.** Each day's logs are parsed once and cached in the database, so re-running (or extending the date range) is near-instant — only new days get downloaded. You'll see a "⚡ N days from cache" note when this happens.

---

### On-Page Auditor

A tabbed workspace for page-level content quality. Enter a URL in each tab.

- **Header Analysis** — inspects the heading structure (H1–H6) and flags issues like missing or multiple H1s.
- **Schema Audit** — extracts JSON-LD structured data and uses AI to validate it and suggest copy-paste improvements for richer search results.
- **Image Alt** — given a target keyword and page intent, AI reviews each content image's alt text and proposes better, keyword-aware alternatives.
- **E-E-A-T** — AI evaluates the page against Google's Experience, Expertise, Authoritativeness, and Trustworthiness guidelines and lists concrete gaps to fix.

---

### URL Comparator

**What it does:** Side-by-side comparison of two URLs across on-page SEO factors, with an AI verdict on which is stronger and why. Useful for benchmarking your page against a competitor.

---

### Internal Linking

**What it does:** Analyzes how your pages link to each other. Two modes, chosen with the toggle at the top:

**1. Live URL Scan** — enter a set of target URLs; the tool scrapes them live and shows:
- An **inter-linking matrix** (does page A link to page B?) with hover-to-see anchors.
- **Orphan pages** (0 inbound links from the set) and **link density**.
- **Missing link opportunities**, ranked by impact.
- An **AI linking-strategy** analysis.

**2. Screaming Frog Crawl** — upload an *All Inlinks* export (**Bulk Export → Links → All Inlinks**, CSV or XLSX):
- The file is parsed **in your browser** (no size limit), filtered to **Hyperlink** rows only (CSS/JS/redirect/image links dropped).
- Get a **From / To / Anchor Text / Status Code** table with filters for status code, **link position**, **link origin**, and **link path**, plus CSV export.
- The **Anchor Consistency** check flags anchors whose identical text points to *different* destinations (a cannibalization signal). Use **isolate** on any conflict to filter the table to exactly that anchor's links.

---

### SERP Analyzer

**What it does:** Pulls a **real Google SERP** for a keyword (and optional location) and breaks it down: organic results, related searches, People Also Ask, the featured snippet, and an AI analysis of the ranking landscape.

**How to use:** enter a keyword, optionally choose a geolocation, and analyze. Results are saved to **History**.

---

### FS Stealer

**What it does:** Builds a **Featured Snippet "steal" action plan** — a step-by-step, copy-paste-ready guide to win the featured snippet for a keyword.

**How to use:**
1. Enter a **keyword**, your **target page URL**, and (optionally) a **location**.
2. The tool fetches the live SERP, identifies the current FS holder, and generates a full plan: FS type diagnosis, semantic-gap analysis, a gap comparison vs. the holder, a numbered action plan with examples, quick wins, and a validation checklist.
3. **Export** the plan as Markdown (copy or download).
4. Optionally click **Track** to add the keyword to [Tracking](#tracking).

---

### Tracking

**What it does:** Monitors keyword rankings over time and alerts you to changes.

**How to use:**
1. **Add** a keyword with an optional target URL and location.
2. The platform records your **position**, the **featured-snippet holder**, and total results — and re-checks every keyword **once per day automatically**.
3. Open a keyword's **history** to see its position trend, and watch the **Alerts** bell for drops, gains, lost/gained rankings, and FS-holder changes.

> Each tracked keyword uses ~1 SerpAPI credit per day (see [Usage Limits](#data-sources--usage-limits)). Delete keywords you no longer need.

---

### History

**What it does:** A searchable log of past analysis runs so you can re-open results without re-running them. Primarily covers **FS Stealer**, **SERP Analyzer**, and **SEO Health**.

**How to use:** filter by tool, click **View** on any run to expand its full result.

---

### Users (admin only)

Super-admins can **create, edit, and delete** accounts and set roles (editor or super-admin). This panel is hidden for editors.

---

## Alerts & Notifications

The bell icon shows unseen alerts generated by [Tracking](#tracking):
- **Position drop / gain** (colored by severity)
- **Started / lost ranking** (entered or fell out of the top results)
- **Featured-snippet holder changed**

Opening the bell marks alerts as seen.

---

## Data Sources & Usage Limits

| Feature | Data source | Cost / limit to know |
|---|---|---|
| SERP Analyzer, FS Stealer | SerpAPI (real Google) | **~1 credit per analysis** |
| Tracking | SerpAPI | **~1 credit per keyword per day** (adds up — prune unused keywords) |
| GSC Dashboard, Indexation | Google Search Console | Bound by your GSC access |
| Core Web Vitals | Google PageSpeed Insights | Rate-limited without a dedicated key |
| SEO Health | Google Sheets (Looker Studio sources) | Sheets must be "anyone with the link can view" |
| AI insights & chat (all tools) | Google Gemini | — |
| Log Analysis | Your server's log endpoint | First run downloads logs; later runs use the cache |

If a SERP-based tool fails, the platform automatically falls back from SerpAPI to alternate sources, so occasional hiccups usually self-recover.

---

## FAQ & Troubleshooting

**I only see one day on the SEO Health / CWV sparkline.**
History builds up over time from the daily snapshot job. Give it a few days, or click **Refresh** / re-analyze on multiple days to seed it faster.

**A SERP or FS Stealer analysis says it failed.**
This is usually a temporary SERP-source issue or a used-up credit. Wait a minute and retry.

**My Screaming Frog CSV upload gave a "Request Entity Too Large" style error in the past.**
Internal Linking's Screaming Frog mode now parses CSVs locally in your browser with no size limit — just re-export as **CSV** (not XLSX) for very large crawls.

**Core Web Vitals returns an error.**
PageSpeed Insights can rate-limit requests without a dedicated API key. Retry shortly, or ask an admin to configure a `PAGESPEED_API_KEY`.

**A page behind a login won't analyze.**
Open the "🔒 Authentication" toggle and enter the staging username/password.

**I can't see the Users menu.**
That panel is super-admin only. Ask an admin if you need account changes.

---

*Questions or a tool behaving unexpectedly? Contact your platform administrator.*
