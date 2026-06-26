import streamlit as st
import requests
from bs4 import BeautifulSoup
import json
import os

def render_schema_audit_page():
    st.title("📊 Schema Validation & Audit")
    st.markdown("""
    Analyze the structured data (JSON-LD) implemented on any webpage. 
    Enter a URL below to extract, validate, and audit its schema markup.
    """)

    url = st.text_input("Enter URL to Audit Schema", placeholder="https://example.com/page")

    with st.expander("🔒 Authentication (Optional — for password-protected pages)"):
        use_auth = st.checkbox("This page requires authentication", key="schema_use_auth")
        auth = None
        if use_auth:
            a_col1, a_col2 = st.columns(2)
            with a_col1:
                auth_user = st.text_input("Username", key="schema_auth_user", placeholder="user")
            with a_col2:
                auth_pass = st.text_input("Password", key="schema_auth_pass", placeholder="password", type="password")
            auth = (auth_user, auth_pass) if auth_user else None

    if st.button("Audit Schema", type="primary"):
        if not url:
            st.warning("Please enter a valid URL.")
            return

        with st.spinner("Fetching and extracting schema..."):
            try:
                headers = {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                }
                response = requests.get(url, headers=headers, timeout=15, auth=auth or None)
                response.raise_for_status()
                
                soup = BeautifulSoup(response.text, 'lxml')
                scripts = soup.find_all('script', type='application/ld+json')

                if not scripts:
                    st.error("No JSON-LD schema found on this page.")
                    return

                st.success(f"Found {len(scripts)} JSON-LD blocks on the page.")
                
                for i, script in enumerate(scripts):
                    with st.expander(f"Schema Block {i+1}", expanded=True):
                        try:
                            data = json.loads(script.string)
                            st.json(data)
                            
                            # Simple extraction of @type
                            types = []
                            if isinstance(data, dict):
                                if '@graph' in data:
                                    for item in data['@graph']:
                                        if '@type' in item:
                                            if isinstance(item['@type'], list):
                                                types.extend(item['@type'])
                                            else:
                                                types.append(item['@type'])
                                else:
                                    if '@type' in data:
                                        if isinstance(data['@type'], list):
                                            types.extend(data['@type'])
                                        else:
                                            types.append(data['@type'])
                            elif isinstance(data, list):
                                for item in data:
                                    if isinstance(item, dict) and '@type' in item:
                                        if isinstance(item['@type'], list):
                                            types.extend(item['@type'])
                                        else:
                                            types.append(item['@type'])

                            if types:
                                # Ensure all elements are strings before joining
                                types = [str(t) for t in types]
                                st.info(f"**Detected Types:** {', '.join(types)}")
                            else:
                                st.warning("No standard '@type' detected in this block.")

                        except json.JSONDecodeError as e:
                            st.error(f"Failed to parse JSON in this block: {e}")
                            st.code(script.string, language="json")

                # AI Audit Section
                st.markdown("### 🤖 AI Schema Analysis")
                st.info("Generating expert analysis of the extracted schema...")
                
                try:
                    import google.generativeai as genai
                    api_key = os.getenv("GOOGLE_API_KEY")
                    if not api_key:
                        st.warning("Google API Key is not set. Cannot run AI analysis.")
                    else:
                        genai.configure(api_key=api_key)
                        
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
                        
                        all_schemas = []
                        for s in scripts:
                            try:
                                all_schemas.append(json.loads(s.string))
                            except:
                                pass
                        
                        prompt = f"""
                        You are an expert SEO schema auditor. Please analyze the following JSON-LD schema extracted from {url}.
                        Identify any missing recommended properties, validate the structure according to Schema.org guidelines, 
                        and suggest improvements for better rich snippets in Google Search results.
                        
                        CRITICAL INSTRUCTION: You must show exactly WHERE in the JSON the improvements should be made. 
                        Do this by writing out the specific JSON block with the new properties added, using comments or highlighting 
                        to clearly indicate the changes (e.g., // NEW: Add this property). Provide complete, valid JSON-LD examples 
                        that the user can copy and paste.
                        
                        Schema Extracted:
                        {json.dumps(all_schemas, indent=2)}
                        
                        Provide your findings in a clear, formatted markdown response.
                        """
                        
                        response = model.generate_content(prompt)
                        st.markdown(response.text)
                except Exception as e:
                    st.error(f"AI Analysis Failed: {e}. Ensure you have the 'google-generativeai' package installed and a valid API key.")

            except requests.exceptions.RequestException as e:
                st.error(f"Failed to fetch the URL: {e}")
            except Exception as e:
                st.error(f"An unexpected error occurred: {e}")
