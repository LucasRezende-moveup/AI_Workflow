
import sys
import py_compile

print("Checking syntax of app.py...")
try:
    py_compile.compile('app.py', doraise=True)
    print("Syntax OK.")
    
    # Check if necessary modules are importable
    import plotly.express
    import streamlit
    print("Dependencies OK.")

except Exception as e:
    print(f"Syntax or Dependency Error: {e}")
    sys.exit(1)
