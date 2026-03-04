import streamlit as st
import requests
from bs4 import BeautifulSoup
import os

def extract_headers(url):
    """Fetches the URL and extracts all H1 through H6 tags, returning a list of dicts."""
    headers_data = []
    
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    }
    
    try:
        response = requests.get(url, headers=headers, timeout=15)
        response.raise_for_status()
        
        soup = BeautifulSoup(response.text, 'lxml')
        
        for heading in soup.find_all(['h1', 'h2', 'h3', 'h4', 'h5', 'h6']):
            tag_name = heading.name.upper()
            text = heading.get_text(strip=True)
            if text:
                headers_data.append({"tag": tag_name, "text": text})
                
        return headers_data, None
    except requests.exceptions.RequestException as e:
        return None, f"Failed to fetch the URL: {e}"
    except Exception as e:
        return None, f"An unexpected error occurred: {e}"

def generate_header_analysis(headers_data, target_keyword, url):
    """Uses Gemini to analyze the header structure against the target keyword."""
    try:
        import google.generativeai as genai
        api_key = os.getenv("GOOGLE_API_KEY")
        if not api_key:
            return None, "Google API Key is not set. Cannot run AI analysis."
            
        genai.configure(api_key=api_key)
        
        # Robust model selection
        available_models = [m.name for m in genai.list_models() if 'generateContent' in m.supported_generation_methods]
        
        target_model = None
        for alias in ['models/gemini-1.5-flash', 'gemini-1.5-flash', 'models/gemini-flash-latest', 'models/gemini-2.0-flash']:
            if alias in available_models:
                target_model = alias
                break
                
        if not target_model:
            flash_models = [m for m in available_models if 'flash' in m.lower()]
            target_model = flash_models[0] if flash_models else available_models[0]

        model = genai.GenerativeModel(target_model)
        
        # Format headers for the prompt using simple labels instead of HTML tags
        headers_text = "\n".join([f"{h['tag']}: {h['text']}" for h in headers_data])
        
        prompt = f"""
        You are an expert SEO Technical Auditor. Please analyze the following HTML header structure (H1-H6) extracted from {url}.
        
        The user's TARGET KEYWORD / TOPIC CLUSTER is: "{target_keyword}"
        
        Header Structure Extracted:
        {headers_text}
        
        Please provide a comprehensive review covering:
        1. **H1 Optimization**: Is there only one H1? Does it clearly target the main keyword?
        2. **Keyword Relevance**: Are the H2 and H3 subheadings semantically related to the target keyword? Do they cover the necessary topical clusters well?
        3. **Hierarchy Validation**: Are the tags used in a logical, nested structure (e.g., H1 -> H2 -> H3) without skipping levels inappropriately?
        4. **Actionable Suggestions**: Provide exact recommendations on how to rewrite specific headers (show the "Before" and "After") to better capture search intent and rank higher for the target keyword.
        
        **IMPORTANT**: Write your analysis as plain text markdown. DO NOT use HTML tags (like <h1>) in your suggestions; use "H1:", "H2:", etc., instead.
        """
        
        response = model.generate_content(prompt)
        return response.text, None
        
    except Exception as e:
        return None, f"AI Analysis Failed: {e}"

def render_header_analysis_page():
    st.title("📑 Header Structure Analysis")
    st.markdown("""
    Evaluate the hierarchy and semantic relevance of a page's Content Headers (`<H1>` to `<H6>`). 
    Provide a URL and a target keyword to see if the structure is optimized to rank for that topic cluster.
    """)

    col1, col2 = st.columns([2, 1])
    with col1:
        url = st.text_input("Enter URL to Audit", placeholder="https://example.com/page")
    with col2:
        keyword = st.text_input("Target Keyword / Cluster", placeholder="e.g., 'best running shoes'")

    if st.button("Analyze Headers", type="primary"):
        if not url:
            st.warning("Please enter a valid URL.")
            return
        if not keyword:
            st.warning("Please provide a target keyword or topic cluster for the AI to contextualize the analysis.")
            return

        with st.spinner("Fetching header tags..."):
            headers_data, error = extract_headers(url)
            
            if error:
                st.error(error)
                return
                
            if not headers_data:
                st.warning("No standard HTML heading tags (H1-H6) were found on this page.")
                return

            st.success(f"Successfully extracted {len(headers_data)} header tags.")
            
            # Create two columns for results
            res_col1, res_col2 = st.columns([1, 2])
            
            with res_col1:
                st.markdown("### 📋 Extracted Hierarchy")
                
                # Visual hierarchy display using cleaner markdown/div structure
                for h in headers_data:
                    tag = h['tag']
                    text = h['text']
                    level = int(tag[1])
                    indent = (level - 1) * 20
                    
                    colors = {
                        "H1": "#E20071",
                        "H2": "#3b82f6",
                        "H3": "#10b981",
                        "H4": "#f59e0b",
                        "H5": "#8b5cf6",
                        "H6": "#64748b"
                    }
                    color = colors.get(tag, "#FFFFFF")
                    
                    # Using a simpler display that doesn't look like a code editor
                    st.markdown(f"""
                    <div style='margin-left: {indent}px; margin-bottom: 4px; display: flex; align-items: baseline; gap: 8px;'>
                        <span style='color: {color}; font-weight: 800; font-size: 0.85rem; min-width: 30px;'>{tag}</span>
                        <span style='font-size: 0.95rem; line-height: 1.4;'>{text}</span>
                    </div>
                    """, unsafe_allow_html=True)
                
            with res_col2:
                st.markdown("### 🤖 AI SEO Evaluation")
                with st.spinner("Analyzing keyword relevance and structure..."):
                    analysis, ai_error = generate_header_analysis(headers_data, keyword, url)
                    
                    if ai_error:
                        st.error(ai_error)
                    else:
                        # Display inside a nice container
                        st.markdown(f"<div style='border: 1px solid rgba(226, 0, 113, 0.3); padding: 20px; border-radius: 12px; background: rgba(0,0,0,0.2);'>\n{analysis}\n</div>", unsafe_allow_html=True)
