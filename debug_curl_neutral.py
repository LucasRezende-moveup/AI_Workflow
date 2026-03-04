from curl_cffi import requests
from bs4 import BeautifulSoup
import urllib.parse
import re
import time
import random

def test_neutral_keyword(query="how to make bread"):
    domain = "google.com.br"
    encoded_query = urllib.parse.quote(query)
    url = f"https://www.{domain}/search?q={encoded_query}&num=10&gbv=1&gl=br&hl=pt-BR"
    
    session = requests.Session()
    headers = {
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
        "DNT": "1",
        "Upgrade-Insecure-Requests": "1",
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "none",
        "Sec-Fetch-User": "?1",
    }
    
    print(f"TESTING_CURL_NEUTRAL: {query}")
    try:
        response = session.get(url, headers=headers, impersonate="chrome120", timeout=15)
        print(f"Status: {response.status_code}")
        print(f"Size: {len(response.text)}")
        has_results = any(sig in response.text for sig in ["tF2Cxc", "ZIN7h", "class=\"g\"", "id=\"search\""])
        print(f"Results Found: {has_results}")
        
        if not has_results:
             with open("debug_curl_neutral.html", "w", encoding="utf-8") as f:
                 f.write(response.text)
             print("Saved debug_curl_neutral.html")
            
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    test_neutral_keyword()
