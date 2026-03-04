# VERSION: 2026-02-18-MOBILE-EMU-V1
from curl_cffi import requests as crequests
import requests
from bs4 import BeautifulSoup
import urllib.parse
import json
import random
import re
import time
import os
import base64

def clean_google_url(url):
    if url.startswith("/url?"):
        parsed = urllib.parse.urlparse(url)
        q = urllib.parse.parse_qs(parsed.query).get("q")
        if q: return q[0]
    return url

def generate_uule(location_name):
    """
    Generates a Google UULE parameter for a given location name.
    """
    if not location_name:
        return ""
    
    secret_chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_"
    length = len(location_name)
    if length >= len(secret_chars):
        secret_char = secret_chars[-1]
    else:
        secret_char = secret_chars[length]
    
    encoded_loc = base64.b64encode(location_name.encode()).decode()
    return f"w+CAIQICI{secret_char}{encoded_loc}"

GEOLOCATIONS = [
    {"name": "Global (No Geolocation)", "gl": "", "hl": "en", "domain": "google.com", "uule_name": "", "cr": ""},
    {"name": "Brazil (General)", "gl": "br", "hl": "pt-BR", "domain": "google.com.br", "uule_name": "Brazil", "cr": "countryBR"},
    {"name": "Brazil (São Paulo)", "gl": "br", "hl": "pt-BR", "domain": "google.com.br", "uule_name": "Sao Paulo,State of Sao Paulo,Brazil", "cr": "countryBR"},
    {"name": "Brazil (Rio de Janeiro)", "gl": "br", "hl": "pt-BR", "domain": "google.com.br", "uule_name": "Rio de Janeiro,State of Rio de Janeiro,Brazil", "cr": "countryBR"},
    {"name": "United States", "gl": "us", "hl": "en", "domain": "google.com", "uule_name": "United States", "cr": "countryUS"},
]

def fetch_serp_results(query, location_name="Global (No Geolocation)", hl="en"):
    """
    Hyper-accurate Google fetcher with Googlebot Mobile emulation and UULE geolocation.
    """
    sleep_min = float(os.getenv("SCRAPER_SLEEP_MIN", 3))
    sleep_max = float(os.getenv("SCRAPER_SLEEP_MAX", 7))
    
    proxy = os.getenv("PROXY_URL")
    proxies = {"http": proxy, "https": proxy} if proxy else None
    
    loc_data = next((l for l in GEOLOCATIONS if l["name"] == location_name), GEOLOCATIONS[0])
    
    domain = loc_data["domain"]
    gl = loc_data["gl"]
    uule = generate_uule(loc_data.get("uule_name", ""))
    cr = loc_data.get("cr", "")
    
    # Priority: Googlebot Mobile User-Agents
    attempts = [
        # Googlebot Smartphone (Android)
        {"ua": "Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)", "imp": "chrome120"},
        # Googlebot Smartphone (iPhone-like)
        {"ua": "Mozilla/5.0 (iPhone; CPU iPhone OS 14_7_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.1.2 Mobile/15E148 Safari/604.1 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)", "imp": "safari_ios_16_0"},
        # Regular Chrome Mobile as fallback
        {"ua": "Mozilla/5.0 (Linux; Android 13; SM-G998B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36", "imp": "chrome120"}
    ]
    
    encoded_query = urllib.parse.quote(query)
    
    for attempt in attempts:
        session = crequests.Session()
        if proxies: session.proxies = proxies
             
        ua = attempt["ua"]
        imp = attempt["imp"]
        
        # Hyper-accurate mobile headers
        extra_params = "&gbv=1" # Use lightweight version for lower footprint
        if uule:
             extra_params += f"&uule={uule}"
        if cr:
             extra_params += f"&cr={cr}"
        
        headers = {
            "User-Agent": ua,
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
            "Accept-Language": f"{hl},en;q=0.9",
            "Sec-Fetch-Site": "none",
            "Sec-Fetch-Mode": "navigate",
            "Sec-Fetch-User": "?1",
            "Sec-Fetch-Dest": "document",
            "Upgrade-Insecure-Requests": "1",
            "X-Asbd-Id": "198387", # Common Google Mobile header
        }
        
        try:
            # Regional warming
            warming_url = f"https://www.{domain}/"
            session.get(warming_url, headers=headers, impersonate=imp, timeout=10)
            time.sleep(random.uniform(sleep_min/2, sleep_min))
            
            # Search
            url = f"https://www.{domain}/search?q={encoded_query}&num=10{extra_params}"
            if gl: url += f"&gl={gl}"
            if hl: url += f"&hl={hl}"
            
            response = session.get(url, headers=headers, impersonate=imp, timeout=15)
            
            # Challenge Handler
            for i in range(3):
                html = response.text
                if "Ative o JavaScript" in html or "JS_W_01" in html: break 
                
                links = re.findall(r'href=["\'](/search\?[^"\']*(?:sei=|emsg=)[^"\']*)["\']', html)
                if not links:
                     links = re.findall(r'href=["\'](/httpservice/[^"\']*(?:sei=|emsg=)[^"\']*)["\']', html)
                
                challenge_link = links[0].replace("&amp;", "&") if links else None
                if challenge_link:
                    if challenge_link.startswith("/"): challenge_link = f"https://www.{domain}{challenge_link}"
                    time.sleep(random.uniform(sleep_min, sleep_max))
                    headers["Referer"] = response.url
                    response = session.get(challenge_link, headers=headers, impersonate=imp, timeout=15)
                    if response.status_code == 200 and ("results" in response.text.lower() or "resultado" in response.text.lower()):
                         break
                else: break
            
            if response.status_code == 200 and "Ative o JavaScript" not in response.text:
                results_data = parse_google_results(response.text)
                if isinstance(results_data, dict) and results_data.get("organic"):
                    return results_data
        except:
            continue
            
    return {"error": "Google is currently blocking this IP. Try waiting 10 minutes or use a Proxy."}

def parse_google_results(html):
    soup = BeautifulSoup(html, "html.parser")
    results = {"organic": [], "related_keywords": []}
    
    # Extract Organic Results (Mobile structure can vary slightly)
    # Common mobile containers: .xpd, .mnr-c, .VwiC3b (snippet)
    containers = soup.select(".g") or soup.select(".tF2Cxc") or soup.select(".xpd") or soup.select(".mnr-c")
    
    for g in containers:
        try:
            if g.find(text=re.compile("Patrocinado|Sponsored|Anúncio")): continue
            
            anchor = g.select_one("a")
            if not anchor: continue
            
            link = clean_google_url(anchor["href"])
            if not link.startswith("http") or "google.com" in link: continue
            
            title_tag = g.select_one("h3") or anchor.select_one("h3") or g.select_one(".C809Y")
            if not title_tag: continue
            
            title = title_tag.get_text().strip()
            # On mobile, snippets are often in .VwiC3b or .MUwY90
            snippet_tag = g.select_one(".VwiC3b") or g.select_one(".MUwY90") or g.select_one(".st")
            snippet = snippet_tag.get_text().strip() if snippet_tag else "N/A"
            
            results["organic"].append({
                "title": title,
                "link": link,
                "snippet": snippet
            })
            if len(results["organic"]) >= 3: break
        except: continue
    
    # Fallback to regex if BS4 fails on condensed mobile HTML
    if not results["organic"]:
        items = re.findall(r'<h3[^>]*>(.*?)</h3>', html)
        anchors = re.findall(r'href=["\'](http[^"\']+)["\']', html)
        links = [a for a in anchors if "google.com" not in a and "gstatic.com" not in a]
        for i in range(min(len(items), len(links), 3)):
            results["organic"].append({
                "title": BeautifulSoup(items[i], "html.parser").get_text(),
                "link": links[i],
                "snippet": "N/A"
            })

    # Related Keywords
    related_blocks = soup.select(".y6778b") or soup.select(".nVcaY") or soup.select(".BNeawe")
    for block in related_blocks:
        text = block.get_text().strip()
        if text and len(text) < 50 and text not in [r["title"] for r in results["organic"]]:
            if text not in results["related_keywords"] and text.lower() not in ["mais", "imagem", "vídeo"]:
                results["related_keywords"].append(text)
    
    if not results["related_keywords"]:
        related_matches = re.findall(r'href=["\']/search\?q=[^"\']*["\'][^>]*>(.*?)</a>', html)
        for match in related_matches:
            keyword = BeautifulSoup(match, "html.parser").get_text().strip()
            if keyword and 3 < len(keyword) < 60:
                 if keyword not in results["related_keywords"] and keyword.lower() not in ["mais", "imagem", "vídeo"]:
                      results["related_keywords"].append(keyword)

    return results

def get_location_by_name(name):
    for loc in GEOLOCATIONS:
        if name == loc["name"]: return loc
    return GEOLOCATIONS[0]
