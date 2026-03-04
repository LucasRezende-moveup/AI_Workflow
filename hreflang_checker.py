import streamlit as st
import requests
from bs4 import BeautifulSoup
import pandas as pd
import os
import re
import google.generativeai as genai
from urllib.parse import urlparse
from concurrent.futures import ThreadPoolExecutor, as_completed
import io
from sheets_client import SheetsClient

def get_urls_from_sitemap(sitemap_url, depth=0):
    """
    Extracts all URLs from an XML sitemap or sitemap index with parallel processing for indexes.
    """
    if depth > 5: # Prevent infinite cycles
        return []
        
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
    }
    try:
        response = requests.get(sitemap_url, headers=headers, timeout=15)
        response.raise_for_status()
        # Using html.parser for XML since lxml might not be available
        soup = BeautifulSoup(response.text, 'html.parser')
        
        # Check for sitemap index
        sitemaps = soup.find_all('sitemap')
        if sitemaps:
            all_urls = []
            sm_urls = []
            for sm in sitemaps:
                loc = sm.find('loc')
                if loc:
                    sm_urls.append(loc.text.strip())
            
            if sm_urls:
                with ThreadPoolExecutor(max_workers=5) as executor:
                    futures = [executor.submit(get_urls_from_sitemap, url, depth + 1) for url in sm_urls]
                    for future in as_completed(futures):
                        all_urls.extend(future.result())
            return list(set(all_urls))
            
        urls = [loc.get_text(strip=True) for loc in soup.find_all('loc')]
        return urls
    except Exception as e:
        st.error(f"Error parsing sitemap {sitemap_url}: {e}")
        return []

def extract_page_info(url):
    """
    Extracts hreflang tags and basic metadata (title, h1) from a URL.
    """
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
    }
    try:
        response = requests.get(url, headers=headers, timeout=15)
        response.raise_for_status()
        soup = BeautifulSoup(response.text, 'html.parser')
        
        title = soup.title.string if soup.title else ""
        h1 = soup.find('h1').get_text(strip=True) if soup.find('h1') else ""
        
        tags = []
        links = soup.find_all('link', rel='alternate')
        for link in links:
            hreflang = link.get('hreflang')
            href = link.get('href')
            if hreflang and href:
                tags.append({
                    'hreflang': hreflang,
                    'href': href if href.startswith('http') else requests.compat.urljoin(url, href)
                })
        
        return {
            'url': url,
            'title': title,
            'h1': h1,
            'hreflangs': tags,
            'status_code': response.status_code,
            'detected_lang': detect_page_language({'url': url, 'title': title, 'h1': h1})
        }, None
    except Exception as e:
        status_code = getattr(e.response, 'status_code', 0) if hasattr(e, 'response') else 0
        return {
            'url': url,
            'title': 'Error',
            'h1': '',
            'hreflangs': [],
            'status_code': status_code
        }, str(e)

def check_reciprocity(source_url, target_url, source_lang):
    """
    Checks if the target_url has a hreflang tag pointing back to source_url.
    """
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
    }
    try:
        response = requests.get(target_url, headers=headers, timeout=10)
        if response.status_code != 200:
            return False, f"HTTP Error {response.status_code}"
            
        soup = BeautifulSoup(response.text, 'html.parser')
        links = soup.find_all('link', rel='alternate')
        
        for link in links:
            if link.get('hreflang') == source_lang:
                target_href = link.get('href')
                if target_href:
                    # Normalize and compare
                    absolute_target_href = requests.compat.urljoin(target_url, target_href).rstrip('/')
                    if absolute_target_href == source_url.rstrip('/'):
                        return True, "Valid"
        
        return False, "Missing Reciprocal Link"
    except Exception as e:
        return False, f"Connection Failed: {str(e)}"

def get_stripped_slug(url):
    """
    Strips domain and language prefixes to help identify similar pages.
    """
    path = urlparse(url).path.strip('/')
    # Remove common language prefixes (2-letter or 5-letter codes)
    path = re.sub(r'^(en|pt|es|fr|de|it|br|us|uk|en-us|pt-br)/', '', path, flags=re.IGNORECASE)
    # Remove common file extensions
    path = re.sub(r'\.(html|php|asp|aspx)$', '', path, flags=re.IGNORECASE)
    return path if path else "homepage"

def detect_page_language(page_data):
    """
    Uses Gemini to detect the primary language of the page content.
    """
    api_key = os.getenv("GOOGLE_API_KEY")
    if not api_key:
        return "unknown"

    try:
        genai.configure(api_key=api_key)
        model = genai.GenerativeModel("models/gemini-1.5-flash")
        
        prompt = f"""
        Analyze the following page data and identify the primary language (ISO 639-1 code).
        
        URL: {page_data['url']}
        Title: {page_data['title']}
        H1: {page_data['h1']}
        
        Reply ONLY with the 2-letter ISO code (e.g., 'pt', 'en', 'es').
        """
        
        response = model.generate_content(prompt)
        return response.text.strip().lower()[:2]
    except:
        return "unknown"

def verify_semantic_equivalence_batch(pairs):
    """
    Uses Gemini to verify multiple pairs of pages at once.
    """
    api_key = os.getenv("GOOGLE_API_KEY")
    if not api_key or not pairs:
        return []

    try:
        genai.configure(api_key=api_key)
        model = genai.GenerativeModel("models/gemini-1.5-flash")
        
        pairs_str = ""
        for i, (p1, p2) in enumerate(pairs):
            pairs_str += f"Pair {i}:\n  Page A: {p1['url']} (Title: {p1['title']}, H1: {p1['h1']})\n  Page B: {p2['url']} (Title: {p2['title']}, H1: {p2['h1']})\n\n"
        
        prompt = f"""
        Determine if the following pairs of pages are semantic equivalents (translations of each other).
        
        {pairs_str}
        
        Reply with a JSON array of objects: [{{"pair_index": 0, "match": true, "confidence": 0.9, "reason": "..."}}, ...]
        Only return the JSON.
        """
        
        response = model.generate_content(prompt)
        text = response.text.replace('```json', '').replace('```', '').strip()
        import json
        results = json.loads(text)
        return results
    except Exception as e:
        return []

def suggest_hreflang_mappings(all_pages):
    """
    Detects potential missing hreflang connections between pages.
    """
    suggestions = []
    
    # 1. Group by stripped slug (Heuristic)
    slug_groups = {}
    for page in all_pages:
        slug = get_stripped_slug(page['url'])
        if slug not in slug_groups:
            slug_groups[slug] = []
        slug_groups[slug].append(page)
        
    potential_pairs = []
    for slug, pages in slug_groups.items():
        if len(pages) < 2:
            continue
            
        # Check pairs in the group
        for i in range(len(pages)):
            for j in range(i + 1, len(pages)):
                p1, p2 = pages[i], pages[j]
                
                # Check if they are already connected via hreflang
                connected = any(t['href'].rstrip('/') == p2['url'].rstrip('/') for t in p1['hreflangs'])
                
                if not connected:
                    potential_pairs.append((p1, p2))
    
    # Process potential pairs in batches of 5 to avoid prompt overflow and keep it efficient
    batch_size = 5
    for i in range(0, len(potential_pairs), batch_size):
        batch = potential_pairs[i:i+batch_size]
        results = verify_semantic_equivalence_batch(batch)
        
        for res in results:
            idx = res.get('pair_index')
            if idx is not None and idx < len(batch):
                if res.get('match') and res.get('confidence', 0) > 0.7:
                    p1, p2 = batch[idx]
                    suggestions.append({
                        "Page A": p1['url'],
                        "Page B": p2['url'],
                        "Confidence": res.get('confidence'),
                        "Recommendation": f"Add hreflang alternate between these pages."
                    })
    return suggestions

def render_hreflang_checker_page(gsc_client=None):
    st.title("🌐 Hreflang & Sitemap Auditor")
    st.write("Audit international SEO tags, verify reciprocal links, and discover missing mappings across your sitemap.")

    mode = st.radio("Select Mode", ["Single URL Audit", "Sitemap-wide Audit"], horizontal=True)

    if mode == "Single URL Audit":
        col1, col2 = st.columns([3, 1])
        with col1:
            url = st.text_input("Enter URL to Audit", placeholder="https://example.com/en/")
        with col2:
            check_btn = st.button("Run Audit", type="primary", use_container_width=True)

        if check_btn and url:
            run_single_audit(url, gsc_client)
    
    else:
        sitemap_urls_text = st.text_area("Enter Sitemap URLs (one per line)", placeholder="https://example.com/sitemap.xml\nhttps://example.br/sitemap.xml", help="Enter multiple sitemap URLs to compare pages across them.")
        if st.button("Fetch & Audit Sitemaps", type="primary"):
            # Process multiple URLs
            urls_list = [u.strip() for u in sitemap_urls_text.split('\n') if u.strip().startswith('http')]
            if urls_list:
                run_sitemap_audit(urls_list, gsc_client)
            else:
                st.error("Please enter at least one valid Sitemap URL.")

def run_single_audit(url, gsc_client=None):
    if not url.startswith("http"):
        st.error("Please enter a valid URL.")
        return

    with st.spinner(f"Auditing {url}..."):
        page_info, error = extract_page_info(url)
        
        if error:
            st.error(f"Failed to fetch page: {error}")
            return

        tags = page_info['hreflangs']
        if not tags:
            st.warning("No hreflang tags found on this page.")
            return

        st.subheader(f"✅ Found {len(tags)} Hreflang Tags")
        st.caption(f"**Title**: {page_info['title']} | **H1**: {page_info['h1']} | **Detected Language**: {page_info.get('detected_lang', 'unknown').upper()}")
        
        # Check for self-reference
        self_ref_tag = next((t for t in tags if t['href'].rstrip('/') == url.rstrip('/')), None)
        self_ref = self_ref_tag is not None
        
        if self_ref:
            st.info("ℹ️ Self-referencing hreflang found.")
            # Verify if detected language matches the hreflang code
            hreflang_code = self_ref_tag['hreflang'].split('-')[0].lower()
            detected = page_info.get('detected_lang', '').lower()
            if detected != "unknown" and hreflang_code != detected:
                st.warning(f"⚠️ **Language Mismatch**: Page appears to be in `{detected.upper()}`, but hreflang says `{self_ref_tag['hreflang'].upper()}`.")
        else:
            st.error("❌ Missing self-referencing hreflang tag.")

        # Check for x-default
        x_default = any(t['hreflang'] == 'x-default' for t in tags)
        if x_default:
            st.info("ℹ️ x-default tag found.")
        else:
            st.warning("⚠️ Missing x-default tag.")

        st.markdown("---")
        st.subheader("🔍 Reciprocal Validation")
        st.write("Verifying if target pages link back to this source.")

        results = []
        source_lang = None
        for t in tags:
            if t['href'].rstrip('/') == url.rstrip('/'):
                source_lang = t['hreflang']
                break

        if not source_lang:
            st.error("Cannot verify reciprocity without a self-referencing tag to identify source language.")
        else:
            progress_bar = st.progress(0)
            status_msg = st.empty()
            
            # Use ThreadPoolExecutor for parallel reciprocity checks
            with ThreadPoolExecutor(max_workers=10) as executor:
                future_to_tag = {}
                for tag in tags:
                    if tag['href'].rstrip('/') == url.rstrip('/'):
                        results.append({
                            "Language": tag['hreflang'],
                            "URL": tag['href'],
                            "Status": "✅ Self",
                            "Message": "Self-referencing"
                        })
                    else:
                        future = executor.submit(check_reciprocity, url, tag['href'], source_lang)
                        future_to_tag[future] = tag

                for i, future in enumerate(as_completed(future_to_tag)):
                    tag = future_to_tag[future]
                    try:
                        is_valid, msg = future.result()
                        results.append({
                            "Language": tag['hreflang'],
                            "URL": tag['href'],
                            "Status": "✅ OK" if is_valid else "❌ Error",
                            "Message": msg
                        })
                    except Exception as exc:
                        results.append({
                            "Language": tag['hreflang'],
                            "URL": tag['href'],
                            "Status": "❌ Error",
                            "Message": f"Exception: {exc}"
                        })
                    progress_bar.progress((i + 1) / len(tags))
                    status_msg.text(f"Verified {i+1}/{len(tags)} links...")

            df = pd.DataFrame(results)
            def highlight_status(val):
                if "✅" in str(val): return 'color: #22c55e'
                return 'color: #ef4444'
            st.dataframe(df.style.applymap(highlight_status, subset=['Status']), use_container_width=True)
            
            # CSV Export
            csv = df.to_csv(index=False).encode('utf-8')
            st.download_button(
                label="📥 Download Audit CSV",
                data=csv,
                file_name=f"hreflang_audit_{urlparse(url).netloc}.csv",
                mime="text/csv",
            )
            
            if gsc_client and gsc_client.credentials:
                if st.button("📊 Export to Google Sheets"):
                    with st.spinner("Creating spreadsheet..."):
                        sheets = SheetsClient(gsc_client.credentials)
                        sheet_id = sheets.create_spreadsheet(f"Hreflang Audit - {url}")
                        if sheet_id:
                            sheets.write_matrix(sheet_id, df)
                            st.success(f"✅ Exported to Google Sheets! ID: {sheet_id}")
                            st.markdown(f"[Open Spreadsheet](https://docs.google.com/spreadsheets/d/{sheet_id})")
                        else:
                            st.error("Failed to create spreadsheet.")

def run_sitemap_audit(sitemap_urls, gsc_client=None):
    """
    Handles auditing for one or more sitemap URLs.
    """
    all_urls = []
    with st.spinner("Fetching sitemap URLs..."):
        for s_url in sitemap_urls:
            urls = get_urls_from_sitemap(s_url)
            if urls:
                all_urls.extend(urls)
    
    # Deduplicate while preserving order if possible
    unique_urls = list(dict.fromkeys(all_urls))
        
    if not unique_urls:
        st.warning("No URLs found in the provided sitemaps.")
        return

    st.info(f"📂 Found {len(unique_urls)} unique URLs across {len(sitemap_urls)} sitemaps. Starting batch audit with parallel processing...")
    
    all_page_data = []
    progress_bar = st.progress(0)
    status_text = st.empty()
    
    # Process all unique URLs in parallel
    with ThreadPoolExecutor(max_workers=10) as executor:
        future_to_url = {executor.submit(extract_page_info, url): url for url in unique_urls}
        
        for i, future in enumerate(as_completed(future_to_url)):
            url = future_to_url[future]
            status_text.text(f"Processing ({i+1}/{len(unique_urls)}): {url}")
            try:
                info, error = future.result()
                if info:
                    all_page_data.append(info)
            except Exception as e:
                st.error(f"Error processing {url}: {e}")
            progress_bar.progress((i + 1) / len(unique_urls))
    
    st.subheader("📊 Combined Sitemap Audit Summary")
    
    summary_results = []
    total_issues = 0
    total_hreflang_tags = 0
    
    for info in all_page_data:
        has_hreflang = len(info['hreflangs']) > 0
        self_ref = any(t['href'].rstrip('/') == info['url'].rstrip('/') for t in info['hreflangs'])
        is_broken = info.get('status_code') != 200
        
        status = "✅ OK"
        if is_broken:
            status = f"❌ Broken ({info.get('status_code')})"
            total_issues += 1
        elif not has_hreflang:
            status = "⚠️ Missing Tags"
            total_issues += 1
        elif not self_ref:
            status = "❌ No Self-Ref"
            total_issues += 1
            
        total_hreflang_tags += len(info['hreflangs'])
        
        summary_results.append({
            "URL": info['url'],
            "HTTP": info.get('status_code'),
            "Detected Lang": info.get('detected_lang', '??').upper(),
            "Tags": len(info['hreflangs']),
            "Self-Ref": "✅" if self_ref else "❌",
            "Status": status
        })
    
    # Metric Hero for batch audit
    m1, m2, m3, m4 = st.columns(4)
    with m1:
        st.metric("Total URLs Scanned", len(all_page_data))
    with m2:
        st.metric("Total Hreflang Tags", total_hreflang_tags)
    with m3:
        st.metric("Pages with Issues", total_issues, delta=total_issues, delta_color="inverse" if total_issues > 0 else "normal")
    with m4:
        health = (len(all_page_data) - total_issues) / len(all_page_data) * 100 if all_page_data else 0
        st.metric("Overall Health", f"{health:.1f}%")

    df_summary = pd.DataFrame(summary_results)
    st.dataframe(df_summary, use_container_width=True)
    
    # CSV Export for Sitemap Audit
    csv_batch = df_summary.to_csv(index=False).encode('utf-8')
    st.download_button(
        label="📥 Download Batch Audit CSV",
        data=csv_batch,
        file_name=f"hreflang_batch_audit.csv",
        mime="text/csv",
    )
    
    if gsc_client and gsc_client.credentials:
        if st.button("📊 Export Batch to Google Sheets"):
            with st.spinner("Creating spreadsheet..."):
                sheets = SheetsClient(gsc_client.credentials)
                sheet_id = sheets.create_spreadsheet(f"Hreflang Batch Audit - {datetime.date.today()}")
                if sheet_id:
                    sheets.write_matrix(sheet_id, df_summary)
                    st.success(f"✅ Exported to Google Sheets! ID: {sheet_id}")
                    st.markdown(f"[Open Spreadsheet](https://docs.google.com/spreadsheets/d/{sheet_id})")
                else:
                    st.error("Failed to create spreadsheet.")
    
    import datetime
    
    # Suggestion Engine implementation
    st.markdown("---")
    st.subheader("🤖 AI Suggestions & Missing Mappings")
    st.write("Analyzing pages for potential cross-language connections based on path similarity and content verification.")
    
    with st.spinner("Analyzing semantic relationships..."):
        suggestions = suggest_hreflang_mappings(all_page_data)
    
    if suggestions:
        st.warning(f"💡 Found {len(suggestions)} potential missing connections!")
        df_sug = pd.DataFrame(suggestions)
        st.dataframe(df_sug, use_container_width=True)
        
        # Generator for the code
        with st.expander("🛠️ Generate Hreflang Code"):
            st.write("Add these tags to the `<head>` of your pages:")
            for sug in suggestions:
                st.code(f"<!-- On {sug['Page A']} -->\n<link rel=\"alternate\" hreflang=\"...\" href=\"{sug['Page B']}\" />\n\n<!-- On {sug['Page B']} -->\n<link rel=\"alternate\" hreflang=\"...\" href=\"{sug['Page A']}\" />")
    else:
        st.success("No missing hreflang mappings detected among the scanned pages.")

if __name__ == "__main__":
    render_hreflang_checker_page()
