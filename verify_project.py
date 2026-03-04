
import sys
import os

print("Checking environment...")
try:
    import streamlit
    import googleapiclient
    import pandas
    import plotly
    import openai
    print("Dependencies imported successfully.")
except ImportError as e:
    print(f"Missing dependency: {e}")
    sys.exit(1)

print("Checking GSC Client...")
try:
    from gsc_client import GSCClient
    data = GSCClient.generate_mock_data(days=5)
    print(f"Generated {len(data)} rows of mock data.")
except Exception as e:
    print(f"Error in GSC Client: {e}")
    sys.exit(1)

print("Checking Analysis...")
try:
    from analysis import generate_insights
    insights = generate_insights(data)
    print("Insights generated successfully.")
    try:
        print("Preview:", insights[:50] + "...")
    except UnicodeEncodeError:
        print("Preview:", insights[:50].encode('ascii', 'replace').decode('ascii') + "...")
except Exception as e:
    print(f"Error in Analysis: {e}")
    sys.exit(1)

print("Project verification successful!")
