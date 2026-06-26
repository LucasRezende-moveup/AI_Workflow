import streamlit as st
import requests
import os
import pandas as pd
from datetime import datetime
import time
import subprocess
import base64
import json
import shutil
import tempfile

# PageSpeed Insights API endpoint
PSI_API_URL = "https://www.googleapis.com/pagespeedonline/v5/runPagespeed"

# ── Local Lighthouse runner ───────────────────────────────────────────────────

def _lighthouse_binary():
    """Return the path to the lighthouse CLI binary, or None if not installed."""
    return shutil.which("lighthouse")


def run_local_lighthouse(url, auth=None, strategy="mobile"):
    """
    Runs the Lighthouse CLI locally as a subprocess.
    Returns a parsed Lighthouse JSON result dict (lighthouseResult shape),
    or None on failure. Errors are surfaced via st.error / st.warning.

    Args:
        url      : Target URL (may be a protected / local page)
        auth     : Optional (username, password) tuple for HTTP Basic Auth
        strategy : "mobile" or "desktop"
    """
    lh_bin = _lighthouse_binary()
    if not lh_bin:
        st.error(
            "❌ `lighthouse` CLI not found. Make sure the Docker image has been "
            "rebuilt with the updated Dockerfile (Node.js + lighthouse npm package)."
        )
        return None

    # Build extra-headers JSON for Basic Auth
    extra_headers = {}
    if auth and auth[0]:
        token = base64.b64encode(f"{auth[0]}:{auth[1] or ''}".encode()).decode()
        extra_headers["Authorization"] = f"Basic {token}"

    # Screen emulation presets
    if strategy == "mobile":
        form_factor = "mobile"
        screen_flags = (
            "--screenEmulation.mobile=true "
            "--screenEmulation.width=412 "
            "--screenEmulation.height=823 "
            "--screenEmulation.deviceScaleFactor=1.75"
        )
    else:
        form_factor = "desktop"
        screen_flags = (
            "--screenEmulation.mobile=false "
            "--screenEmulation.width=1350 "
            "--screenEmulation.height=940 "
            "--screenEmulation.deviceScaleFactor=1"
        )

    chrome_flags = "--headless --no-sandbox --disable-dev-shm-usage --disable-gpu"

    cmd = [
        lh_bin,
        url,
        "--output=json",
        "--output-path=stdout",
        "--only-categories=performance",
        f"--form-factor={form_factor}",
        f"--chrome-flags={chrome_flags}",
        "--quiet",
    ]

    # Append screen emulation flags as separate args
    for flag in screen_flags.split():
        cmd.append(flag)

    if extra_headers:
        cmd.append(f"--extra-headers={json.dumps(extra_headers)}")

    try:
        result = subprocess.run(
            cmd, capture_output=True, text=True, timeout=180
        )
        if result.returncode != 0:
            stderr_snippet = result.stderr[:600] if result.stderr else "(no stderr)"
            st.error(
                f"⚡ Lighthouse CLI exited with code {result.returncode}.\n\n"
                f"```\n{stderr_snippet}\n```"
            )
            return None

        lh_json = json.loads(result.stdout)
        return lh_json

    except subprocess.TimeoutExpired:
        st.error("⚡ Local Lighthouse timed out after 180 seconds.")
        return None
    except json.JSONDecodeError as e:
        st.error(f"⚡ Failed to parse Lighthouse output: {e}")
        return None
    except Exception as e:
        st.error(f"⚡ Lighthouse runner error: {e}")
        return None


def parse_lighthouse_json(lh_json):
    """
    Adapts raw Lighthouse CLI JSON output to the same dict shape that
    parse_psi_results() returns, so render_detailed_results() works unchanged.
    """
    if not lh_json:
        return None

    audits = lh_json.get("audits", {})
    categories = lh_json.get("categories", {})
    perf_score = categories.get("performance", {}).get("score", 0) or 0

    metrics = {
        "Performance Score": perf_score * 100,
        "Largest Contentful Paint (LCP)": audits.get("largest-contentful-paint", {}),
        "First Contentful Paint (FCP)":   audits.get("first-contentful-paint", {}),
        "Cumulative Layout Shift (CLS)":  audits.get("cumulative-layout-shift", {}),
        "Total Blocking Time (TBT)":      audits.get("total-blocking-time", {}),
        "Speed Index":                    audits.get("speed-index", {}),
        "Interactive":                    audits.get("interactive", {}),
    }

    opportunities = []
    for audit_id, audit in audits.items():
        if (audit.get("details", {}).get("type") == "opportunity"
                and audit.get("details", {}).get("overallSavingsMs", 0) > 0):
            opportunities.append({
                "title":       audit.get("title"),
                "description": audit.get("description"),
                "savings":     audit.get("details", {}).get("overallSavingsMs", 0),
                "items":       audit.get("details", {}).get("items", []),
            })
    opportunities = sorted(opportunities, key=lambda x: x["savings"], reverse=True)

    diagnostics = []
    for audit_id, audit in audits.items():
        if (audit.get("score") is not None and audit.get("score") < 0.9
                and audit.get("details", {}).get("type") != "opportunity"):
            if audit_id in [
                "mainthread-work-breakdown", "bootup-time",
                "uses-long-cache-ttl", "dom-size", "offscreen-images",
                "unused-css-rules", "unused-javascript",
            ]:
                diagnostics.append({
                    "title":        audit.get("title"),
                    "description":  audit.get("description"),
                    "displayValue": audit.get("displayValue", ""),
                    "items":        audit.get("details", {}).get("items", []),
                })

    return {
        "metrics":       metrics,
        "opportunities": opportunities,
        "diagnostics":   diagnostics,
    }


IMPROVEMENT_GUIDES = {
    "unused-css-rules": {
        "title": "Reduce Unused CSS",
        "steps": [
            "**Identify:** Use the 'Coverage' tab in Chrome DevTools to find unused CSS in real-time.",
            "**Inline Critical CSS:** Extract the CSS required for above-the-fold content and inline it in the `<head>`.",
            "**Defer Non-Critical CSS:** Load the remaining CSS asynchronously using `rel='preload'` and a script fallback.",
            "**WordPress Tip:** Use optimization plugins like WP Rocket, LiteSpeed Cache, or Perfmatters to \"Remove Unused CSS\" automatically."
        ]
    },
    "unused-javascript": {
        "title": "Reduce Unused JavaScript",
        "steps": [
            "**Code Splitting:** Use dynamic `import()` to load JavaScript only when needed.",
            "**Audit Analytics:** Remove or defer non-essential third-party scripts (e.g., old tracking tags).",
            "**Delay Execution:** Use `defer` or `async` attributes on all non-critical script tags.",
            "**WordPress Tip:** Plugins like Flying Scripts, Perfmatters, or WP Rocket can \"Delay JavaScript Execution\" until user interaction, drastically improving initial load and INP."
        ]
    },
    "modern-image-formats": {
        "title": "Serve Images in Modern Formats",
        "steps": [
            "**Convert to WebP/AVIF:** Use tools to convert JPEGs and PNGs to WebP or AVIF.",
            "**Use Picture Tag:** Implement `<picture>` tags with multiple source formats for browser compatibility.",
            "**WordPress Tip:** Use plugins like Imagify, ShortPixel, or WebP Express to automatically convert uploaded media and serve modern formats."
        ]
    },
    "uses-responsive-images": {
        "title": "Properly Size Images",
        "steps": [
            "**Srcset Attributes:** Provide multiple image sizes using the `srcset` attribute.",
            "**CSS Constraints:** Ensure images have `max-width: 100%; height: auto;` to prevent overflow.",
            "**WordPress Tip:** WordPress natively supports responsive images. Ensure your theme isn't overriding this. Use Smush or EWWW Image Optimizer for fine-tuning."
        ]
    },
    "render-blocking-resources": {
        "title": "Eliminate Render-Blocking Resources",
        "steps": [
            "**Async/Defer Scripts:** Add `async` or `defer` to `<script>` tags in the head.",
            "**Critical CSS:** Inline the CSS needed for the first paint and load the rest later.",
            "**WordPress Tip:** Autoptimize or WP Rocket can automatically combine, minify, and defer CSS/JS files so they don't block the initial page render."
        ]
    },
    "largest-contentful-paint-element": {
        "title": "Optimize Largest Contentful Paint (LCP)",
        "steps": [
            "**Prioritize LCP Image:** Ensure the LCP element is NOT lazy-loaded and has `fetchpriority='high'`. (See web.dev/lcp)",
            "**Server Response:** Improve TTFB by using caching (Edge/Browser) and optimizing database queries.",
            "**Resource Load Time:** Compress the LCP image aggressively using modern formats (WebP/AVIF).",
            "**WordPress Tip:** Exclude your hero image/LCP element from lazy loading in your caching plugin. Use a robust Page Cache and Object Cache (e.g., Redis) to lower TTFB."
        ]
    },
    "cumulative-layout-shift": {
        "title": "Improve Cumulative Layout Shift (CLS)",
        "steps": [
            "**Set Dimensions:** Always include `width` and `height` attributes on images and video elements. (See web.dev/cls)",
            "**Reserve Space for Ads:** Use a container with a fixed minimum height for dynamic content like banners.",
            "**Avoid Dynamic Injection:** Don't insert content above existing content unless it's in response to a user action.",
            "**WordPress Tip:** Ensure your theme explicitly sets width/height on logo and feature images. Preload custom fonts to reduce layout shifts from web font loading."
        ]
    },
    "mainthread-work-breakdown": {
        "title": "Minimize Main-Thread Work & Improve INP",
        "steps": [
            "**Yield to Main Thread:** Break up Long Tasks (JavaScript execution > 50ms) into smaller chunks so the browser can respond to user inputs. (See web.dev/inp)",
            "**Reduce Third-Party Bloat:** Audit and remove heavy third-party tags, chatbots, or ads that execute on load.",
            "**Avoid DOM Size Bloat:** A large DOM tree forces the browser to calculate layout extensively, delaying interactions.",
            "**WordPress Tip:** Interaction to Next Paint (INP) is heavily affected by heavy page builders (Elementor, Divi) and too many plugins. Consider lightweight themes (GeneratePress, Astra) and delaying JavaScript execution."
        ]
    }
}


# MIME types that PageSpeed Insights can meaningfully analyze (HTML-based pages)
ANALYZABLE_MIME_TYPES = (
    "text/html",
    "application/xhtml+xml",
)

# Human-readable labels for common non-HTML MIME types
MIME_TYPE_LABELS = {
    "application/pdf":             "PDF Document",
    "application/json":            "JSON API Response",
    "application/xml":             "XML Document",
    "text/xml":                    "XML Document",
    "text/plain":                  "Plain-Text File",
    "application/rss+xml":         "RSS Feed",
    "application/atom+xml":        "Atom Feed",
    "application/javascript":      "JavaScript File",
    "text/javascript":             "JavaScript File",
    "text/css":                    "CSS Stylesheet",
    "image/jpeg":                  "JPEG Image",
    "image/png":                   "PNG Image",
    "image/gif":                   "GIF Image",
    "image/webp":                  "WebP Image",
    "image/svg+xml":               "SVG Image",
    "video/mp4":                   "MP4 Video",
    "audio/mpeg":                  "MP3 Audio",
    "application/octet-stream":    "Binary / Unknown File",
}


def build_url_with_auth(url, auth):
    """
    Embeds Basic Auth credentials directly into the URL
    (e.g. https://user:pass@example.com/path) so the PSI API
    Lighthouse crawler can authenticate with the origin server.
    Returns the original url if no credentials are provided.
    """
    if not auth or not auth[0]:
        return url
    from urllib.parse import urlparse, urlunparse
    from urllib.parse import quote
    username = quote(auth[0], safe="")
    password = quote(auth[1] or "", safe="")
    parsed = urlparse(url)
    authed = parsed._replace(netloc=f"{username}:{password}@{parsed.hostname}"
                             + (f":{parsed.port}" if parsed.port else ""))
    return urlunparse(authed)


def detect_mime_type(url, auth=None):
    """
    Performs a HEAD request to detect the URL's Content-Type.
    Returns a tuple (mime_type_string, is_html, is_plain_text, resp).
    Falls back to GET if HEAD is rejected (405).
    Accepts an optional auth=(username, password) tuple for Basic Auth.
    """
    headers = {
        "User-Agent": (
            "Mozilla/5.0 (compatible; MoveupMedia-CWV/1.0; "
            "+https://moveup.media/bot)"
        )
    }
    try:
        resp = requests.head(url, headers=headers, timeout=15,
                             allow_redirects=True, auth=auth or None)
        if resp.status_code == 405:
            # Server doesn't allow HEAD — try GET with stream to avoid downloading body
            resp = requests.get(url, headers=headers, timeout=15,
                                stream=True, allow_redirects=True,
                                auth=auth or None)
        elif resp.status_code == 401 and not auth:
            # Return 401 so the caller can prompt for credentials
            return "protected", False, False, resp
        content_type = resp.headers.get("Content-Type", "")
        # Strip charset and parameters, e.g. "text/html; charset=utf-8" -> "text/html"
        mime_type = content_type.split(";")[0].strip().lower()
        is_html = mime_type in ANALYZABLE_MIME_TYPES or mime_type == ""
        is_plain_text = mime_type == "text/plain"
        return mime_type, is_html, is_plain_text, resp
    except Exception as e:
        # If we can't even reach the page, let PSI tell us the bad news
        return "unknown", True, False, None


def fetch_plain_text_content(url, auth=None):
    """
    Fetches raw text/plain content from a URL and wraps it in a minimal
    HTML page so it can be previewed in-app.
    Returns (raw_text, html_preview) or (None, None) on failure.
    Accepts an optional auth=(username, password) tuple for Basic Auth.
    """
    headers = {
        "User-Agent": "Mozilla/5.0 (compatible; MoveupMedia-CWV/1.0)"
    }
    try:
        resp = requests.get(url, headers=headers, timeout=20,
                            allow_redirects=True, auth=auth or None)
        resp.encoding = resp.apparent_encoding or "utf-8"
        raw_text = resp.text
        # Escape for safe HTML embedding
        import html as html_module
        escaped = html_module.escape(raw_text)
        html_preview = (
            "<!DOCTYPE html>\n"
            "<html lang=\"en\">\n"
            "<head>\n"
            "  <meta charset=\"UTF-8\">\n"
            f"  <title>Plain-Text Preview: {html_module.escape(url)}</title>\n"
            "  <style>\n"
            "    body { font-family: monospace; white-space: pre-wrap;"
            " word-break: break-word; padding: 24px; }"
            "  </style>\n"
            "</head>\n"
            "<body>\n"
            f"{escaped}\n"
            "</body>\n"
            "</html>"
        )
        return raw_text, html_preview
    except Exception:
        return None, None


def render_non_html_analysis(url, mime_type, resp):
    """
    Displays a lightweight server-level analysis for pages that PSI cannot audit
    (PDFs, XML, JSON, images, etc.).
    """
    label = MIME_TYPE_LABELS.get(mime_type, mime_type or "Unknown")

    st.warning(
        f"⚠️ **MIME Type Detected: `{mime_type or 'unknown'}`** ({label})\n\n"
        "Google PageSpeed Insights only analyzes **HTML pages** rendered in a browser. "
        "Core Web Vitals (LCP, CLS, TBT) are **not applicable** to this content type.\n\n"
        "A server-level analysis is shown below instead."
    )

    if resp is None:
        st.error("Could not reach the URL to perform a server-level analysis.")
        return

    st.subheader("🖥️ Server-Level Analysis")

    # --- Basic response info ---
    status = resp.status_code
    status_color = "#22c55e" if 200 <= status < 300 else ("#eab308" if status < 400 else "#ef4444")
    redirect_count = len(resp.history)
    final_url = resp.url

    c1, c2, c3 = st.columns(3)
    with c1:
        st.markdown(
            f"""
            <div style="background:rgba(255,255,255,0.04);padding:14px;border-radius:10px;
                        border-left:4px solid {status_color};">
                <div style="color:#94a3b8;font-size:.85rem;font-weight:600;">HTTP Status</div>
                <div style="font-size:1.8rem;font-weight:800;color:{status_color};">{status}</div>
            </div>
            """,
            unsafe_allow_html=True,
        )
    with c2:
        elapsed_ms = int(resp.elapsed.total_seconds() * 1000)
        ttfb_color = "#22c55e" if elapsed_ms < 600 else ("#eab308" if elapsed_ms < 1800 else "#ef4444")
        st.markdown(
            f"""
            <div style="background:rgba(255,255,255,0.04);padding:14px;border-radius:10px;
                        border-left:4px solid {ttfb_color};">
                <div style="color:#94a3b8;font-size:.85rem;font-weight:600;">Response Time (TTFB proxy)</div>
                <div style="font-size:1.8rem;font-weight:800;color:{ttfb_color};">{elapsed_ms} ms</div>
            </div>
            """,
            unsafe_allow_html=True,
        )
    with c3:
        redir_color = "#22c55e" if redirect_count == 0 else ("#eab308" if redirect_count <= 2 else "#ef4444")
        st.markdown(
            f"""
            <div style="background:rgba(255,255,255,0.04);padding:14px;border-radius:10px;
                        border-left:4px solid {redir_color};">
                <div style="color:#94a3b8;font-size:.85rem;font-weight:600;">Redirect Chain</div>
                <div style="font-size:1.8rem;font-weight:800;color:{redir_color};">{redirect_count} hop(s)</div>
            </div>
            """,
            unsafe_allow_html=True,
        )

    if final_url != url:
        st.info(f"ℹ️ Final URL after redirects: `{final_url}`")

    if redirect_count > 0:
        chain = [r.url for r in resp.history] + [final_url]
        with st.expander("🔗 Redirect Chain Detail"):
            for i, hop in enumerate(chain[:-1], 1):
                hop_status = resp.history[i - 1].status_code
                st.markdown(f"**Hop {i}** `{hop_status}` → `{hop}`")
            st.markdown(f"**Final** → `{final_url}`")

    # --- Cache / Headers analysis ---
    st.subheader("📋 Response Headers")
    important_headers = [
        "Content-Type", "Content-Length", "Cache-Control", "Expires",
        "Last-Modified", "ETag", "X-Cache", "CF-Cache-Status",
        "Strict-Transport-Security", "X-Content-Type-Options", "Vary",
    ]
    header_rows = []
    for h in important_headers:
        val = resp.headers.get(h, "—")
        header_rows.append({"Header": h, "Value": val})

    df = pd.DataFrame(header_rows)
    st.dataframe(df, use_container_width=True, hide_index=True)

    # Cache assessment
    cache_control = resp.headers.get("Cache-Control", "")
    if not cache_control or "no-store" in cache_control or "no-cache" in cache_control:
        st.warning("⚠️ **Caching:** This resource has no effective cache policy. Consider setting `Cache-Control: max-age` for static assets.")
    elif "max-age" in cache_control:
        st.success("✅ **Caching:** Cache-Control header is configured.")

    # Security header tip
    if not resp.headers.get("X-Content-Type-Options"):
        st.warning("⚠️ `X-Content-Type-Options: nosniff` header is missing — browsers may MIME-sniff this response.")

    # --- What CWV metrics mean for this type ---
    st.markdown("---")
    st.subheader("📖 Why Core Web Vitals Don't Apply Here")
    st.markdown(
        f"""
Core Web Vitals measure the **user experience of loading a web page in a browser**:
- **LCP** (Largest Contentful Paint) — requires a DOM with visible elements
- **CLS** (Cumulative Layout Shift) — requires layout rendering
- **TBT/FID** (Total Blocking Time / Interaction to Next Paint) — requires JavaScript execution

A **{label}** (`{mime_type}`) is served directly by the server and is not rendered as a 
webpage, so these metrics cannot be collected. If this URL is embedded in an HTML page 
(e.g., a PDF viewer or an image), analyze the **parent HTML page** instead.
"""
    )


def fetch_pagespeed_results(url, strategy="mobile"):
    """
    Fetches PageSpeed Insights results with retries and timeout.
    """
    api_key = os.getenv("PAGESPEED_API_KEY") or os.getenv("GOOGLE_API_KEY")
    if not api_key:
        st.error("PageSpeed API Key not found in environment variables (PAGESPEED_API_KEY or GOOGLE_API_KEY).")
        return None

    params = {
        'url': url,
        'key': api_key,
        'strategy': strategy,
        'category': 'performance' # Use string for consistency
    }

    max_retries = 2
    for attempt in range(max_retries + 1):
        try:
            # PSI can be very slow (up to 90s for complex pages)
            response = requests.get(PSI_API_URL, params=params, timeout=120)

            if response.status_code == 200:
                return response.json()

            if response.status_code == 500:
                if attempt < max_retries:
                    st.warning(f"PSI API returned 500 for {strategy}. Retrying (Attempt {attempt + 1}/{max_retries})...")
                    time.sleep(5)
                    continue

            # Detect Lighthouse auth / access-denied errors before raising
            if response.status_code == 400:
                try:
                    err_body = response.json()
                    err_msg = err_body.get("error", {}).get("message", "")
                    if any(kw in err_msg for kw in [
                        "ERR_ACCESS_DENIED", "FAILED_DOCUMENT_REQUEST",
                        "ERR_NAME_NOT_RESOLVED", "net::"
                    ]):
                        # Return a sentinel so the caller can show a nice fallback
                        return {"__psi_blocked__": True, "message": err_msg}
                except Exception:
                    pass

            response.raise_for_status()
        except requests.exceptions.Timeout:
            if attempt < max_retries:
                st.warning(f"PSI API timed out for {strategy}. Retrying...")
                continue
            st.error(f"PageSpeed API timed out after {max_retries + 1} attempts.")
        except Exception as e:
            if attempt < max_retries:
                 st.warning(f"Request failed: {e}. Retrying...")
                 time.sleep(2)
                 continue
            st.error(f"Error fetching PageSpeed data: {e}")
            if hasattr(response, 'text'):
                st.info(f"API Response: {response.text[:500]}")
    return None

def parse_psi_results(data):
    """
    Parses PSI JSON response into a consolidated dictionary of metrics, opportunities, and diagnostics.
    """
    if not data:
        return None
    
    # Audit mapping
    audits = data.get('lighthouseResult', {}).get('audits', {})
    
    # Core Web Vitals and Key Metrics
    metrics = {
        "Performance Score": data.get('lighthouseResult', {}).get('categories', {}).get('performance', {}).get('score', 0) * 100,
        "Largest Contentful Paint (LCP)": audits.get('largest-contentful-paint', {}),
        "First Contentful Paint (FCP)": audits.get('first-contentful-paint', {}),
        "Cumulative Layout Shift (CLS)": audits.get('cumulative-layout-shift', {}),
        "Total Blocking Time (TBT)": audits.get('total-blocking-time', {}),
        "Speed Index": audits.get('speed-index', {}),
        "Interactive": audits.get('interactive', {}),
    }

    # Extract Opportunities (Improvements with estimated savings)
    opportunities = []
    for audit_id, audit in audits.items():
        if audit.get('details', {}).get('type') == 'opportunity' and audit.get('details', {}).get('overallSavingsMs', 0) > 0:
            opportunities.append({
                "title": audit.get('title'),
                "description": audit.get('description'),
                "savings": audit.get('details', {}).get('overallSavingsMs', 0),
                "items": audit.get('details', {}).get('items', [])
            })
    
    # Sort opportunities by savings
    opportunities = sorted(opportunities, key=lambda x: x['savings'], reverse=True)

    # Extract Diagnostics (Technical issues)
    diagnostics = []
    for audit_id, audit in audits.items():
        if audit.get('score') is not None and audit.get('score') < 0.9 and audit.get('details', {}).get('type') != 'opportunity':
             # Filter for notable diagnostic audits
             if audit_id in ['mainthread-work-breakdown', 'bootup-time', 'uses-long-cache-ttl', 'dom-size', 'offscreen-images', 'unused-css-rules', 'unused-javascript']:
                diagnostics.append({
                    "title": audit.get('title'),
                    "description": audit.get('description'),
                    "displayValue": audit.get('displayValue', ''),
                    "items": audit.get('details', {}).get('items', [])
                })
    
    return {
        "metrics": metrics,
        "opportunities": opportunities,
        "diagnostics": diagnostics
    }

def get_color_for_score(score):
    if score >= 90:
        return "#22c55e" # Green
    elif score >= 50:
        return "#eab308" # Yellow
    else:
        return "#ef4444" # Red

def render_metric_with_status(label, audit):
    score = audit.get('score', 0)
    display_value = audit.get('displayValue', 'N/A')
    
    if score is None:
        color = "#64748b" # Gray
        status = "N/A"
    elif score >= 0.9:
        color = "#22c55e" # Green
        status = "GOOD"
    elif score >= 0.5:
        color = "#eab308" # Yellow
        status = "NEEDS IMPROVEMENT"
    else:
        color = "#ef4444" # Red
        status = "POOR"

    st.markdown(f"""
        <div style="background: rgba(255,255,255,0.03); padding: 10px; border-radius: 8px; border-left: 4px solid {color}; margin-bottom: 10px;">
            <div style="display: flex; justify-content: space-between; align-items: baseline;">
                <span style="font-weight: 600; font-size: 0.9rem; color: #94a3b8;">{label}</span>
                <span style="color: {color}; font-weight: 800; font-size: 0.75rem;">{status}</span>
            </div>
            <div style="font-size: 1.4rem; font-weight: 700; margin-top: 4px;">{display_value}</div>
        </div>
    """, unsafe_allow_html=True)

def render_audit_items(items):
    """
    Renders a list of audit resource items (e.g., specific files) as a clean dataframe.
    """
    if not items:
        return
    
    # Extract relevant columns from the variety of Lighthouse item schemas
    processed_items = []
    for item in items:
        url = item.get('url', item.get('source', 'N/A'))
        if url and len(url) > 100:
             # Shorten long URLs
             url_display = url[:50] + "..." + url[-30:]
        else:
             url_display = url
             
        processed_items.append({
            "Resource": url_display,
            "Total Size (KB)": round(item.get('totalBytes', 0) / 1024, 1) if 'totalBytes' in item else "N/A",
            "Potential Savings (KB)": round(item.get('wastedBytes', 0) / 1024, 1) if 'wastedBytes' in item else "N/A"
        })
    
    if processed_items:
        df = pd.DataFrame(processed_items)
        # Filter out rows that are entirely N/A for sizes
        if "N/A" in df["Total Size (KB)"].values or "N/A" in df["Potential Savings (KB)"].values:
             st.write("Specific resources found:")
             # Fallback to simple list if sizes aren't available
             for i, row in df.head(10).iterrows():
                 st.caption(f"• {row['Resource']}")
        else:
             st.dataframe(df.sort_values(by="Potential Savings (KB)", ascending=False).head(10), use_container_width=True)

def render_cwv_analysis_page():
    st.title("⚡ Core Web Vitals Deep Analysis")
    st.write("Extract detailed diagnostics and actionable improvements from the Google PageSpeed Insights API.")

    col1, col2 = st.columns([3, 1])
    with col1:
        url = st.text_input("Enter Website URL", placeholder="https://example.com")
    with col2:
        analyze_btn = st.button("Run Deep Analysis", type="primary", use_container_width=True)

    # --- Local Lighthouse toggle ---
    use_local_lh = st.checkbox(
        "⚡ Use Local Lighthouse (supports Basic Auth & protected pages)",
        key="cwv_use_local_lh",
        help=(
            "Runs Google Lighthouse CLI locally inside the container. "
            "Required for password-protected or text/plain pages that PSI cannot reach. "
            "Takes ~60–90 s per strategy."
        ),
    )

    # --- Optional Basic Auth credentials ---
    with st.expander("🔒 Authentication (optional — for password-protected pages)"):
        st.caption(
            "Provide HTTP Basic Auth credentials if the page returns a 401. "
            "When **Local Lighthouse** is enabled, credentials are sent as an "
            "`Authorization: Basic` header directly to Chromium."
        )
        auth_col1, auth_col2 = st.columns(2)
        with auth_col1:
            auth_username = st.text_input("Username", key="cwv_auth_user", placeholder="user")
        with auth_col2:
            auth_password = st.text_input("Password", key="cwv_auth_pass",
                                          placeholder="password", type="password")
    auth = (auth_username, auth_password) if auth_username else None

    if analyze_btn and url:
        if not url.startswith("http"):
            st.error("Please enter a valid URL (including http/https)")
            return

        # --- MIME type pre-flight check ---
        with st.spinner("Checking page type..."):
            mime_type, is_html, is_plain_text, resp = detect_mime_type(url, auth=auth)

        # 401 without credentials provided
        if mime_type == "protected" and resp is not None and resp.status_code == 401:
            st.error(
                "🔐 **401 Unauthorized** — This page requires authentication. "
                "Open the **🔒 Authentication** section above and enter your credentials, "
                "then run the analysis again."
            )
            return

        if is_plain_text:
            st.info(
                f"ℹ️ **MIME Type Detected: `text/plain`** — "
                "This URL serves plain text. "
                + (
                    "**Local Lighthouse** is enabled and will analyze this URL directly. "
                    if use_local_lh else
                    "Enable **⚡ Use Local Lighthouse** above for best results on plain-text pages, "
                    "especially if the page is password-protected. "
                    "PSI will attempt to analyze the URL below."
                )
            )
            with st.spinner("Fetching plain-text content for preview..."):
                raw_text, html_preview = fetch_plain_text_content(url, auth=auth)

            if raw_text:
                with st.expander("📄 Plain-Text Content (HTML-wrapped preview)", expanded=False):
                    col_raw, col_html = st.tabs(["Raw Text", "HTML Wrapper"])
                    with col_raw:
                        st.code(raw_text[:4000] + ("\n…[truncated]" if len(raw_text) > 4000 else ""),
                                language="text")
                    with col_html:
                        st.code(html_preview[:4000] + ("\n…[truncated]" if len(html_preview) > 4000 else ""),
                                language="html")
            # Fall through to analysis below (no return)

        elif not is_html:
            render_non_html_analysis(url, mime_type, resp)
            return

        # ── Branch: Local Lighthouse OR PSI ──────────────────────────────────
        if use_local_lh:
            st.markdown("---")
            st.info(
                "⚡ **Local Lighthouse** is running. "
                "This uses Chromium inside the container and supports Basic Auth headers. "
                "Each strategy takes ~60–90 seconds."
            )
            with st.spinner("⚡ Running local Lighthouse — Mobile... (~60–90 s)"):
                m_lh = run_local_lighthouse(url, auth=auth, strategy="mobile")
            with st.spinner("⚡ Running local Lighthouse — Desktop... (~60–90 s)"):
                d_lh = run_local_lighthouse(url, auth=auth, strategy="desktop")

            m_results = parse_lighthouse_json(m_lh)
            d_results = parse_lighthouse_json(d_lh)

            if m_results and d_results:
                tab_m, tab_d = st.tabs(["📱 Mobile (Local Lighthouse)", "💻 Desktop (Local Lighthouse)"])
                with tab_m:
                    render_detailed_results(m_results, "Mobile")
                with tab_d:
                    render_detailed_results(d_results, "Desktop")
            else:
                st.error("⚡ Local Lighthouse failed for one or both strategies. Check the errors above.")

        else:
            # PSI cloud path
            if auth:
                st.info(
                    "🔐 Credentials will be used for the server-level pre-flight check. "
                    "Note: Google’s PSI Lighthouse crawler **cannot authenticate** with "
                    "password-protected pages — enable **⚡ Use Local Lighthouse** above to bypass this."
                )

            with st.spinner(f"Running deep audit on {url}... (approx. 45-60 seconds)"):
                mobile_data = fetch_pagespeed_results(url, strategy="mobile")
                desktop_data = fetch_pagespeed_results(url, strategy="desktop")

            # Detect if PSI was blocked (auth-protected page, network error, etc.)
            psi_blocked = (
                (mobile_data and mobile_data.get("__psi_blocked__"))
                or (desktop_data and desktop_data.get("__psi_blocked__"))
            )

            if psi_blocked:
                block_msg = (mobile_data or desktop_data or {}).get("message", "")
                st.warning(
                    "🚫 **PageSpeed Insights could not load this page.**\n\n"
                    "This usually means the page requires authentication or is restricted "
                    "from external crawlers.\n\n"
                    f"*Lighthouse error:* `{block_msg[:300]}`\n\n"
                    "✅ **Tip:** Enable **⚡ Use Local Lighthouse** above — it runs Chromium "
                    "inside the container and supports Basic Auth headers."
                )
                render_non_html_analysis(url, mime_type, resp)
            elif mobile_data and desktop_data:
                m_results = parse_psi_results(mobile_data)
                d_results = parse_psi_results(desktop_data)

                tab_m, tab_d = st.tabs(["📱 Mobile Deep Audit", "💻 Desktop Deep Audit"])
                with tab_m:
                    render_detailed_results(m_results, "Mobile")
                with tab_d:
                    render_detailed_results(d_results, "Desktop")
            elif not psi_blocked:
                st.error("Failed to retrieve deep data for one or both strategies.")

def render_detailed_results(results, label):
    metrics = results["metrics"]
    score = metrics["Performance Score"]
    score_color = get_color_for_score(score)

    # Hero Section
    st.markdown(f"""
        <div style="text-align: center; padding: 30px; border-radius: 20px; background: radial-gradient(circle at center, {score_color}11 0%, rgba(15, 23, 42, 0.5) 100%); border: 1px solid {score_color}44; margin-bottom: 30px;">
            <h1 style="margin: 0; color: {score_color}; font-size: 4rem; text-shadow: 0 0 20px {score_color}33;">{int(score)}</h1>
            <p style="margin: 0; font-weight: 800; letter-spacing: 2px; color: {score_color}cc;">{label.upper()} PERFORMANCE SCORE</p>
        </div>
    """, unsafe_allow_html=True)

    # Core Web Vitals Row
    st.subheader("📊 Core Web Vitals & Vital Metrics")
    c1, c2, c3 = st.columns(3)
    with c1:
        render_metric_with_status("Largest Contentful Paint", metrics["Largest Contentful Paint (LCP)"])
        render_metric_with_status("First Contentful Paint", metrics["First Contentful Paint (FCP)"])
    with c2:
        render_metric_with_status("Cumulative Layout Shift", metrics["Cumulative Layout Shift (CLS)"])
        render_metric_with_status("Total Blocking Time", metrics["Total Blocking Time (TBT)"])
    with c3:
        render_metric_with_status("Speed Index", metrics["Speed Index"])
        render_metric_with_status("Interactivity", metrics["Interactive"])

    st.markdown("---")

    # Improvements & Diagnostics
    col_opp, col_diag = st.columns(2)

    with col_opp:
        st.subheader("💡 Optimization Opportunities")
        st.markdown("_Actions that can significantly reduce page load time._")
        if not results["opportunities"]:
            st.success("✨ No major optimization opportunities detected!")
        else:
            for opp in results["opportunities"]:
                with st.expander(f"**{opp['title']}** (Potential savings: {opp['savings']}ms)"):
                    st.write(opp['description'])
                    render_audit_items(opp.get('items'))
    
    with col_diag:
        st.subheader("🔍 Technical Diagnostics")
        st.markdown("_Specific technical issues found during the audit._")
        if not results["diagnostics"]:
            st.success("✅ No critical technical diagnostics found.")
        else:
            for diag in results["diagnostics"]:
                title = diag.get('title', 'Diagnostic')
                val = diag.get('displayValue', '')
                header = f"**{title}**" + (f" - {val}" if val else "")
                with st.expander(header):
                    st.write(diag.get('description', ''))
                    render_audit_items(diag.get('items'))

    # Final Recommendation
    st.markdown("---")
    st.subheader("🛠️ Priority Improvement Guide")
    st.markdown("_Step-by-step instructions to fix the most critical issues._")
    
    # Collect all failing IDs
    failing_audits = []
    
    # Check metrics
    metric_map = {
        "largest-contentful-paint": "largest-contentful-paint-element",
        "cumulative-layout-shift": "cumulative-layout-shift",
        "total-blocking-time": "mainthread-work-breakdown"
    }
    
    for metric_key, audit_key in metric_map.items():
        audit = metrics.get(f"{metric_key.replace('-', ' ').title()} ({metric_key.upper() if len(metric_key) == 3 else ''})", {})
        # Quick hack for the metric naming mismatch in my previous implementation
        # Better: just check the actual audits in the raw data but I parsed them into 'metrics'
        pass

    # A more reliable way: just use the opportunities and diagnostics we already found
    all_issues = []
    for opp in results["opportunities"]:
        all_issues.append({"id": None, "title": opp['title'], "type": "opportunity"})
    for diag in results["diagnostics"]:
        all_issues.append({"id": None, "title": diag['title'], "type": "diagnostic"})

    # Map titles back to our guide keys (fuzzy matching since titles vary)
    guides_to_show = []
    
    # Pre-check certain known patterns in titles
    title_to_key = {
        "unused css": "unused-css-rules",
        "unused javascript": "unused-javascript",
        "modern formats": "modern-image-formats",
        "properly size images": "uses-responsive-images",
        "render-blocking": "render-blocking-resources",
        "largest contentful paint": "largest-contentful-paint-element",
        "layout shift": "cumulative-layout-shift",
        "main-thread": "mainthread-work-breakdown",
        "third-party code": "mainthread-work-breakdown",
        "long tasks": "mainthread-work-breakdown",
        "interaction to next paint": "mainthread-work-breakdown",
        "dom size": "mainthread-work-breakdown"
    }

    for issue in all_issues:
        for pattern, key in title_to_key.items():
            if pattern.lower() in issue['title'].lower():
                if key not in [g['key'] for g in guides_to_show]:
                    guides_to_show.append({"key": key, "issue_title": issue['title']})
                break

    if not guides_to_show:
        st.balloons()
        st.success("Your site is performing exceptionally well! No critical improvements needed.")
    else:
        for i, guide_info in enumerate(guides_to_show[:5], 1): # Show top 5
            guide = IMPROVEMENT_GUIDES[guide_info['key']]
            with st.expander(f"**Step {i}: {guide['title']}**", expanded=(i == 1)):
                st.info(f"Address: {guide_info['issue_title']}")
                for step in guide['steps']:
                    st.markdown(f"- {step}")
                st.button(f"Mark as Read", key=f"read_{label}_{i}")

if __name__ == "__main__":
    render_cwv_analysis_page()
