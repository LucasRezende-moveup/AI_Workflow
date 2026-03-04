import streamlit as st
import requests
import os
import pandas as pd
from datetime import datetime

# PageSpeed Insights API endpoint
PSI_API_URL = "https://www.googleapis.com/pagespeedonline/v5/runPagespeed"

IMPROVEMENT_GUIDES = {
    "unused-css-rules": {
        "title": "Reduce Unused CSS",
        "steps": [
            "**Identify:** Use the 'Coverage' tab in Chrome DevTools to find unused CSS in real-time.",
            "**Inline Critical CSS:** Extract the CSS required for above-the-fold content and inline it in the `<head>`.",
            "**Defer Non-Critical CSS:** Load the remaining CSS asynchronously using `rel='preload'` and a script fallback.",
            "**Purge:** Use tools like PurgeCSS or UnusedCSS to remove dead code from your stylesheets."
        ]
    },
    "unused-javascript": {
        "title": "Reduce Unused JavaScript",
        "steps": [
            "**Code Splitting:** Use dynamic `import()` to load JavaScript only when needed.",
            "**Audit Analytics:** Remove or defer non-essential third-party scripts (e.g., old tracking tags).",
            "**Minification:** Ensure your build process (Webpack/Vite) is minifying and 'tree-shaking' your bundles.",
            "**Delay Execution:** Use `defer` or `async` attributes on all non-critical script tags."
        ]
    },
    "modern-image-formats": {
        "title": "Serve Images in Modern Formats",
        "steps": [
            "**Convert to WebP/AVIF:** Use tools like Squoosh or sharp to convert JPEGs and PNGs.",
            "**Use Picture Tag:** Implement `<picture>` tags with multiple source formats for browser compatibility.",
            "**CDN Optimization:** Use an Image CDN (like Cloudinary or Imgix) to automatically serve the best format."
        ]
    },
    "uses-responsive-images": {
        "title": "Properly Size Images",
        "steps": [
            "**Srcset Attributes:** Provide multiple image sizes using the `srcset` attribute.",
            "**CSS Constraints:** Ensure images have `max-width: 100%; height: auto;` to prevent overflow.",
            "**Lazy Loading:** Use `loading='lazy'` to prevent offscreen images from loading too early."
        ]
    },
    "render-blocking-resources": {
        "title": "Eliminate Render-Blocking Resources",
        "steps": [
            "**Async/Defer Scripts:** Add `async` or `defer` to `<script>` tags in the head.",
            "**Critical CSS:** Inline the CSS needed for the first paint and load the rest later.",
            "**Font Display:** Use `font-display: swap;` in your `@font-face` rules to prevent hidden text during load."
        ]
    },
    "largest-contentful-paint-element": {
        "title": "Optimize Largest Contentful Paint (LCP)",
        "steps": [
            "**Prioritize LCP Image:** Ensure the LCP image is NOT lazy-loaded and has `fetchpriority='high'`.",
            "**Server Response:** Improve TTFB by using caching (Edge/Browser) and optimizing database queries.",
            "**Remove Large Obstacles:** Ensure no large JS bundles are blocking the main thread before the LCP element renders."
        ]
    },
    "cumulative-layout-shift": {
        "title": "Improve Cumulative Layout Shift (CLS)",
        "steps": [
            "**Set Dimensions:** Always include `width` and `height` attributes on images and video elements.",
            "**Reserve Space for Ads:** Use a container with a fixed minimum height for dynamic content like banners.",
            "**Avoid Dynamic Injection:** Don't insert content above existing content unless it's in response to a user action."
        ]
    },
    "mainthread-work-breakdown": {
        "title": "Minimize Main-Thread Work",
        "steps": [
            "**Web Workers:** Move long-running scripts to a Web Worker thread.",
            "**Reduce Third-Party Bloat:** Audit and remove heavy third-party libraries that execute on load.",
            "**Debounce/Throttle:** Use debouncing for scroll and resize event listeners."
        ]
    }
}

import time

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

    if analyze_btn and url:
        if not url.startswith("http"):
            st.error("Please enter a valid URL (including http/https)")
            return

        with st.spinner(f"Running deep audit on {url}... (approx. 45-60 seconds)"):
            mobile_data = fetch_pagespeed_results(url, strategy="mobile")
            desktop_data = fetch_pagespeed_results(url, strategy="desktop")

            if mobile_data and desktop_data:
                m_results = parse_psi_results(mobile_data)
                d_results = parse_psi_results(desktop_data)

                tab_m, tab_d = st.tabs(["📱 Mobile Deep Audit", "💻 Desktop Deep Audit"])

                with tab_m:
                    render_detailed_results(m_results, "Mobile")
                
                with tab_d:
                    render_detailed_results(d_results, "Desktop")
            else:
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
        "main-thread": "mainthread-work-breakdown"
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
