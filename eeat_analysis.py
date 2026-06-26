import streamlit as st
import requests
from bs4 import BeautifulSoup
import google.generativeai as genai
from google.api_core import retry, exceptions

def get_flash_model():
    """Helper to get the best available flash model."""
    try:
        available_models = [m.name for m in genai.list_models() if 'generateContent' in m.supported_generation_methods]
        for target in ['models/gemini-1.5-flash', 'models/gemini-flash-latest', 'models/gemini-2.0-flash']:
            if target in available_models:
                return target
        flash_models = [m for m in available_models if 'flash' in m.lower()]
        return flash_models[0] if flash_models else 'models/gemini-1.5-flash'
    except:
        return 'models/gemini-1.5-flash'

@retry.Retry(predicate=retry.if_exception_type(exceptions.ResourceExhausted))
def call_gemini_with_retry(model, prompt):
    """Calls Gemini with exponential backoff on quota errors."""
    return model.generate_content(prompt)

def fetch_page_content(url, auth=None):
    """Fetches the full text content of a URL.
    Accepts an optional auth=(username, password) tuple for HTTP Basic Auth.
    """
    try:
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
        }
        response = requests.get(url, headers=headers, timeout=15, auth=auth or None)
        response.raise_for_status()
        soup = BeautifulSoup(response.text, 'html.parser')
        
        # Remove script and style elements
        for script in soup(["script", "style", "nav", "footer", "header", "aside"]):
            script.extract()
            
        text = soup.get_text(separator=' ', strip=True)
        # Limit text length to avoid token limits just in case, though 1.5-flash has 1M context
        return text[:100000] 
    except Exception as e:
        return f"Error: {str(e)}"

def analyze_eeat(url, content):
    """Prompts Gemini to evaluate E-E-A-T."""
    try:
        model_name = get_flash_model()
        model = genai.GenerativeModel(model_name)
        
        prompt = f"""
You are an SEO expert focused on Google's E-E-A-T (Experience, Expertise, Authoritativeness, Trustworthiness) guidelines.
Analyze the following content extracted from the URL: {url}

Evaluate the content strictly according to these 4 criteria and provide a detailed analysis:

1. Experience: Does the text convey real-world experience about the subject? (e.g., did the author test the product, visit the place, or go through the situation?)
2. Expertise: Are the language and technical knowledge appropriate? Does the content demonstrate depth and technical competence on the subject?
3. Authoritativeness & Trustworthiness: Is the author or the site's curation clear? Is there transparency in the evaluation (cited sources, external links, author biography)? Does the site seem reliable to cover this topic?
4. Gaps: What is missing for this to be the definitive answer for this topic? What topics were not covered or could be explored further?

Format your response in Markdown, providing clear and actionable suggestions for improvement. Clearly divide each of the sections.

Base page content:
{content}
"""
        response = call_gemini_with_retry(model, prompt)
        return response.text
    except exceptions.ResourceExhausted:
        return "⚠️ Quota Error: The Gemini API request limit has been exceeded. Please try again in a few minutes or upgrade your plan."
    except Exception as e:
        return f"AI Analysis Error: {str(e)}"

def render_eeat_analysis_page():
    st.title("🏆 E-E-A-T Analysis")
    st.markdown("Evaluate the level of Experience, Expertise, Authoritativeness, and Trustworthiness (E-E-A-T) of any content, with user-focused suggestions for improvement.")
    
    with st.expander("⚙️ Analysis Settings", expanded=True):
        url = st.text_input("Page URL", placeholder="https://example.com/article")

    with st.expander("🔒 Authentication (Optional — for password-protected pages)"):
        use_auth = st.checkbox("This page requires authentication", key="eeat_use_auth")
        auth = None
        if use_auth:
            a_col1, a_col2 = st.columns(2)
            with a_col1:
                auth_user = st.text_input("Username", key="eeat_auth_user", placeholder="user")
            with a_col2:
                auth_pass = st.text_input("Password", key="eeat_auth_pass", placeholder="password", type="password")
            auth = (auth_user, auth_pass) if auth_user else None

    if st.button("🚀 Start E-E-A-T Analysis", type="primary"):
        if not url:
            st.error("Please enter a valid URL.")
            return
            
        if not (url.startswith('http://') or url.startswith('https://')):
            url = 'https://' + url
            
        with st.spinner("⏳ Fetching page content..."):
            content = fetch_page_content(url, auth=auth)
            
        if content.startswith("Error:"):
            st.error(f"Could not access the page: {content}")
            return
            
        with st.spinner("🧠 Analyzing E-E-A-T criteria with Gemini AI..."):
            analysis_result = analyze_eeat(url, content)
            
        st.success("Analysis complete!")
        st.markdown(analysis_result)
