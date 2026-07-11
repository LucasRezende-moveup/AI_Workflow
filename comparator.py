try:
    import streamlit as st
except ImportError:
    st = None
import requests
from bs4 import BeautifulSoup
import json
import os
import google.generativeai as genai

def scrape_url(url, auth=None):
    """
    Scrapes a URL for detailed SEO elements, schema, and technical tags.
    Accepts an optional auth=(username, password) tuple for HTTP Basic Auth.
    """
    try:
        if not url.startswith('http'):
            url = 'https://' + url
            
        headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'}
        try:
            response = requests.get(url, headers=headers, timeout=15, auth=auth or None)
        except requests.exceptions.SSLError:
            response = requests.get(url, headers=headers, timeout=15, verify=False, auth=auth or None)
            
        response.raise_for_status()
        
        soup = BeautifulSoup(response.text, 'lxml')
        
        # Meta Tags
        title = soup.find('title').text if soup.find('title') else "N/A"
        meta_desc = soup.find('meta', attrs={'name': 'description'})
        description = meta_desc['content'] if meta_desc else "N/A"
        
        robots = soup.find('meta', attrs={'name': 'robots'})
        robots_content = robots['content'] if robots else "index, follow"
        
        canonical = soup.find('link', rel='canonical')
        canonical_url = canonical['href'] if canonical else "N/A"
        
        # Headers Structure
        headers_structure = {
            "h1": [h.text.strip() for h in soup.find_all('h1')],
            "h2": [h.text.strip() for h in soup.find_all('h2')[:10]], # Limit to first 10
            "h3": [h.text.strip() for h in soup.find_all('h3')[:10]],
        }
        
        # Schema (JSON-LD) Analysis
        schemas_detailed = []
        
        def parse_item(item):
            if not isinstance(item, dict): return None
            
            # Handle @type as string or list
            raw_type = item.get('@type', 'Unknown')
            types = raw_type if isinstance(raw_type, list) else [raw_type]
            
            summary = {"types": types}
            
            # Extract key properties based on dominant types
            lower_types = [t.lower() for t in types if isinstance(t, str)]
            
            if "faqpage" in lower_types:
                summary["questions_count"] = len(item.get("mainEntity", []))
            if "product" in lower_types:
                summary["name"] = item.get("name")
                summary["has_aggregateRating"] = "aggregateRating" in item
                summary["has_offers"] = "offers" in item
            if any(t in lower_types for t in ["article", "newsarticle", "blogposting"]):
                summary["headline"] = item.get("headline")
                summary["author"] = item.get("author").get("name") if isinstance(item.get("author"), dict) else item.get("author")
            if "organization" in lower_types:
                summary["name"] = item.get("name")
            if "breadcrumblist" in lower_types:
                summary["items_count"] = len(item.get("itemListElement", []))
            if "review" in lower_types:
                summary["itemReviewed"] = item.get("itemReviewed", {}).get("name") if isinstance(item.get("itemReviewed"), dict) else "N/A"
                summary["rating"] = item.get("reviewRating", {}).get("ratingValue")
            
            return summary

        def process_json_ld(data):
            if isinstance(data, list):
                for sub_item in data: process_json_ld(sub_item)
            elif isinstance(data, dict):
                if "@graph" in data:
                    process_json_ld(data["@graph"])
                else:
                    res = parse_item(data)
                    if res: schemas_detailed.append(res)

        for script in soup.find_all('script', type='application/ld+json'):
            try:
                if script.string:
                    data = json.loads(script.string)
                    process_json_ld(data)
            except:
                pass
        
        # Microdata Fallback (Basic)
        microdata_types = []
        for tag in soup.find_all(attrs={"itemtype": True}):
            itype = tag.get("itemtype", "").split("/")[-1]
            if itype and itype not in [s.get("types", [])[0] if s.get("types") else "" for s in schemas_detailed]:
                microdata_types.append(itype)
        
        if microdata_types:
            schemas_detailed.append({"types": list(set(microdata_types)), "source": "microdata"})
                
        return {
            "url": url,
            "title": title,
            "description": description,
            "robots": robots_content,
            "canonical": canonical_url,
            "headers": headers_structure,
            "schemas_detailed": schemas_detailed,
            "content_length": len(response.text),
            "error": None
        }
    except Exception as e:
        return {"url": url, "error": str(e)}

def compare_urls(kw, data1, data2, data3=None, pos1=None, pos2=None, pos3=None):
    """
    Uses Gemini to perform a professional SEO side-by-side comparison.
    Supports up to 3 datasets for multi-competitor analysis, considering their ranking positions.
    """
    api_key = os.getenv("GOOGLE_API_KEY")
    if not api_key:
        return "Gemini API key not found in environment."

    try:
        genai.configure(api_key=api_key)
        
        # Model Selection
        available_models = [m.name for m in genai.list_models() if 'generateContent' in m.supported_generation_methods]
        target_model = 'models/gemini-1.5-flash' # Default
        for alias in ['models/gemini-2.5-flash', 'models/gemini-2.0-flash', 'models/gemini-1.5-flash', 'models/gemini-flash-latest']:
            if alias in available_models:
                target_model = alias
                break

        model = genai.GenerativeModel(target_model)
        
        compare_context = f"""
        DATA FOR PAGE 1 (Current Position: {pos1 if pos1 else "N/A"}):
        {json.dumps(data1, indent=2)}

        DATA FOR PAGE 2 (Current Position: {pos2 if pos2 else "N/A"}):
        {json.dumps(data2, indent=2)}
        """
        
        if data3:
            compare_context += f"""
        DATA FOR PAGE 3 (Current Position: {pos3 if pos3 else "N/A"}):
        {json.dumps(data3, indent=2)}
        """

        prompt = f"""
        You are a Senior SEO Consultant. Perform a DEEP side-by-side comparison of web pages for the target keyword: "{kw}".
        Analyze { "three" if data3 else "two" } URLs provided in the data.
        
        CRITICAL CONTEXT: The ranking positions are provided. Use these to analyze WHY a higher-ranking page is winning and what a lower-ranking page needs to do to surpass it.
        
        {compare_context}

        YOUR TASK:
        1. Compare Title & Meta Description alignment with "{kw}".
        2. Evaluate Header Hierarchy (H1, H2, H3) and if they follow a logical semantic flow. Identify inconsistencies.
        3. DEEP SCHEMA ANALYSIS: Compare the JSON-LD schemas. Analyze if they are leveraging Rich Results (FAQ, Product, Review, etc.). Are there missing opportunities relative to the keyword?
        4. Technical Comparison: Robots, Canonical, and depth of content.
        5. GAP ANALYSIS: Specifically explain WHY the page at the higher position is outranking the others based on the data provided (content depth, schema usage, semantic clarity).
        6. Identify who is likely to rank higher for "{kw}" and WHY. Provide a clear ranking order recommendation.
        
        OUTPUT FORMAT:
        - Markdown Table summarizing key SEO metrics across all pages (include "Input Position").
        - Detailed sections: "On-Page Semantic Flow", "Schema & Rich Result Analysis", "Technical Health", and "Strategic Recommendations".
        - Clear "Verdict": Which page wins and by what margin (%).
        """
        
        response = model.generate_content(prompt)
        return response.text
    except Exception as e:
        return f"Gemini Analysis Error: {e}"

def render_comparator_page():
    st.markdown("### ⚙️ Comparison Setup")
    with st.container(border=True):
        keyword = st.text_input("Focus Keyword", placeholder="e.g. best seo tools")
        
        col1, col2, col3 = st.columns(3)
        with col1:
            url1 = st.text_input("URL 1 (Target)", placeholder="https://example.com/page1")
            pos1 = st.number_input("Position 1", min_value=1, value=1, key="pos1")
        with col2:
            url2 = st.text_input("URL 2 (Competitor)", placeholder="https://example.com/page2")
            pos2 = st.number_input("Position 2", min_value=1, value=2, key="pos2")
        with col3:
            url3 = st.text_input("URL 3 (Optional Competitor)", placeholder="https://example.com/page3")
            pos3 = st.number_input("Position 3", min_value=1, value=3, key="pos3")

    with st.expander("🔒 Authentication (Optional — for password-protected pages)"):
        use_auth = st.checkbox("These pages require authentication", key="comp_use_auth")
        auth = None
        if use_auth:
            a_col1, a_col2 = st.columns(2)
            with a_col1:
                auth_user = st.text_input("Username", key="comp_auth_user", placeholder="user")
            with a_col2:
                auth_pass = st.text_input("Password", key="comp_auth_pass", placeholder="password", type="password")
            auth = (auth_user, auth_pass) if auth_user else None
    
    st.markdown("<br>", unsafe_allow_html=True)
    
    if st.button("Compare Pages", type="primary"):
        if not url1 or not url2 or not keyword:
            st.error("Please provide at least two URLs (URL 1 and URL 2) and a keyword.")
        else:
            with st.spinner("Scraping and analyzing pages..."):
                d1 = scrape_url(url1, auth=auth)
                d2 = scrape_url(url2, auth=auth)
                d3 = scrape_url(url3, auth=auth) if url3 else None
                
                # Check for errors in the required URLs
                has_error = False
                if d1.get('error'): 
                    st.error(f"Error URL 1: {d1['error']}")
                    has_error = True
                if d2.get('error'): 
                    st.error(f"Error URL 2: {d2['error']}")
                    has_error = True
                if d3 and d3.get('error'):
                    st.warning(f"Error URL 3 (Skipping Analysis for URL 3): {d3['error']}")
                    d3 = None # Proceed with 2-way analysis if optional URL fails
                
                if not has_error:
                    st.success("Scraping successful! Generating comparison...")
                    
                    # Display Raw Data briefly or in expanders
                    with st.expander("Show Scraped Data"):
                        if d3:
                            c1, c2, c3 = st.columns(3)
                            c1.json(d1)
                            c2.json(d2)
                            c3.json(d3)
                        else:
                            c1, c2 = st.columns(2)
                            c1.json(d1)
                            c2.json(d2)
                            
                    comparison = compare_urls(keyword, d1, d2, d3, pos1, pos2, pos3)
                    st.markdown("---")
                    st.subheader("🏁 Analysis Result")
                    st.markdown(comparison)
