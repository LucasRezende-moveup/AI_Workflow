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
import json
import time
import datetime
import numpy as np
import datetime

def cosine_similarity(a, b):
    """Computes cosine similarity between two vectors."""
    dot_product = np.dot(a, b)
    norm_a = np.linalg.norm(a)
    norm_b = np.linalg.norm(b)
    return dot_product / (norm_a * norm_b)

class EmbeddingEngine:
    _instance = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(EmbeddingEngine, cls).__new__(cls)
        return cls._instance

    def encode(self, texts):
        """
        Generates embeddings using Google's generative-ai model with batching and retry logic.
        """
        if not texts:
            return []
            
        api_key = os.getenv("GOOGLE_API_KEY")
        if not api_key:
            st.error("Google API Key not found. Cannot generate embeddings.")
            return []
            
        genai.configure(api_key=api_key)
        
        # Batching configuration
        batch_size = 20
        all_embeddings = []
        
        # Determine if input is a single string or a list
        is_single = isinstance(texts, str)
        text_list = [texts] if is_single else texts
        
        for i in range(0, len(text_list), batch_size):
            batch = text_list[i : i + batch_size]
            success = False
            retries = 0
            max_retries = 5
            base_delay = 5  # Base delay in seconds
            
            while not success and retries < max_retries:
                try:
                    result = genai.embed_content(
                        model="models/gemini-embedding-001",
                        content=batch,
                        task_type="retrieval_query"
                    )
                    
                    res = result.get('embeddings') or result.get('embedding')
                    if res:
                        # Check if we got a list of embeddings or a single embedding
                        # If the first element is a list/array, it's a list of embeddings
                        if isinstance(res[0], (list, np.ndarray, list)):
                            all_embeddings.extend(res)
                        else:
                            all_embeddings.append(res)
                    
                    success = True
                    # Small proactive delay to avoid hitting RPM
                    time.sleep(0.5)
                    
                except Exception as e:
                    if "429" in str(e) or "Quota Exceeded" in str(e):
                        retries += 1
                        wait_time = base_delay * (2 ** (retries - 1))
                        st.warning(f"⚠️ Rate limit hit. Retrying in {wait_time}s... (Attempt {retries}/{max_retries})")
                        time.sleep(wait_time)
                    else:
                        st.error(f"Error generating embeddings: {e}")
                        # Fallback for this batch
                        dim = 768
                        all_embeddings.extend([[0.0] * dim for _ in range(len(batch))])
                        success = True # Stop retrying for non-rate-limit errors
            
            if not success:
                st.error(f"Failed to generate embeddings for batch {i//batch_size + 1} after {max_retries} retries.")
                dim = 768
                all_embeddings.extend([[0.0] * dim for _ in range(len(batch))])

        return all_embeddings[0] if is_single else all_embeddings

embedding_engine = EmbeddingEngine()

def get_urls_from_sitemap(sitemap_url, auth=None, depth=0):
    """
    Extracts all URLs from an XML sitemap or sitemap index with parallel processing for indexes.
    Accepts an optional auth=(username, password) tuple for HTTP Basic Auth.
    """
    if depth > 5: # Prevent infinite cycles
        return []
        
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
    }
    try:
        response = requests.get(sitemap_url, headers=headers, timeout=15, auth=auth or None)
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
                from functools import partial
                fetch_fn = partial(get_urls_from_sitemap, auth=auth, depth=depth + 1)
                with ThreadPoolExecutor(max_workers=5) as executor:
                    futures = [executor.submit(fetch_fn, url) for url in sm_urls]
                    for future in as_completed(futures):
                        all_urls.extend(future.result())
            return list(set(all_urls))
            
        urls = [loc.get_text(strip=True) for loc in soup.find_all('loc')]
        return urls
    except Exception as e:
        st.error(f"Error parsing sitemap {sitemap_url}: {e}")
        return []

def extract_page_info(url, auth=None):
    """
    Extracts hreflang tags and basic metadata (title, h1) from a URL.
    Accepts an optional auth=(username, password) tuple for HTTP Basic Auth.
    """
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
    }
    try:
        response = requests.get(url, headers=headers, timeout=15, auth=auth or None)
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

def check_reciprocity(source_url, target_url, source_lang=None, auth=None):
    """
    Checks if the target_url has a hreflang tag pointing back to source_url.
    Accepts an optional auth=(username, password) tuple for HTTP Basic Auth.
    """
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
    }
    try:
        response = requests.get(target_url, headers=headers, timeout=10, auth=auth or None)
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
    Detects potential missing hreflang connections between pages using Heuristics and Embeddings.
    """
    suggestions = []
    
    if not all_pages:
        return suggestions

    # 1. Heuristic: Group by stripped slug
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
            
        for i in range(len(pages)):
            for j in range(i + 1, len(pages)):
                p1, p2 = pages[i], pages[j]
                connected = any(t['href'].rstrip('/') == p2['url'].rstrip('/') for t in p1['hreflangs'])
                if not connected:
                    potential_pairs.append((p1, p2))

    # 2. Semantic: Embedding-based similarity
    st.info("🧬 Running semantic analysis with Cloud Embeddings...")
    
    # Prepare texts for embedding (Title + H1)
    page_texts = [f"{p.get('title', '')} {p.get('h1', '')}".strip() for p in all_pages]
    embeddings = embedding_engine.encode(page_texts)
    
    # Compute similarity matrix
    num_p = len(all_pages)
    sim_m = np.zeros((num_p, num_p))
    for idx_a in range(num_p):
        for idx_b in range(idx_a, num_p):
            score = cosine_similarity(embeddings[idx_a], embeddings[idx_b])
            sim_m[idx_a][idx_b] = score
            sim_m[idx_b][idx_a] = score
    
    # Find highly similar pairs (threshold > 0.70)
    for i in range(len(all_pages)):
        for j in range(i + 1, len(all_pages)):
            score = sim_m[i][j]
            if score > 0.70:
                p1, p2 = all_pages[i], all_pages[j]
                
                # Check if already connected
                connected = any(t['href'].rstrip('/') == p2['url'].rstrip('/') for t in p1['hreflangs'])
                
                if not connected:
                    # Avoid duplicates from heuristic
                    if not any((p1['url'] == pair[0]['url'] and p2['url'] == pair[1]['url']) for pair in potential_pairs):
                        potential_pairs.append((p1, p2))

    # 3. Verification: Gemini-powered batch verification
    if not potential_pairs:
        return suggestions

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
                        "Similarity": f"{score:.2f}" if 'score' in locals() else "Heuristic",
                        "Confidence": res.get('confidence'),
                        "Recommendation": f"Add hreflang alternate between these pages."
                    })
    return suggestions

def render_hreflang_checker_page(gsc_client=None):
    st.title("🌐 Hreflang & Sitemap Auditor")
    st.write("Audit international SEO tags, verify reciprocal links, and discover missing mappings across your sitemaps.")

    mode = st.radio("Select Mode", ["Single URL Audit", "Cross-Sitemap Audit"], horizontal=True)

    with st.expander("🔒 Authentication (Optional — for password-protected pages)"):
        use_auth = st.checkbox("Pages require authentication", key="hreflang_use_auth")
        auth = None
        if use_auth:
            a_col1, a_col2 = st.columns(2)
            with a_col1:
                auth_user = st.text_input("Username", key="hreflang_auth_user", placeholder="user")
            with a_col2:
                auth_pass = st.text_input("Password", key="hreflang_auth_pass", placeholder="password", type="password")
            auth = (auth_user, auth_pass) if auth_user else None

    if mode == "Single URL Audit":
        col1, col2 = st.columns([3, 1])
        with col1:
            url = st.text_input("Enter URL to Audit", placeholder="https://example.com/en/")
        with col2:
            check_btn = st.button("Run Audit", type="primary", use_container_width=True)

        if check_btn and url:
            run_single_audit(url, gsc_client, auth=auth)
    
    else:
        st.subheader("📂 Advanced Cross-Sitemap Audit")
        st.write("Compare up to 5 site/language paths to identify discrepancies, missing connections, and reciprocity errors.")
        
        with st.expander("⚙️ Audit Settings", expanded=True):
            col_s1, col_s2 = st.columns([2, 1])
            with col_s1:
                similarity_threshold = st.slider("Semantic Similarity Threshold", min_value=0.70, max_value=1.00, value=0.70, step=0.01, help="Higher values are more restrictive. 0.70 or higher is recommended.")
            with col_s2:
                max_workers = st.number_input("Parallel Workers", min_value=1, max_value=20, value=10)

        sitemaps = []
        st.write("Enter Sitemap URLs (Max 5):")
        for i in range(5):
            s_url = st.text_input(f"Sitemap {i+1}", key=f"sitemap_input_{i}", placeholder="https://example.com/sitemap.xml")
            if s_url:
                sitemaps.append(s_url.strip())
        
        if st.button("🚀 Run Deep Cross-Sitemap Audit", type="primary"):
            if sitemaps:
                run_advanced_sitemap_audit(sitemaps, similarity_threshold, max_workers, gsc_client, auth=auth)
            else:
                st.error("Please enter at least one valid Sitemap URL.")

def run_advanced_sitemap_audit(sitemap_urls, threshold, max_workers, gsc_client=None, auth=None):
    """
    Performs a deep audit across multiple sitemaps with semantic matching and discrepancy reporting.
    Accepts an optional auth=(username, password) tuple for HTTP Basic Auth.
    """
    import time
    start_time = time.time()
    
    # 1. Fetch all URLs from all sitemaps
    all_urls_data = {} # {sitemap_url: [urls]}
    total_found_urls = 0
    
    with st.spinner("Fetching URLs from sitemaps..."):
        for s_url in sitemap_urls:
            urls = get_urls_from_sitemap(s_url, auth=auth)
            if urls:
                all_urls_data[s_url] = list(set(urls))
                total_found_urls += len(all_urls_data[s_url])
    
    if not all_urls_data:
        st.error("No valid URLs found in any of the sitemaps.")
        return

    st.info(f"📂 Found {total_found_urls} total URLs across {len(all_urls_data)} sitemaps.")

    # 2. Extract info for all URLs in parallel
    url_to_sitemap = {}
    for s_url, urls in all_urls_data.items():
        for u in urls:
            url_to_sitemap[u] = s_url

    unique_all_urls = list(url_to_sitemap.keys())
    all_page_results = []
    
    progress_bar = st.progress(0)
    status_text = st.empty()
    
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        from functools import partial
        fetch_fn = partial(extract_page_info, auth=auth)
        future_to_url = {executor.submit(fetch_fn, url): url for url in unique_all_urls}
        
        for i, future in enumerate(as_completed(future_to_url)):
            url = future_to_url[future]
            status_text.text(f"Extracting ({i+1}/{len(unique_all_urls)}): {url}")
            try:
                info, error = future.result()
                if info:
                    info['source_sitemap'] = url_to_sitemap.get(url)
                    all_page_results.append(info)
            except Exception as e:
                st.error(f"Error processing {url}: {e}")
            progress_bar.progress((i + 1) / len(unique_all_urls))

    # 3. Semantic Analysis
    st.info("🧬 Generating cloud embeddings for cross-sitemap matching...")
    page_texts = [f"{p.get('title', '')} {p.get('h1', '')}".strip() for p in all_page_results]
    embeddings = embedding_engine.encode(page_texts)
    
    # Compute similarity matrix
    num_p = len(all_page_results)
    sim_m = np.zeros((num_p, num_p))
    for idx_a in range(num_p):
        for idx_b in range(idx_a, num_p):
            score = cosine_similarity(embeddings[idx_a], embeddings[idx_b])
            sim_m[idx_a][idx_b] = score
            sim_m[idx_b][idx_a] = score

    # 4. Discrepancy Detection Logic
    discrepancies = {
        "missing_links": [],      # High similarity but no hreflang connection
        "wrong_language": [],     # Hreflang code doesn't match detected content
        "broken_reciprocity": []  # Page A links to B, but B doesn't link back
    }

    processed_pairs = set()

    for i in range(len(all_page_results)):
        p1 = all_page_results[i]
        
        # Check Wrong Language Tag
        detected_lang = p1.get('detected_lang', 'unknown')
        if detected_lang != 'unknown':
            self_ref = next((t for t in p1['hreflangs'] if t['href'].rstrip('/') == p1['url'].rstrip('/')), None)
            if self_ref:
                lang_code = self_ref['hreflang'].split('-')[0].lower()
                if lang_code != detected_lang:
                    discrepancies["wrong_language"].append({
                        "URL": p1['url'],
                        "Tag": self_ref['hreflang'],
                        "Detected": detected_lang.upper(),
                        "Details": f"Content appears to be in {detected_lang.upper()} but tag says {self_ref['hreflang']}."
                    })

        for j in range(i + 1, len(all_page_results)):
            p2 = all_page_results[j]
            
            # SKIP if same sitemap
            if p1.get('source_sitemap') == p2.get('source_sitemap'):
                continue
                
            score = sim_m[i][j]

            if score >= threshold:
                # Potential match
                link_1to2 = next((t for t in p1['hreflangs'] if t['href'].rstrip('/') == p2['url'].rstrip('/')), None)
                link_2to1 = next((t for t in p2['hreflangs'] if t['href'].rstrip('/') == p1['url'].rstrip('/')), None)

                # Check Missing Link
                if not link_1to2 and not link_2to1:
                    discrepancies["missing_links"].append({
                        "Page A": p1['url'],
                        "Page B": p2['url'],
                        "Similarity": f"{score:.1%}",
                        "Status": "Not Linked"
                    })
                
                # Check Broken Reciprocity (Reciprocity error)
                elif (link_1to2 and not link_2to1) or (link_2to1 and not link_1to2):
                    source = p1['url'] if link_1to2 else p2['url']
                    target = p2['url'] if link_1to2 else p1['url']
                    discrepancies["broken_reciprocity"].append({
                        "From": source,
                        "To": target,
                        "Similarity": f"{score:.1%}",
                        "Error": "Missing Return Tag"
                    })

    # 5. Display Report
    end_time = time.time()
    st.success(f"✅ Audit complete in {end_time - start_time:.1f}s")
    
    col_m1, col_m2, col_m3 = st.columns(3)
    col_m1.metric("Missing Links", len(discrepancies["missing_links"]))
    col_m2.metric("Wrong Lang Tags", len(discrepancies["wrong_language"]))
    col_m3.metric("Reciprocity Errors", len(discrepancies["broken_reciprocity"]))

    st.markdown("---")
    
    with st.expander("❗ Missing Links (Opportunity)", expanded=True):
        if discrepancies["missing_links"]:
            st.dataframe(pd.DataFrame(discrepancies["missing_links"]), use_container_width=True)
        else:
            st.write("No missing connections detected.")

    with st.expander("⚠️ Wrong Language Tags", expanded=True):
        if discrepancies["wrong_language"]:
            st.dataframe(pd.DataFrame(discrepancies["wrong_language"]), use_container_width=True)
        else:
            st.write("No language mismatches detected.")

    with st.expander("🔄 Broken Return Tags (Reciprocity)", expanded=True):
        if discrepancies["broken_reciprocity"]:
            st.dataframe(pd.DataFrame(discrepancies["broken_reciprocity"]), use_container_width=True)
        else:
            st.write("No reciprocity errors detected.")
    
    # 6. Global Summary Table
    st.subheader("📋 All Scanned Pages")
    summary_results = []
    for info in all_page_results:
        summary_results.append({
            "URL": info['url'],
            "HTTP": info.get('status_code'),
            "Tags": len(info['hreflangs']),
            "Detected Lang": info.get('detected_lang', '??').upper()
        })
    st.dataframe(pd.DataFrame(summary_results), use_container_width=True)

def run_single_audit(url, gsc_client=None, auth=None):
    if not url.startswith("http"):
        st.error("Please enter a valid URL.")
        return

    with st.spinner(f"Auditing {url}..."):
        page_info, error = extract_page_info(url, auth=auth)
        
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
                from functools import partial
                reciprocity_fn = partial(check_reciprocity, url, source_lang=source_lang, auth=auth)
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
                        future = executor.submit(reciprocity_fn, tag['href'])
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


if __name__ == "__main__":
    render_hreflang_checker_page()
