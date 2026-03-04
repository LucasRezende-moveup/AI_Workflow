import re
import os

path = r'c:\Users\Administrador\Documents\MoveupMedia\app.py'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Update CSS Selectors for Stable Branded Restoration
# We target the specific border wrapper that Streamlit creates for container(border=True)
css_start_tag = '/* Login Page Overrides (Moveup Media Branding) */'
css_end_tag = '/* Fix placeholder size in the login page */'

login_css = """/* Login Page Overrides (Moveup Media Branding) */
    /* Target the stable border wrapper of our login container */
    div[data-testid="stVerticalBlockBorderWrapper"]:has(.login-marker) {{
        max-width: 500px;
        margin: 80px auto !important;
        padding: 50px 40px !important;
        /* The specific "magenta/pink shade" background */
        background: linear-gradient(135deg, rgba(226, 0, 113, 0.12) 0%, rgba(15, 23, 42, 0.85) 100%) !important;
        backdrop-filter: blur(40px) saturate(180%);
        /* Vibrant Magenta Border */
        border: 2px solid rgba(226, 0, 113, 0.8) !important;
        border-radius: 32px !important;
        /* Intense Magenta Bloom Shadow */
        box-shadow: 0 40px 100px rgba(0, 0, 0, 0.8), 0 0 70px rgba(226, 0, 113, 0.4) !important;
        display: flex !important;
        flex-direction: column !important;
        align-items: center !important;
        text-align: center !important;
        position: relative;
        overflow: hidden !important;
    }}
    
    div[data-testid="stVerticalBlockBorderWrapper"]:has(.login-marker)::before {{
        content: "";
        position: absolute;
        top: -50%;
        left: -50%;
        width: 200%;
        height: 200%;
        background: radial-gradient(circle at center, rgba(226, 0, 113, 0.25) 0%, transparent 70%);
        pointer-events: none;
        z-index: 0;
    }}

    .login-marker {{
        display: none;
    }}

    /* Ensure children are centered and well-spaced */
    div[data-testid="stVerticalBlockBorderWrapper"]:has(.login-marker) h3 {{
        font-family: 'Bai Jamjuree', sans-serif !important;
        color: #FFFFFF !important;
        letter-spacing: -1.5px;
        margin-bottom: 30px !important;
        font-weight: 700 !important;
        text-shadow: 0 0 20px rgba(226, 0, 113, 0.4);
    }}

    .login-logo {{
        margin-bottom: 40px;
        filter: drop-shadow(0 0 15px rgba(226, 0, 113, 0.6));
        z-index: 1;
    }}

    /* Button Centering Fix */
    div[data-testid="stVerticalBlockBorderWrapper"]:has(.login-marker) .stButton {{
        display: flex !important;
        justify-content: center !important;
        width: 100% !important;
        margin-top: 25px !important;
    }}

    div[data-testid="stVerticalBlockBorderWrapper"]:has(.login-marker) .stButton > button {{
        background: linear-gradient(135deg, #E20071 0%, #ab0056 100%) !important;
        width: auto !important;
        min-width: 240px !important;
        border-radius: 16px !important;
        padding: 16px 45px !important;
        font-family: 'Bai Jamjuree', sans-serif !important;
        font-size: 1.25rem !important;
        font-weight: 700 !important;
        text-transform: uppercase !important;
        letter-spacing: 2px !important;
        border: none !important;
        color: white !important;
        transition: all 0.3s ease !important;
        box-shadow: 0 10px 20px rgba(226, 0, 113, 0.4) !important;
    }}

    div[data-testid="stVerticalBlockBorderWrapper"]:has(.login-marker) .stButton > button:hover {{
        box-shadow: 0 15px 35px rgba(226, 0, 113, 0.7) !important;
        transform: translateY(-5px) !important;
        filter: brightness(1.1);
    }}
    
    div[data-testid="stVerticalBlockBorderWrapper"]:has(.login-marker) .stTextInput {{
        width: 100% !important;
        max-width: 340px !important;
    }}

    div[data-testid="stVerticalBlockBorderWrapper"]:has(.login-marker) .stTextInput input {{
        background: rgba(255, 255, 255, 0.08) !important;
        border: 1px solid rgba(226, 0, 113, 0.3) !important;
        border-radius: 16px !important;
        padding: 16px !important;
        color: white !important;
        text-align: center !important;
        font-size: 1.1rem !important;
    }}
    
    div[data-testid="stVerticalBlockBorderWrapper"]:has(.login-marker) .stTextInput input:focus {{
        border-color: #FFC342 !important;
        box-shadow: 0 0 20px rgba(255, 195, 66, 0.4) !important;
        background: rgba(255, 255, 255, 0.12) !important;
    }}
"""

# Replace the CSS block
pattern = re.escape(css_start_tag) + r'.*?' + re.escape(css_end_tag)
content = re.sub(pattern, login_css + "\n    " + css_end_tag, content, flags=re.DOTALL)

# 2. Restore st.container(border=True) and centering
check_pass_pattern = r'def check_password\(\):.*?return True'
restored_check_pass = """def check_password():
    \"\"\"Returns `True` if the user had the correct password.\"\"\"
    if not st.session_state.get("password_correct", False):
        # Center the login box using columns
        _, col2, _ = st.columns([1, 1.8, 1])
        with col2:
            # We use container(border=True) as a stable anchor for our CSS styles
            with st.container(border=True):
                st.markdown('<div class="login-marker"></div>', unsafe_allow_html=True)
                render_moveup_logo()
                st.markdown('<h3>SEO AI AGENT LOGIN</h3>', unsafe_allow_html=True)
                
                # Access Key input without label for cleaner look
                password = st.text_input("Access Key", type="password", key="login_pass_input", label_visibility="collapsed", placeholder="Enter your access key")
                
                if st.button("Enter", type="primary"):
                    if password == os.getenv("APP_PASSWORD", "moveupmedia"):
                        st.session_state["password_correct"] = True
                        st.rerun()
                    else:
                        st.error("🚫 Invalid Access Key")
        return False
    return True"""

content = re.sub(check_pass_pattern, restored_check_pass, content, flags=re.DOTALL)

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)

print("Robust magenta restoration applied.")
