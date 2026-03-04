from curl_cffi import requests
from bs4 import BeautifulSoup
import urllib.parse
import re
import time
import random

def test_challenge(query="codigo promocional novibet", gl="br", hl="pt-BR"):
    domain = "google.com.br"
    session = requests.Session()
    
    headers = {
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": f"{hl},en;q=0.9",
        "Accept-Encoding": "gzip, deflate",
        "DNT": "1",
        "Connection": "keep-alive",
        "Upgrade-Insecure-Requests": "1",
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "none",
        "Sec-Fetch-User": "?1",
    }
    
    encoded_query = urllib.parse.quote(query)
    url = f"https://www.{domain}/search?q={encoded_query}&num=10&gbv=1&gl={gl}&hl={hl}"
    
    print(f"--- Step 0: Initial Request ---")
    print(f"URL: {url}")
    # Using curl_cffi for browser impersonation
    response = session.get(url, headers=headers, impersonate="chrome120", timeout=15)
    print(f"Status: {response.status_code}")
    print(f"Initial Length: {len(response.text)}")
    
    for i in range(1, 5):
        if "tF2Cxc" in response.text or "ZIN7h" in response.text or "class=\"g\"" in response.text:
             print(f"--- SUCCESS at Step {i-1} ---")
             break

        if "clique" in response.text.lower() or "click here" in response.text.lower() or 'http-equiv="refresh"' in response.text.lower():
            print(f"--- Step {i}: Challenge Detected ---")
            soup = BeautifulSoup(response.text, "html.parser")
            challenge_link = None
            
            # 1. Look for search? links with tokens (PRIORITY: These bypass the JS trap)
            for a in soup.find_all("a", href=True):
                href = a["href"]
                if "search?" in href and "sei=" in href:
                    challenge_link = href
                    print(f"Found Search Challenge Link: {href}")
                    break
            
            # 2. Fallback to Meta refresh
            if not challenge_link:
                refresh_meta = soup.select_one('meta[http-equiv="refresh"]')
                if refresh_meta:
                    content = refresh_meta.get("content", "")
                    print(f"Meta Refresh Content: {content}")
                    if "url=" in content.lower():
                        url_part = re.search(r'url=(.+)$', content, re.IGNORECASE)
                        if url_part:
                            challenge_link = url_part.group(1).strip().strip("'").strip('"')
            
            if challenge_link:
                if challenge_link.startswith("/"):
                    challenge_link = f"https://www.{domain}{challenge_link}"
                
                print(f"Following Challenge Link: {challenge_link}")
                
                time.sleep(random.uniform(1.5, 2.5))
                
                redirect_headers = headers.copy()
                redirect_headers["Referer"] = response.url
                redirect_headers["Sec-Fetch-Site"] = "same-origin"
                
                response = session.get(challenge_link, headers=redirect_headers, impersonate="chrome120", timeout=15)
                print(f"Status: {response.status_code}")
                print(f"New Length: {len(response.text)}")
            else:
                print("No challenge link found.")
                break
        else:
            print("No challenge detected. Exiting loop.")
            break

    with open("challenge_final.html", "w", encoding="utf-8") as f:
        f.write(response.text)
    
    print(f"Final Size: {len(response.text)}")
    if "tF2Cxc" in response.text or "ZIN7h" in response.text or "class=\"g\"" in response.text:
        print("FINAL RESULT: SUCCESS")
    else:
        print("FINAL RESULT: FAILED (Still blocked or missing selectors)")

if __name__ == "__main__":
    test_challenge()
