import requests
import os
from dotenv import load_dotenv

load_dotenv()

def test_psi_api():
    api_key = os.getenv("PAGESPEED_API_KEY") or os.getenv("GOOGLE_API_KEY")
    url = "https://www.google.com"
    strategy = "mobile"
    endpoint = "https://www.googleapis.com/pagespeedonline/v5/runPagespeed"
    
    print(f"Testing PSI API for {url} ({strategy})...")
    
    params = {
        'url': url,
        'key': api_key,
        'strategy': strategy,
        'category': 'performance'
    }
    
    try:
        response = requests.get(endpoint, params=params)
        print(f"Status Code: {response.status_code}")
        if response.status_code == 200:
            data = response.json()
            score = data.get('lighthouseResult', {}).get('categories', {}).get('performance', {}).get('score')
            print(f"Performance Score: {score * 100 if score else 'N/A'}")
            print("Successfully retrieved data!")
        else:
            print(f"Error Source: {response.text}")
    except Exception as e:
        print(f"Exception: {e}")

if __name__ == "__main__":
    test_psi_api()
