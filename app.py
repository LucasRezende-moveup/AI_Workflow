import streamlit as st
import os
from dotenv import load_dotenv
from gsc_client import GSCClient
from analysis import generate_insights, ask_agent
# from comparator import render_comparator_page
# from internal_linking import render_internal_linking_page
# from serp_analysis import render_serp_analysis_page
from screaming_frog import render_screaming_frog_page
# from schema_audit import render_schema_audit_page
# from header_analysis import render_header_analysis_page
from cwv_analysis import render_cwv_analysis_page
# from hreflang_checker import render_hreflang_checker_page
# from image_alt_analysis import render_image_alt_analysis_page
# from eeat_analysis import render_eeat_analysis_page
from log_analysis import render_log_analysis_page


# Load environment variables
load_dotenv()

st.set_page_config(page_title="Moveup Media SEO AI Agent", page_icon="logo.png", layout="wide")

# --- THEME STATE ---
if "theme" not in st.session_state:
    st.session_state.theme = "Dark"

# --- CUSTOM CSS ---
def local_css():
    theme = st.session_state.theme
    
    # Theme-specific variables
    if theme == "Dark":
        bg_gradient = "radial-gradient(circle at top right, #1e1b4b 0%, #0f172a 100%)"
        glass_bg = "rgba(255, 255, 255, 0.04)"
        sidebar_bg = "rgba(20, 15, 30, 0.9)" # Branded deep purple/dark tint
        text_color = "#f8fafc"
        label_color = "#94a3b8"
        border_color = "rgba(226, 0, 113, 0.15)" # Subtle magenta border tint
        login_shadow = "rgba(0, 0, 0, 0.5)"
    else:
        bg_gradient = "linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%)"
        glass_bg = "rgba(255, 255, 255, 0.95)"
        sidebar_bg = "#f8f9fa"
        text_color = "#1e293b"
        label_color = "#64748b"
        border_color = "rgba(0, 0, 0, 0.08)"
        login_shadow = "rgba(0, 0, 0, 0.1)"

    st.markdown(f"""
    <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&family=Montserrat:wght@700&family=Bai+Jamjuree:wght@400;500;600;700&family=Manrope:wght@400;600;800&display=swap');

    /* Global Overrides */
    html, body, [data-testid="stAppViewContainer"] {{
        font-family: 'Manrope', sans-serif;
        color: {text_color};
    }}
    
    .stText, .stMarkdown, p, li, label, .stMetric [data-testid="stMetricValue"], .stMetric [data-testid="stMetricLabel"] {{
        font-family: 'Inter', sans-serif;
    }}
    
    h1, h2, h3, h4, h5, h6 {{
        font-family: 'Montserrat', sans-serif;
        font-weight: 700;
        letter-spacing: -0.5px;
        color: {text_color} !important;
    }}

    /* Global Header Container */
    .global-header {{
        display: flex;
        justify-content: flex-end;
        align-items: center;
        padding: 0px 20px;
        margin-bottom: 0px;
        width: 100%;
        position: relative;
        z-index: 1000;
        height: 60px;
        margin-top: -65px; /* Pull it up into the header area */
    }}

    .theme-selector-container {{
        width: 180px;
    }}

    /* Glassmorphism/Card Effect */
    .stMetric, .stDataFrame, .stTable, .stTextArea, .stTextInput, .stNumberInput, .stSelectbox, .stMultiSelect, div[data-testid="stExpander"] {{
        background: {glass_bg} !important;
        backdrop-filter: blur(10px);
        border: 1px solid {border_color} !important;
        border-radius: 12px;
        padding: 5px;
        transition: all 0.3s ease;
    }}
    
    /* Small selector for theme */
    div[data-testid="stHeader"] {{
        background: transparent !important;
    }}
    
    /* Input Text Fix */
    input, select, textarea {{
        color: {text_color} !important;
    }}

    .stMetric:hover {{
        background: rgba(226, 0, 113, 0.05) !important;
        border: 1px solid rgba(226, 0, 113, 0.3) !important;
        box-shadow: 0 0 15px rgba(226, 0, 113, 0.15);
    }}

    /* Primary Button Styling */
    .stButton > button {{
        background: linear-gradient(135deg, #E20071 0%, #8b0044 100%);
        color: white !important;
        border: none;
        border-radius: 10px;
        font-weight: 700;
        padding: 12px 28px;
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        text-transform: uppercase;
        letter-spacing: 0.5px;
    }}

    .stButton > button:hover {{
        transform: translateY(-2px);
        box-shadow: 0 8px 20px rgba(226, 0, 113, 0.4);
        background: linear-gradient(135deg, #ff007f 0%, #E20071 100%);
    }}

    /* Metric Label Styling */
    [data-testid="stMetricLabel"] {{
        color: {label_color} !important;
        font-size: 0.9rem !important;
        font-weight: 600;
    }}

    [data-testid="stMetricValue"] {{
        color: {text_color} !important;
        font-size: 1.8rem !important;
    }}

    /* App Background Gradient */
    .main {{
        background: {bg_gradient} !important;
    }}

    /* Sidebar Styling */
    section[data-testid="stSidebar"] {{
        background: {sidebar_bg} !important;
        backdrop-filter: blur(25px);
        border-right: 1px solid {border_color};
    }}
    
    section[data-testid="stSidebar"] .stMarkdown p, section[data-testid="stSidebar"] label {{
         color: {text_color} !important;
         font-weight: 600;
    }}

    /* Custom Radio Styling for Sidebar */
    [data-testid="stSidebar"] .stRadio > label {{
        padding: 10px 15px;
        border-radius: 8px;
        transition: background 0.2s;
        margin-bottom: 5px;
    }}

    [data-testid="stSidebar"] .stRadio div[role="radiogroup"] > label:hover {{
        background: rgba(226, 0, 113, 0.1) !important;
    }}

    /* Animation */
    @keyframes fadeIn {{
        from {{ opacity: 0; transform: translateY(10px); }}
        to {{ opacity: 1; transform: translateY(0); }}
    }}

    .element-container {{
        animation: fadeIn 0.5s ease forwards;
    }}

    /* Fix for broken arrow icons */
    [data-testid="stIcon"], [data-testid="stMetricDeltaIcon"] {{
        font-family: "Source Sans Pro", sans-serif !important;
    }}
    
    button[kind="header"] {{
        background: transparent !important;
    }}

    /* Login Page Overrides (Moveup Media Branding) */
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

    /* Fix placeholder size in the login page */
    .stTextInput input::placeholder {{
        font-size: 0.9rem !important;
        color: rgba(255, 255, 255, 0.4) !important;
    }}
    </style>
    """, unsafe_allow_html=True)

local_css()

# --- GLOBAL HEADER ---
def render_moveup_logo(width=200):
    """Renders the Moveup Media SVG logo."""
    logo_svg = f"""
    <div class="login-logo">
        <svg width="{width}" viewBox="0 0 222 46" fill="none" xmlns="http://www.w3.org/2000/svg">
            <g clip-path="url(#clip0_65_15424)">
                <path d="M41.0128 3.12455C37.9878 -1.78814e-06 33.0917 -1.78814e-06 30.0668 3.12455L2.26845 31.8967C-0.750942 35.0212 -0.750942 40.0936 2.26845 43.2182C5.28785 46.3427 10.1895 46.3427 13.2089 43.2182L41.0128 14.446C44.0321 11.3215 44.0321 6.2491 41.0128 3.12455Z" fill="#E20071" />
                <path d="M71.5666 7.20874C71.5445 7.06594 71.5335 6.92884 71.5059 6.78604C71.4783 6.64895 71.4452 6.52328 71.4121 6.38619C71.3845 6.26623 71.3569 6.14057 71.3237 6.02061C71.2851 5.88923 71.2409 5.76928 71.1968 5.6379C71.1526 5.51794 71.1195 5.39798 71.0698 5.27803C71.0201 5.15807 70.9649 5.04383 70.9153 4.92959C70.8601 4.80963 70.8104 4.68397 70.7442 4.56401C70.689 4.45548 70.6227 4.34695 70.562 4.24413C70.4958 4.12989 70.4295 4.00993 70.3578 3.89569C70.2805 3.77573 70.1922 3.66149 70.1094 3.54725C70.0431 3.45585 69.9769 3.35875 69.9051 3.26735C69.5794 2.86179 69.2207 2.48479 68.8232 2.14777C68.7349 2.07351 68.6411 2.00496 68.5472 1.93642C68.4368 1.85074 68.3264 1.76505 68.216 1.68508C68.1056 1.61083 67.9897 1.54228 67.8793 1.47373C67.7744 1.4109 67.6751 1.34235 67.5702 1.28523C67.4543 1.2224 67.3384 1.16528 67.2169 1.10816C67.1065 1.05103 66.9961 0.993912 66.8802 0.948215C66.7643 0.896806 66.6484 0.862533 66.5325 0.816835C66.411 0.771138 66.2896 0.725441 66.1626 0.685456C66.0467 0.651183 65.9308 0.622622 65.8093 0.594061C65.6824 0.559788 65.5554 0.525515 65.4229 0.496955C65.2905 0.468394 65.1525 0.451257 65.0145 0.434121C64.8986 0.416984 64.7882 0.394136 64.6722 0.382711C64.1644 0.331302 63.6511 0.331302 63.1432 0.382711C63.0273 0.394136 62.9169 0.416984 62.801 0.434121C62.663 0.456969 62.5305 0.468394 62.3925 0.496955C62.26 0.525515 62.1386 0.559788 62.0061 0.594061C61.8902 0.622622 61.7688 0.651183 61.6528 0.685456C61.5259 0.725441 61.41 0.771138 61.283 0.816835C61.1671 0.862533 61.0512 0.896806 60.9353 0.948215C60.8193 0.999624 60.7089 1.05675 60.5985 1.10816C60.4826 1.16528 60.3612 1.21669 60.2453 1.28523C60.1404 1.34235 60.0355 1.4109 59.9362 1.47373C59.8258 1.54228 59.7098 1.61083 59.5994 1.68508C59.4835 1.76505 59.3731 1.85645 59.2627 1.94213C59.1744 2.01068 59.0806 2.07922 58.9922 2.15348C58.7935 2.31913 58.6059 2.49621 58.4237 2.68471L29.7919 32.3137C26.7725 35.4382 26.7725 40.5106 29.7919 43.6352C32.8113 46.7597 37.713 46.7597 40.7324 43.6352L56.155 27.6754V37.9916C56.155 42.4128 59.616 46 63.8939 46C68.1719 46 71.6329 42.4128 71.6329 37.9916V8.35117C71.6329 8.08841 71.6218 7.82565 71.5942 7.56289C71.5832 7.44294 71.5611 7.32869 71.5445 7.20874H71.5666Z" fill="#F8FAFC" />
                <path d="M112.882 21.1921C113.269 21.1921 114.152 21.0207 113.986 20.0497L110.95 0.71402C110.895 0.37129 110.564 0 109.709 0C109.295 0 107.501 0.0856823 107.252 0.71402L102.698 13.6806C102.533 14.1662 102.229 14.9087 102.174 15.2515C102.091 14.9087 101.787 14.1376 101.622 13.6521L96.9299 0.71402C96.7643 0.228486 96.2675 0 95.7431 0C95.0807 0 93.3972 0.0285608 93.2592 0.71402L90.1128 20.0497C89.9472 20.9636 90.8028 21.1921 91.1892 21.1921C92.1828 21.1921 94.0596 21.135 94.17 20.3924L95.6603 8.79672L95.7707 7.62573C95.7983 8.02558 95.9639 8.56824 96.0467 8.79672L100.269 20.421C100.518 21.1064 102.146 21.1921 102.533 21.1921C103.361 21.1921 103.692 20.8779 103.857 20.421L108.053 8.79672C108.108 8.68248 108.301 8.22551 108.356 7.79709C108.384 8.19695 108.439 8.5968 108.494 8.79672L109.929 20.3924C110.04 21.1635 111.916 21.1921 112.882 21.1921Z" fill="#F8FAFC" />
                <path d="M128.15 0H127.93C121.664 0 119.512 2.57047 119.512 7.91134V13.2522C119.512 18.5931 121.664 21.1921 127.93 21.1921H128.15C134.415 21.1921 136.596 18.5931 136.596 13.2522V7.91134C136.596 2.57047 134.415 0 128.15 0ZM132.346 12.7952C132.346 16.2225 131.324 17.3364 128.15 17.3364H127.93C124.756 17.3364 123.762 16.194 123.762 12.7952V8.36831C123.762 5.22662 124.562 3.82715 127.93 3.82715H128.15C131.545 3.82715 132.346 5.22662 132.346 8.36831V12.7952Z" fill="#F8FAFC" />
                <path d="M156.715 0C155.694 0 154.866 0.0856823 154.176 0.656898L150.478 14.0805C150.312 14.6231 150.257 15.2229 150.202 15.7084C150.146 15.2229 150.091 14.6231 149.926 14.0805L146.117 0.799702C145.868 0.0856823 144.24 0 142.915 0C142.446 0 141.37 0.199926 141.701 1.14243L148.242 20.7351C148.435 21.1064 149.65 21.1921 151.057 21.1921C151.416 21.1921 151.802 21.0207 151.94 20.7351L158.454 1.14243C158.813 0.0856823 157.653 0 156.715 0Z" fill="#F8FAFC" />
                <path d="M176.98 4.11275C177.56 4.11275 177.643 1.97069 177.643 1.28523C177.643 0.7997 177.339 0.285606 176.897 0.285606H165.388C164.864 0.285606 164.367 0.542653 164.367 1.02819V20.1925C164.367 20.6209 164.864 20.8494 165.747 20.8494H176.98C177.56 20.8494 177.643 18.7073 177.643 18.0219C177.643 17.5363 177.339 17.0222 176.897 17.0222H168.507V12.3097H175.683C176.263 12.3097 176.318 10.1962 176.318 9.48218C176.318 8.99665 176.014 8.48255 175.6 8.48255H168.507V4.11275H176.98Z" fill="#F8FAFC" />
                <path d="M198.9 0C198.155 0 195.754 0.171365 195.754 0.799702V13.5093C195.754 16.194 195.146 17.3364 192.248 17.3364H192.028C189.157 17.3364 188.55 16.194 188.55 13.5093V0.885384C188.55 0.428412 188.053 0 187.529 0C186.811 0 184.41 0.171365 184.41 0.799702V13.7377C184.41 19.3357 186.922 21.1921 192.028 21.1921H192.248C197.382 21.1921 199.894 19.3357 199.894 13.7377V0.885384C199.894 0.428412 199.397 0 198.9 0Z" fill="#F8FAFC" />
                <path d="M214.576 0.285606H208.256C207.759 0.285606 207.234 0.514093 207.234 1.02819V20.4781C207.234 21.1064 209.636 21.1921 210.326 21.1921C210.85 21.1921 211.347 20.9065 211.347 20.4495V13.7663H214.576C219.847 13.7663 222 12.6524 222 7.45436V6.6261C222 1.51372 219.709 0.285606 214.576 0.285606ZM217.722 7.45436C217.722 9.51074 217.225 9.93915 214.576 9.93915H211.347V4.11275H214.576C217.225 4.11275 217.722 4.59829 217.722 6.6261V7.45436Z" fill="#F8FAFC" />
            </g>
        </svg>
    </div>
    """
    st.markdown(logo_svg, unsafe_allow_html=True)

# --- GLOBAL HEADER ---
def render_global_header():
    """Renders a top-right dropdown for theme selection."""
    col1, col2 = st.columns([10, 2])
    with col2:
        # Mini dropdown for UI Theme
        current_theme = st.session_state.theme
        theme_index = 0 if current_theme == "Dark" else 1
        new_theme = st.selectbox(
            "Theme",
            options=["Dark", "Light"],
            index=theme_index,
            key="theme_toggle_dropdown",
            label_visibility="collapsed"
        )
        if new_theme != current_theme:
            st.session_state.theme = new_theme
            st.rerun()

# --- AUTHENTICATION ---
def check_password():
    """Returns `True` if the user had the correct password."""
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
    return True

if not check_password():
    st.stop()  # Do not continue if check_password is not True

# --- INITIALIZATION ---

# Initialize GSC Client cache
@st.cache_resource
def get_gsc_client(secret_path, _v="1.1"):
    if os.path.exists(secret_path):
        return GSCClient(secret_path)
    return None

# Sidebar - Navigation
if os.path.exists("logo.png"):
    st.sidebar.image("logo.png", width=60)
elif os.path.exists("logo.jpg"):
    st.sidebar.image("logo.jpg", width=60)

st.sidebar.title("🤖 Moveup Media SEO AI Agent")
page = st.sidebar.radio("Navigate", ["📉 GSC Dashboard", "🪵 Log Analyzer", "⚔️ URL Comparator", "🔗 Internal Linking", "🔍 SERP Analyzer - In Progress", "🐸 Screaming Frog", "📊 Schema Audit", "📑 Header Analysis", "⚡ CWV Analysis", "🌐 Hreflang Checker", "🖼️ Image Alt Analysis", "🏆 E-E-A-T Analysis"], key="nav_radio")


# Sidebar - Configuration Expander
with st.sidebar.expander("🔑 Advanced Settings", expanded=False):
    adv_pass = st.text_input("Unlock Password", type="password", key="adv_settings_unlock")
    if adv_pass == "9763":
        client_secret_path = st.text_input("Client Secret JSON Path", "client_secret.json", key="sidebar_secret_path")
        gemini_api_key = st.text_input("Gemini API Key", value=os.getenv("GOOGLE_API_KEY", ""), type="password", key="sidebar_gemini_key")
        if st.button("🔄 Clear GSC Cache & Force Re-auth", key="force_reauth_btn"):
            st.cache_resource.clear()
            if os.path.exists("token.pickle"):
                os.remove("token.pickle")
            st.rerun()
    else:
        if adv_pass:
            st.error("Incorrect Password")
        client_secret_path = "client_secret.json"
        gemini_api_key = os.getenv("GOOGLE_API_KEY", "")

if gemini_api_key:
    os.environ["GOOGLE_API_KEY"] = gemini_api_key

# Global GSC Client Initialization
client = None
if os.path.exists(client_secret_path):
    try:
        client = get_gsc_client(client_secret_path, _v="1.1")
    except Exception as e:
        st.sidebar.error(f"GSC Auth Error: {e}")

# --- DASHBOARD RENDERING FUNCTION ---

def render_dashboard(data_rows):
    """
    Renders the main dashboard with aggregated data.
    """
    import pandas as pd

    df = pd.DataFrame(data_rows)
    
    if df.empty:
        st.warning("No data found for the selected criteria.")
        return

    # --- Robust Fallback: Auto-flatten if 'query' is missing but 'keys' is present ---
    if 'query' not in df.columns and 'keys' in df.columns:
        df['query'] = df['keys'].apply(lambda x: x[0] if isinstance(x, list) and len(x) > 0 else "N/A")
        df['page'] = df['keys'].apply(lambda x: x[1] if isinstance(x, list) and len(x) > 1 else "N/A")
        st.info("💡 Data was in raw format; auto-flattened 'keys' column.")

    # Defensive check for required columns
    required_cols = ['query', 'clicks', 'impressions', 'position']
    missing_cols = [col for col in required_cols if col not in df.columns]
    
    if missing_cols:
        st.error(f"Missing required data columns: {missing_cols}")
        st.info("Available columns: " + ", ".join(df.columns))
        if not df.empty:
            st.write("First row sample:", df.iloc[0].to_dict())
        st.dataframe(df.head())
        return

    # Ensure numeric columns
    numeric_cols = ['clicks', 'impressions', 'ctr', 'position']
    for col in numeric_cols:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors='coerce')

    # --- Metrics and Summary ---
    total_clicks = df['clicks'].sum()
    total_impressions = df['impressions'].sum()
    avg_ctr = total_clicks / total_impressions if total_impressions > 0 else 0
    avg_pos = df['position'].mean() if not df.empty else 0

    # --- Metrics Hero Section ---
    st.markdown("### 🚀 Performance Overview")
    m1, m2, m3, m4 = st.columns(4)
    
    with m1:
        st.metric("Total Clicks", f"{total_clicks:,}", delta=None)
    with m2:
        st.metric("Total Impressions", f"{total_impressions:,}", delta=None)
    with m3:
        st.metric("Avg CTR", f"{avg_ctr:.2%}", delta=None)
    with m4:
        st.metric("Avg Position", f"{avg_pos:.1f}", delta=None, delta_color="inverse")

    st.markdown("---")
    
    # --- Filters ---
    with st.expander("🔎 Advanced Data Filters", expanded=False):
        col_f1, col_f2, col_f3, col_f4 = st.columns(4)
        with col_f1:
            query_filter = st.text_input("Query (contains)", "", key="filter_query")
        with col_f2:
            page_filter = st.text_input("Page (contains)", "", key="filter_page")
        with col_f3:
            min_clicks = st.number_input("Min Clicks", min_value=0, value=0, key="filter_clicks")
        with col_f4:
            min_imp = st.number_input("Min Impressions", min_value=0, value=0, key="filter_imp")

    # Apply Filters
    filtered_df = df.copy()
    if query_filter and 'query' in filtered_df.columns:
        filtered_df = filtered_df[filtered_df['query'].astype(str).str.contains(query_filter, case=False, na=False)]
    if page_filter and 'page' in filtered_df.columns:
        filtered_df = filtered_df[filtered_df['page'].astype(str).str.contains(page_filter, case=False, na=False)]
    
    filtered_df = filtered_df[filtered_df['clicks'] >= min_clicks]
    filtered_df = filtered_df[filtered_df['impressions'] >= min_imp]
    
    st.info(f"📊 Showing {len(filtered_df)} unique Keyword-Page combinations for the selected period.")

    # --- Tabs ---
    tab1, tab2, tab3 = st.tabs(["🔢 Keyword Analysis", "💡 SEO Insights", "🤖 AI Agent Chat"])

    with tab1:
        st.subheader("Performance per Keyword & URL")
        if not filtered_df.empty:
            filtered_df = filtered_df.sort_values(by='clicks', ascending=False)
            st.dataframe(filtered_df, use_container_width=True)
        else:
            st.warning("No data matching filters.")

    with tab2:
        st.header("Automated SEO Insights")
        if not filtered_df.empty:
            insights = generate_insights(filtered_df.to_dict('records'))
            st.markdown(insights)
        else:
            st.write("No data available for insights.")

    with tab3:
        st.header("Chat with your GSC Data")
        st.write("Ask questions about your performance.")
        
        if "chat_messages" not in st.session_state:
            st.session_state.chat_messages = []

        for message in st.session_state.chat_messages:
            with st.chat_message(message["role"]):
                st.markdown(message["content"])

        if prompt := st.chat_input("What would you like to know?"):
            st.chat_message("user").markdown(prompt)
            st.session_state.chat_messages.append({"role": "user", "content": prompt})
            with st.spinner("Analyzing..."):
                response = ask_agent(prompt, filtered_df.to_dict('records'))
            with st.chat_message("assistant"):
                st.markdown(response)
            st.session_state.chat_messages.append({"role": "assistant", "content": response})

# --- PAGE ROUTING ---

if page == "📉 GSC Dashboard":
    render_global_header()
    st.title("🤖 Google Search Console Dashboard")
    
    # Sidebar - GSC Selection
    st.sidebar.subheader("📅 Data Range")
    import datetime
    today = datetime.date.today()
    default_start = today - datetime.timedelta(days=30)
    start_date = st.sidebar.date_input("Start Date", default_start, key="gsc_start_date")
    end_date = st.sidebar.date_input("End Date", today, key="gsc_end_date")

    if client:
        try:
            properties = client.list_properties()
            if properties:
                site_urls = sorted([p['siteUrl'] for p in properties])
                selected_property = st.sidebar.selectbox("Select Property", site_urls, key="gsc_property_select")
                
                if st.sidebar.button("Analyze Property", type="primary", key="analyze_property_btn"):
                    s_date = start_date.strftime('%Y-%m-%d')
                    e_date = end_date.strftime('%Y-%m-%d')
                    
                    # Progress Tracking Implementation
                    progress_text = "Fetching GSC data... 0 rows"
                    my_bar = st.progress(0, text=progress_text)
                    
                    def progress_cb(count):
                        # GSC doesn't give a total easily, so we update the text and simulate bar movement
                        # If we assume 25000 is our limit, we can show % of that
                        pct = min(1.0, count / 25000)
                        my_bar.progress(pct, text=f"Fetching GSC data... {count:,} rows received")

                    data = client.get_search_analytics(
                        selected_property, 
                        start_date=s_date, 
                        end_date=e_date,
                        progress_callback=progress_cb
                    )
                    
                    if data:
                        st.session_state['gsc_data'] = data
                        st.session_state['selected_property'] = selected_property
                        st.success(f"Complete! Fetched {len(data)} rows.")
                        st.rerun()
                    else:
                        st.warning("No data found for the selected property/dates.")
                
                if 'gsc_data' in st.session_state and st.session_state.get('selected_property') == selected_property:
                    st.header(f"Data for: {selected_property}")
                    render_dashboard(st.session_state['gsc_data'])
                elif 'gsc_data' in st.session_state:
                    st.info("Property selection changed. Click 'Analyze Property' to refresh data.")
            else:
                st.sidebar.warning("No properties found.")
        except Exception as e:
            st.error(f"GSC Error: {e}")
    else:
        st.error(f"Failed to initialize GSC Client. Check {client_secret_path}")

elif page == "⚔️ URL Comparator":
    render_global_header()
    st.write("Temporarily Disabled")
    # render_comparator_page()

elif page == "🔗 Internal Linking":
    render_global_header()
    st.write("Temporarily Disabled")
    # render_internal_linking_page(client)

elif page == "🔍 SERP Analyzer - In Progress":
    render_global_header()
    st.write("Temporarily Disabled")
    # render_serp_analysis_page()

elif page == "🐸 Screaming Frog":
    render_global_header()
    render_screaming_frog_page()

elif page == "📊 Schema Audit":
    render_global_header()
    st.write("Temporarily Disabled")
    # render_schema_audit_page()

elif page == "📑 Header Analysis":
    render_global_header()
    st.write("Temporarily Disabled")
    # render_header_analysis_page()

elif page == "⚡ CWV Analysis":
    render_global_header()
    render_cwv_analysis_page()

elif page == "🌐 Hreflang Checker":
    render_global_header()
    st.write("Temporarily Disabled")
    # render_hreflang_checker_page(client)

elif page == "🖼️ Image Alt Analysis":
    render_global_header()
    st.write("Temporarily Disabled")
    # render_image_alt_analysis_page()

elif page == "🏆 E-E-A-T Analysis":
    render_global_header()
    st.write("Temporarily Disabled")
    # render_eeat_analysis_page()

elif page == "🪵 Log Analyzer":
    render_global_header()
    render_log_analysis_page()
