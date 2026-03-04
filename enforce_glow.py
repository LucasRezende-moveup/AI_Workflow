import re
import os

path = r'c:\Users\Administrador\Documents\MoveupMedia\app.py'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Update CSS Selectors for Aggressive Magenta Glow
css_start_tag = '/* Login Page Overrides (Moveup Media Branding) */'
css_end_tag = '/* Fix placeholder size in the login page */'

# We use an even more aggressive selector and vibrant properties
login_css = """/* Login Page Overrides (Moveup Media Branding) */
    /* Target the container border wrapper with absolute priority */
    div[data-testid="stVerticalBlockBorderWrapper"]:has(.login-marker) {{
        max-width: 500px;
        margin: 80px auto !important;
        padding: 50px 40px !important;
        background: linear-gradient(135deg, rgba(226, 0, 113, 0.15) 0%, rgba(15, 23, 42, 0.9) 100%) !important;
        backdrop-filter: blur(40px) saturate(180%);
        
        /* THE GLOWING MAGENTA BORDER */
        border: 3px solid #E20071 !important;
        border-radius: 32px !important;
        
        /* MULTI-LAYERED MAGENTA GLOW (BLOOM EFFECT) */
        box-shadow: 
            0 40px 100px rgba(0, 0, 0, 0.9), 
            0 0 20px #E20071, 
            0 0 40px rgba(226, 0, 113, 0.6),
            0 0 60px rgba(226, 0, 113, 0.3) !important;
            
        display: flex !important;
        flex-direction: column !important;
        align-items: center !important;
        text-align: center !important;
        position: relative;
        overflow: hidden !important;
        z-index: 99 !important;
    }}
    
    /* Ensure the radial highlight is back and vibrant */
    div[data-testid="stVerticalBlockBorderWrapper"]:has(.login-marker)::before {{
        content: "";
        position: absolute;
        top: -50%;
        left: -50%;
        width: 200%;
        height: 200%;
        background: radial-gradient(circle at center, rgba(226, 0, 113, 0.3) 0%, transparent 60%);
        pointer-events: none;
        z-index: 0;
    }}

    .login-marker {{
        display: none;
    }}

    /* Title enhancement */
    div[data-testid="stVerticalBlockBorderWrapper"]:has(.login-marker) h3 {{
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
        font-size: 1.3rem !important;
        font-weight: 800 !important;
        text-transform: uppercase !important;
        letter-spacing: 2.5px !important;
        border: none !important;
        color: white !important;
        transition: all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275) !important;
        box-shadow: 0 10px 25px rgba(226, 0, 113, 0.5) !important;
    }}

    div[data-testid="stVerticalBlockBorderWrapper"]:has(.login-marker) .stButton > button:hover {{
        box-shadow: 0 15px 40px #E20071 !important;
        transform: translateY(-5px) scale(1.02) !important;
        filter: brightness(1.2);
    }}
    
    /* Input Polish */
    div[data-testid="stVerticalBlockBorderWrapper"]:has(.login-marker) .stTextInput input {{
        background: rgba(255, 255, 255, 0.08) !important;
        border: 2px solid rgba(226, 0, 113, 0.4) !important;
        border-radius: 16px !important;
        padding: 16px !important;
        color: white !important;
        text-align: center !important;
        font-size: 1.1rem !important;
        font-weight: 500 !important;
        transition: all 0.3s ease !important;
    }}
    
    div[data-testid="stVerticalBlockBorderWrapper"]:has(.login-marker) .stTextInput input:focus {{
        border-color: #FFC342 !important;
        box-shadow: 0 0 25px rgba(255, 195, 66, 0.5) !important;
        background: rgba(255, 255, 255, 0.12) !important;
    }}
"""

# Replace the CSS block
pattern = re.escape(css_start_tag) + r'.*?' + re.escape(css_end_tag)
content = re.sub(pattern, login_css + "\n    " + css_end_tag, content, flags=re.DOTALL)

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)

print("Aggressive magenta glow enforced.")
