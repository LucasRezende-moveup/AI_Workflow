import requests
import os
from dotenv import load_dotenv

load_dotenv()

def debug_psi_500():
    api_key = os.getenv("PAGESPEED_API_KEY") or os.getenv("GOOGLE_API_KEY")
    url = "https://www.netflu.com.br/apostas/codigo-promocional-betano/"
    strategy = "mobile"
    endpoint = "https://www.googleapis.com/pagespeedonline/v5/runPagespeed"
    
    print(f"Debugging PSI API for {url} ({strategy})...")
    
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
            print("Successfully retrieved data!")
        else:
            print(f"Error Response: {response.text}")
    except Exception as e:
        print(f"Exception: {e}")

if __name__ == "__main__":
    debug_psi_500()
