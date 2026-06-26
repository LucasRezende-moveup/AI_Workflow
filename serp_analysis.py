import streamlit as st
import os
import google.generativeai as genai
from serp_utils import fetch_serp_results, GEOLOCATIONS, get_location_by_name
from comparator import scrape_url

def analyze_serp_with_gemini(keyword, target_url, serp_data, auth=None):
    """
    Uses Gemini to analyze the SERP results and compare with a target URL.
    Accepts an optional auth=(username, password) tuple for HTTP Basic Auth on the target URL.
    """
    api_key = os.getenv("GOOGLE_API_KEY")
    if not api_key:
        return "Gemini API key not found."

    serp_results = serp_data.get("organic", [])
    related_keywords = serp_data.get("related_keywords", [])

    try:
        genai.configure(api_key=api_key)
        available_models = [m.name for m in genai.list_models() if 'generateContent' in m.supported_generation_methods]
        target_model = 'models/gemini-1.5-flash'
        for alias in ['models/gemini-1.5-flash', 'models/gemini-flash-latest', 'models/gemini-2.0-flash']:
            if alias in available_models:
                target_model = alias
                break
        
        model = genai.GenerativeModel(target_model)
        
        serp_context = ""
        for i, res in enumerate(serp_results):
            serp_context += f"\nResult {i+1}: {res['title']}\nURL: {res['link']}\nSnippet: {res['snippet']}\n"
            
        related_context = ", ".join(related_keywords) if related_keywords else "None detected."

        if target_url:
            target_data = scrape_url(target_url, auth=auth)
            prompt = f"""
            You are an SEO expert. Analyze the top 3 Google Mobile search results for: '{keyword}'.
            
            TOP 3 SERP RESULTS:
            {serp_context}
            
            RELATED SEARCHES:
            {related_context}
            
            MY TARGET URL:
            {target_url}
            Content Analysis: {target_data}
            
            TASK:
            1. Compare my Target URL with the mobile top 3.
            2. Identify semantic gaps using 'RELATED SEARCHES'.
            3. Provide 3 specific, actionable recommendations for mobile dominance.
            """
        else:
            prompt = f"""
            You are an SEO expert. Analyze the top 3 Google Mobile search results for: '{keyword}'.
            
            TOP 3 SERP RESULTS:
            {serp_context}
            
            RELATED SEARCHES:
            {related_context}
            
            TASK:
            1. Why are these results winning on Mobile?
            2. Identify excellence factors and semantic trends.
            """
            
        response = model.generate_content(prompt)
        return response.text
    except Exception as e:
        return f"Error with Gemini Analysis: {e}"

def render_serp_analysis_page():
    st.markdown("### 📱 Mobile SERP Analyzer & Competitor Insights")
    st.write("Emulate Googlebot Mobile to see how the top 3 results look and why they are winning.")

    with st.container(border=True):
        col1, col2 = st.columns([3, 1])
        with col1:
            keyword = st.text_input("Focus Keyword", placeholder="e.g. best coffee machine 2024")
        with col2:
            loc_names = [l["name"] for l in GEOLOCATIONS]
            selected_loc_name = st.selectbox("Geolocation", options=loc_names, index=0)
            
        target_url = st.text_input("Target URL (Optional)", placeholder="https://yourpage.com/article")

    with st.expander("🔒 Authentication (Optional — for the Target URL)"):
        use_auth = st.checkbox("Target URL requires authentication", key="serp_use_auth")
        auth = None
        if use_auth:
            a_col1, a_col2 = st.columns(2)
            with a_col1:
                auth_user = st.text_input("Username", key="serp_auth_user", placeholder="user")
            with a_col2:
                auth_pass = st.text_input("Password", key="serp_auth_pass", placeholder="password", type="password")
            auth = (auth_user, auth_pass) if auth_user else None
        
    if st.button("Analyze Mobile SERP", type="primary"):
        if not keyword:
            st.error("Please enter a keyword.")
        else:
            with st.spinner(f"Emulating Googlebot Mobile for '{keyword}' in {selected_loc_name}..."):
                # Cleaned up call (no period/age filter)
                results_data = fetch_serp_results(keyword, location_name=selected_loc_name)
                
                if isinstance(results_data, dict) and "error" in results_data:
                    st.error(f"⚠️ SERP Error: {results_data['error']}")
                elif not results_data or not results_data.get("organic"):
                    st.error("No organic results found. Google might be blocking or query returned no results.")
                else:
                    results = results_data["organic"]
                    related = results_data.get("related_keywords", [])
                    
                    st.success(f"Successfully fetched top {len(results)} mobile results.")
                    
                    if related:
                         st.markdown("##### 💡 Mobile Semantic Trends")
                         st.info(", ".join(related[:8]))

                    cols = st.columns(len(results))
                    for i, res in enumerate(results):
                        with cols[i]:
                            with st.container(border=True):
                                st.markdown(f"**#{i+1}**")
                                st.write(f"[{res['title']}]({res['link']})")
                                st.caption(res['snippet'])
                    
                    with st.spinner("AI is analyzing the mobile competition..."):
                        analysis = analyze_serp_with_gemini(f"{keyword} (Mobile - {selected_loc_name})", target_url, results_data, auth=auth)
                        st.markdown("---")
                        st.markdown("### 🤖 Mobile Competitor Insights")
                        st.markdown(analysis)
