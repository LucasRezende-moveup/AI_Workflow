try:
    import streamlit as st
except ImportError:
    st = None
import requests
from bs4 import BeautifulSoup
import json
import os
import google.generativeai as genai
from urllib.parse import urlparse, urljoin

def scrape_internal_links(url, auth=None):
    """
    Scrapes a URL and extracts internal links with anchor text.
    Accepts an optional auth=(username, password) tuple for HTTP Basic Auth.
    """
    try:
        if not url.startswith('http'):
            url = 'https://' + url
            
        domain = urlparse(url).netloc
        headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'}
        
        try:
            response = requests.get(url, headers=headers, timeout=15, auth=auth or None)
        except requests.exceptions.SSLError:
            # Fallback for SSL issues (common on Windows)
            response = requests.get(url, headers=headers, timeout=15, verify=False, auth=auth or None)
            
        response.raise_for_status()
        
        soup = BeautifulSoup(response.text, 'lxml')
        
        # Meta Tags
        title = soup.find('title').text if soup.find('title') else "N/A"
        
        # Remove common non-content elements to ignore menu links
        for tag in ['header', 'footer', 'nav', 'aside']:
            for entry in soup.find_all(tag):
                entry.decompose()
        
        # Try to find the "main" content area
        content_area = soup.find('main') or soup.find('article') or \
                       soup.find(id='content') or soup.find(id='main') or \
                       soup.find(class_='content') or soup.find(class_='main')
        
        # If no specific content area found, use the cleaned body
        search_root = content_area if content_area else soup.body or soup
        
        # Word count estimate
        text_content = search_root.get_text(separator=' ', strip=True)
        word_count = len(text_content.split())

        links = []
        for a in search_root.find_all('a', href=True):
            href = a['href']
            full_url = urljoin(url, href)
            parsed_href = urlparse(full_url)
            
            # Categorize
            is_internal = parsed_href.netloc == domain
            anchor_text = a.get_text(strip=True) or "[No Text/Image]"
            
            if is_internal:
                links.append({
                    "anchor": anchor_text,
                    "url": full_url,
                    "target": "internal"
                })
        
        return {
            "source_url": url,
            "title": title,
            "word_count": word_count,
            "internal_links_count": len(links),
            "links": links[:100], # Limit for context
            "error": None
        }
    except Exception as e:
        return {"source_url": url, "error": str(e)}

def analyze_linking_strategy(scraped_data, target_urls):
    """
    Uses Gemini to analyze the internal linking strategy and interactions.
    """
    api_key = os.getenv("GOOGLE_API_KEY")
    if not api_key:
        return "Gemini API key not found."

    try:
        genai.configure(api_key=api_key)
        available_models = [m.name for m in genai.list_models() if 'generateContent' in m.supported_generation_methods]
        
        target_model = None
        for alias in ['models/gemini-2.5-flash', 'models/gemini-2.0-flash', 'models/gemini-1.5-flash', 'models/gemini-flash-latest']:
            if alias in available_models:
                target_model = alias
                break
        
        if not target_model:
            target_model = available_models[0]

        model = genai.GenerativeModel(target_model)
        
        prompt = f"""
        You are a Technical SEO Analyst. Analyze the following internal linking data for a set of URLs.
        
        TARGET URL SET: {target_urls}
        
        DATA:
        {json.dumps(scraped_data, indent=2)}
        
        YOUR TASK:
        1. INTER-LINKING ANALYSIS: Identify how many times these pages link to each other within the "TARGET URL SET". Are they creating a strong silo, or are they isolated?
        2. ANCHOR QUALITY: Evaluate the anchor texts. Are they descriptive or too generic?
        3. SUMMARY TABLE: Create a Markdown table summarizing each URL's internal link count and their primary link targets.
        4. INTERACTION SUMMARY: Create a table showing which URL links to which other URL in the set (Incoming/Outgoing within the group).
        5. RECOMMENDATIONS: Suggest specific ways to improve the inter-connectivity of these specific pages.
        
        OUTPUT FORMAT:
        - Summary Tables.
        - Detailed Strategy Analysis.
        - Interaction Matrix/Table.
        - Actionable Recommendations.
        """
        
        response = model.generate_content(prompt)
        return response.text
    except Exception as e:
        return f"Analysis failed: {e}"

from sheets_client import SheetsClient

def render_internal_linking_page(gsc_client=None):
    st.markdown("### 🔍 Link Discovery Setup")
    with st.container(border=True):
        urls_input = st.text_area("Target URLs (one per line)", placeholder="https://example.com/page1\nhttps://example.com/page2", help="The AI will analyze how these pages link to each other.")

    with st.expander("🔒 Authentication (Optional — for password-protected pages)"):
        use_auth = st.checkbox("These pages require authentication", key="il_use_auth")
        auth = None
        if use_auth:
            a_col1, a_col2 = st.columns(2)
            with a_col1:
                auth_user = st.text_input("Username", key="il_auth_user", placeholder="user")
            with a_col2:
                auth_pass = st.text_input("Password", key="il_auth_pass", placeholder="password", type="password")
            auth = (auth_user, auth_pass) if auth_user else None

    st.markdown("<br>", unsafe_allow_html=True)
    
    # Session State Initialization
    if 'il_results' not in st.session_state:
        st.session_state.il_results = None

    col_btn1, col_btn2 = st.columns([1, 4])
    analyze_btn = col_btn1.button("Analyze Internal Links", type="primary")
    if st.session_state.il_results and col_btn2.button("🗑️ Clear Results"):
        st.session_state.il_results = None
        st.rerun()

    if analyze_btn:
        input_urls = [u.strip() for u in urls_input.split('\n') if u.strip()]
        if not input_urls:
            st.error("Please enter at least one URL.")
        else:
            import pandas as pd
            all_data = []
            progress_bar = st.progress(0)
            
            for i, url in enumerate(input_urls):
                with st.spinner(f"Scraping {url}..."):
                    data = scrape_internal_links(url, auth=auth)
                    all_data.append(data)
                progress_bar.progress((i + 1) / len(input_urls))
            
            # --- Data Summary Table ---
            summary_rows = []
            for d in all_data:
                if d.get('error'):
                    summary_rows.append({"URL": d['source_url'], "Status": f"❌ {d['error']}", "Title": "N/A", "Links": 0, "Words": 0})
                else:
                    inter_links = [l for l in d['links'] if any(target in l['url'] for target in input_urls if target != d['source_url'])]
                    summary_rows.append({
                        "URL": d['source_url'],
                        "Status": "✅ OK",
                        "Title": d.get('title', 'N/A'),
                        "Contextual Links": d.get('internal_links_count', 0),
                        "Inter-links": len(inter_links),
                        "Est. Words": d.get('word_count', 0)
                    })
            
            # Build Interaction Matrix
            def normalize(u):
                from urllib.parse import urlparse
                p = urlparse(u)
                return (p.netloc + p.path).rstrip('/').lower().replace('www.', '')

            matrix_data = []
            for d_src in all_data:
                row = {"From / To": d_src['source_url']}
                if d_src.get('error'):
                    for u_target in input_urls: row[u_target] = "N/A"
                else:
                    src_norm = normalize(d_src['source_url'])
                    for u_target in input_urls:
                        target_norm = normalize(u_target)
                        if src_norm == target_norm:
                            row[u_target] = "Self"
                        else:
                            links_to_target = any(normalize(l['url']) == target_norm for l in d_src['links'])
                            row[u_target] = "✅ Link" if links_to_target else "❌ No"
                matrix_data.append(row)
            
            matrix_df = pd.DataFrame(matrix_data).set_index("From / To")
            analysis = analyze_linking_strategy(all_data, input_urls)
            
            st.session_state.il_results = {
                "summary": pd.DataFrame(summary_rows),
                "matrix": matrix_df,
                "analysis": analysis,
                "raw_data": all_data,
                "input_urls": input_urls
            }
            st.rerun()

    # --- Rendering Section (Outside the button block) ---
    if st.session_state.il_results:
        res = st.session_state.il_results
        
        st.subheader("📊 Pages Summary")
        st.dataframe(res['summary'], use_container_width=True)

        st.subheader("🤝 Inter-linking Interaction Matrix")
        st.write("Does Page A link to Page B?")
        st.table(res['matrix'])
        
        # --- Export Button ---
        if gsc_client and gsc_client.credentials:
            if st.button("🚀 Export Matrix to Google Sheets", key="export_sheets_btn"):
                with st.spinner("Creating Google Sheet and exporting data..."):
                    try:
                        sheets = SheetsClient(gsc_client.credentials)
                        sheet_id = sheets.create_spreadsheet("Internal Linking Matrix Export")
                        if sheet_id:
                            sheets.write_matrix(sheet_id, res['matrix'])
                            st.success(f"Successfully exported to Google Sheets!")
                            st.markdown(f"[🔗 Open your Spreadsheet](https://docs.google.com/spreadsheets/d/{sheet_id})")
                        else:
                            st.error("Failed to create spreadsheet. Ensure 'Google Sheets API' is enabled in your Google Cloud Console.")
                    except Exception as e:
                        st.error(f"Export failed: {e}")
        else:
            st.info("💡 Connect to Google Search Console to enable Sheet exports.")

        with st.expander("View Detailed Link Data"):
            st.json(res['raw_data'])
        
        st.markdown("---")
        st.subheader("📋 Inter-linking & Strategic Analysis")
        st.markdown(res['analysis'])
