import streamlit as st
import requests
from bs4 import BeautifulSoup
import os
import google.generativeai as genai
from urllib.parse import urljoin, urlparse
import pandas as pd
import base64
from io import BytesIO
from PIL import Image
import json
import time
from google.api_core import retry, exceptions

def get_flash_model():
    """Helper to get the best available flash model."""
    try:
        available_models = [m.name for m in genai.list_models() if 'generateContent' in m.supported_generation_methods]
        # Align with other working pages (prioritize 1.5-flash)
        for target in ['models/gemini-1.5-flash', 'models/gemini-flash-latest', 'models/gemini-2.0-flash']:
            if target in available_models:
                return target
        # Fallback to anything with flash
        flash_models = [m for m in available_models if 'flash' in m.lower()]
        return flash_models[0] if flash_models else 'models/gemini-1.5-flash'
    except:
        return 'models/gemini-1.5-flash' # Hard fallback

@retry.Retry(predicate=retry.if_exception_type(exceptions.ResourceExhausted))
def call_gemini_with_retry(model, prompt, content=None):
    """Calls Gemini with exponential backoff on quota errors."""
    if content:
        return model.generate_content([prompt, content])
    return model.generate_content(prompt)

def get_images_from_url(url, auth=None):
    """Scrapes images from a URL, filtering out likely icons and logos.
    Accepts an optional auth=(username, password) tuple for HTTP Basic Auth.
    """
    try:
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
        }
        response = requests.get(url, headers=headers, timeout=15, auth=auth or None)
        response.raise_for_status()
        soup = BeautifulSoup(response.text, 'html.parser')
        
        # Keywords that often indicate icons or logos
        exclude_keywords = ['logo', 'icon', 'svg', 'avatar', 'social', 'button', 'arrow', 'px-', 'sprite', 'profile', 'headshot', 'user']
        
        img_data = []
        for img in soup.find_all('img'):
            src = img.get('src', '')
            class_list = img.get('class', [])
            if isinstance(class_list, list):
                class_str = " ".join(class_list).lower()
            else:
                class_str = str(class_list).lower()
            
            alt = img.get('alt', '')
            
            # Skip if src or class contains exclusion keywords
            if any(kw in src.lower() for kw in exclude_keywords) or any(kw in class_str for kw in exclude_keywords):
                continue
                
            if not src:
                continue
            
            # Resolve relative URLs
            full_src = urljoin(url, src)
            
            img_data.append({
                "src": full_src,
                "alt": alt
            })
            
        return img_data, response.text
    except Exception as e:
        st.error(f"Error scraping URL: {e}")
        return [], None

def detect_page_intent(url, html_content):
    """Uses Gemini to detect the user intent of the page based on its content."""
    try:
        soup = BeautifulSoup(html_content, 'html.parser')
        title = soup.title.string if soup.title else "N/A"
        h1s = [h1.get_text().strip() for h1 in soup.find_all('h1')]
        meta_desc = ""
        meta = soup.find('meta', attrs={'name': 'description'})
        if meta:
            meta_desc = meta.get('content', '')

        model_name = get_flash_model()
        model = genai.GenerativeModel(model_name)
        prompt = f"""
        Analyze the following metadata from a webpage and identify the primary 'User Intent' for someone visiting this page. 
        Possible intents include: Informational (learning about a topic), Transactional (buying a service/product), Navigational (finding a specific thing), or Commercial Investigation.
        
        URL: {url}
        Title: {title}
        H1 Headers: {h1s}
        Meta Description: {meta_desc}
        
        Return the intent as a short, descriptive phrase (max 10 words).
        """
        
        response = call_gemini_with_retry(model, prompt)
        return response.text.strip()
    except exceptions.ResourceExhausted:
        return "QUOTA_EXCEEDED"
    except Exception as e:
        return f"Could not detect intent: {e}"

def analyze_image_alt(img_src, current_alt, keyword, intent):
    """Uses Gemini to analyze an image and propose better alt text."""
    try:
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
        }
        img_response = requests.get(img_src, headers=headers, timeout=10)
        img_response.raise_for_status()
        
        img = Image.open(BytesIO(img_response.content))
        
        model_name = get_flash_model()
        model = genai.GenerativeModel(model_name)
        
        prompt = f"""
        Analyze this image in the context of:
        - Target Keyword: {keyword}
        - Page User Intent: {intent}
        - Current Alt Text: "{current_alt}"
        
        Evaluate if the current alt text is optimal for SEO and descriptive enough. 
        If not, propose a better alt text that incorporates the keyword naturally and matches the user intent.
        
        Return your response in JSON format:
        {{
            "is_best": boolean,
            "reasoning": "string explaining why",
            "proposed_alt": "string with the new proposed alt text"
        }}
        """
        
        response = call_gemini_with_retry(model, prompt, content=img)
        
        text = response.text
        if "```json" in text:
            text = text.split("```json")[1].split("```")[0].strip()
        elif "```" in text:
            text = text.split("```")[1].split("```")[0].strip()
            
        return json.loads(text)
    except exceptions.ResourceExhausted:
        return {"error": "Quota Exceeded. Please wait a minute or upgrade your plan."}
    except Exception as e:
        return {"error": str(e)}

def render_image_alt_analysis_page():
    st.title("🖼️ Image Alt Text Analysis")
    st.markdown("""
    Analyze images on any URL. This tool filters non-content images and automatically detects user intent.
    """)
    
    with st.expander("⚙️ Analysis Settings", expanded=True):
        col_u, col_k = st.columns([2, 1])
        with col_u:
            url = st.text_input("Page URL", placeholder="https://example.com/page", key="img_alt_url")
        with col_k:
            keyword = st.text_input("Target Keyword", placeholder="e.g. digital marketing", key="img_alt_keyword")
            
        manual_intent = st.text_input("Override User Intent (Leave empty for auto-detection)", placeholder="e.g. Informational")
        max_images = st.number_input("Max Images to Analyze (Set higher to process all)", min_value=1, max_value=500, value=10, step=5)

    with st.expander("🔒 Authentication (Optional — for password-protected pages)"):
        use_auth = st.checkbox("This page requires authentication", key="imgalt_use_auth")
        auth = None
        if use_auth:
            a_col1, a_col2 = st.columns(2)
            with a_col1:
                auth_user = st.text_input("Username", key="imgalt_auth_user", placeholder="user")
            with a_col2:
                auth_pass = st.text_input("Password", key="imgalt_auth_pass", placeholder="password", type="password")
            auth = (auth_user, auth_pass) if auth_user else None

    analyze_btn = st.button("🚀 Run Analysis", type="primary")
        
    if analyze_btn:
        if not url:
            st.error("Please enter a URL")
            return
        if not keyword:
            st.error("Please enter a target keyword")
            return
            
        if not (url.startswith('http://') or url.startswith('https://')):
            url = 'https://' + url

        with st.spinner("Fetching page and detecting intent..."):
            images, html_content = get_images_from_url(url, auth=auth)
            if html_content:
                if manual_intent:
                    detected_intent = manual_intent
                else:
                    detected_intent = detect_page_intent(url, html_content)
                
                if detected_intent == "QUOTA_EXCEEDED":
                    st.error("⚠️ AI Quota Exceeded during intent detection. Please wait a few seconds or enter the intent manually.")
                    return
                st.session_state['detected_intent'] = detected_intent
            else:
                st.error("Could not fetch page content. Check the URL and try again.")
                return

        if not images:
            st.warning("No content images found (logos, icons, and small images are skipped).")
            return
            
        st.success(f"🎯 **Identified Intent:** {st.session_state.get('detected_intent', 'N/A')}")
        st.info(f"Found {len(images)} content images. Starting AI analysis...")
        
        results = []
        progress_bar = st.progress(0)
        
        limit = min(len(images), max_images)
        for i, img_info in enumerate(images[:limit]):
            status_text = st.empty()
            status_text.text(f"Analyzing image {i+1}/{limit}...")
            
            analysis = analyze_image_alt(img_info['src'], img_info['alt'], keyword, st.session_state['detected_intent'])
            
            if "error" in analysis:
                results.append({
                    "src": img_info['src'],
                    "alt": img_info['alt'],
                    "error": analysis['error'],
                    "status": "❌ Error"
                })
                if "Quota Exceeded" in analysis['error']:
                    st.warning("Reached API rate limit. Analysis paused to avoid further errors.")
                    break
            else:
                results.append({
                    "src": img_info['src'],
                    "alt": img_info['alt'],
                    "reasoning": analysis['reasoning'],
                    "proposed_alt": analysis['proposed_alt'],
                    "status": "✅ Best" if analysis['is_best'] else "⚠️ Needs Change"
                })
            
            progress_bar.progress((i + 1) / limit)
            status_text.empty()

        if results:
            st.subheader("Analysis Results")
            for res in results:
                with st.container():
                    col1, col2 = st.columns([1, 3])
                    with col1:
                        try:
                            st.image(res['src'], use_container_width=True)
                        except:
                            st.write("Image preview unavailable")
                    
                    with col2:
                        st.markdown(f"**Status:** {res['status']}")
                        st.markdown(f"**Current Alt:** `{res['alt'] if res['alt'] else '[Empty]'}`")
                        
                        if "error" in res:
                            st.error(f"Error: {res['error']}")
                        else:
                            st.markdown(f"**Reasoning:** {res['reasoning']}")
                            if res['status'] != "✅ Best":
                                st.success(f"**AI Proposes:** {res['proposed_alt']}")
                    st.divider()
        
        if len(images) > limit:
            st.info(f"Summary: Processed {limit} out of {len(images)} content images found. Increase 'Max Images to Analyze' in settings to process more.")
        else:
            st.success(f"Summary: Processed all {limit} content images found.")
