import re
import os

path = r'c:\Users\Administrador\Documents\MoveupMedia\app.py'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Update CSS Selectors for ULTRA-Aggressive Magenta Glow
css_start_tag = '/* Login Page Overrides (Moveup Media Branding) */'
css_end_tag = '/* Fix placeholder size in the login page */'

# We use the IN-DEPTH vertical block isolation
login_css = """/* Login Page Overrides (Moveup Media Branding) */
    /* Target the INNERMOST vertical block that has our marker */
    [data-testid="stVerticalBlock"]:has(.login-marker):not(:has([data-testid="stVerticalBlock"]:has(.login-marker))) {{
        max-width: 500px;
        margin: 80px auto !important;
        padding: 60px 40px !important;
        
        /* MAGENTA PINK TINTED BACKGROUND */
        background: linear-gradient(135deg, rgba(226, 0, 113, 0.15) 0%, rgba(15, 23, 42, 0.95) 100%) !important;
        backdrop-filter: blur(40px) saturate(200%);
        
        /* THE GLOWING MAGENTA BORDER (2px for sharpness + box-shadow for glow) */
        border: 2px solid #E20071 !important;
        border-radius: 32px !important;
        
        /* RADIANT MAGENTA BLOOM */
        box-shadow: 
            0 40px 100px rgba(0, 0, 0, 0.9), 
            0 0 30px #E20071, 
            0 0 60px rgba(226, 0, 113, 0.5) !important;
            
        display: flex !important;
        flex-direction: column !important;
        align-items: center !important;
        text-align: center !important;
        position: relative;
        overflow: hidden !important;
        z-index: 99 !important;
    }}
    
    /* Ensure the column parents don't get styled */
    [data-testid="stVerticalBlock"]:has([data-testid="stVerticalBlock"]:has(.login-marker)) {{
        border: none !important;
        box-shadow: none !important;
        background: transparent !important;
    }}

    /* Global highlight inside the box */
    [data-testid="stVerticalBlock"]:has(.login-marker):not(:has([data-testid="stVerticalBlock"]:has(.login-marker)))::before {{
        content: "";
        position: absolute;
        top: -50%;
        left: -50%;
        width: 200%;
        height: 200%;
        background: radial-gradient(circle at center, rgba(226, 0, 113, 0.2) 0%, transparent 65%);
        pointer-events: none;
        z-index: 0;
    }}

    .login-marker {{
        display: none;
    }}

    /* Text Polish */
    [data-testid="stVerticalBlock"]:has(.login-marker):not(:has([data-testid="stVerticalBlock"]:has(.login-marker))) h3 {{
        font-family: 'Bai Jamjuree', sans-serif !important;
        color: #FFFFFF !important;
        letter-spacing: -2px;
        margin-bottom: 25px !important;
        font-weight: 800 !important;
        text-shadow: 0 0 15px rgba(226, 0, 113, 0.8) !important;
    }}

    .login-logo {{
        margin-bottom: 40px;
        filter: drop-shadow(0 0 20px #E20071);
        z-index: 1;
    }}

    /* Button Centering & Glow */
    [data-testid="stVerticalBlock"]:has(.login-marker):not(:has([data-testid="stVerticalBlock"]:has(.login-marker))) .stButton {{
        display: flex !important;
        justify-content: center !important;
        width: 100% !important;
        margin-top: 25px !important;
    }}

    [data-testid="stVerticalBlock"]:has(.login-marker):not(:has([data-testid="stVerticalBlock"]:has(.login-marker))) .stButton > button {{
        background: linear-gradient(135deg, #E20071 0%, #ab0056 100%) !important;
        width: auto !important;
        min-width: 240px !important;
        border-radius: 16px !important;
        padding: 16px 45px !important;
        font-family: 'Bai Jamjuree', sans-serif !important;
        font-size: 1.3rem !important;
        font-weight: 800 !important;
        text-transform: uppercase !important;
        letter-spacing: 2.5px !important;
        border: none !important;
        color: white !important;
        transition: all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275) !important;
        box-shadow: 0 10px 25px rgba(226, 0, 113, 0.5) !important;
    }}

    [data-testid="stVerticalBlock"]:has(.login-marker):not(:has([data-testid="stVerticalBlock"]:has(.login-marker))) .stButton > button:hover {{
        box-shadow: 0 15px 40px #E20071 !important;
        transform: translateY(-5px) scale(1.02) !important;
        filter: brightness(1.2);
    }}
    
    /* Input Polish */
    [data-testid="stVerticalBlock"]:has(.login-marker):not(:has([data-testid="stVerticalBlock"]:has(.login-marker))) .stTextInput input {{
        background: rgba(255, 255, 255, 0.08) !important;
        border: 2px solid rgba(226, 0, 113, 0.4) !important;
        border-radius: 16px !important;
        padding: 16px !important;
        color: white !important;
        text-align: center !important;
        font-size: 1.1rem !important;
    }}
"""

# Replace the CSS block
pattern = re.escape(css_start_tag) + r'.*?' + re.escape(css_end_tag)
content = re.sub(pattern, login_css + "\n    " + css_end_tag, content, flags=re.DOTALL)

# 2. Revert check_password to standard st.container() (no border) to avoid white border
check_pass_pattern = r'def check_password\(\):.*?return True'
restored_check_pass = """def check_password():
    \"\"\"Returns `True` if the user had the correct password.\"\"\"
    if not st.session_state.get("password_correct", False):
        # Center the login box using columns
        _, col2, _ = st.columns([1, 1.8, 1])
        with col2:
            # We use standard container to avoid Streamlit's default thin white border
            with st.container():
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

print("Aggressive magenta glow and pink background enforced.")
