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
    # Global
    {"name": "Global (No Geolocation)", "gl": "",   "hl": "en",    "domain": "google.com",    "uule_name": "",                                                  "cr": "",          "ddg_kl": "wt-wt"},
    # Brazil
    {"name": "Brazil (General)",         "gl": "br", "hl": "pt-BR", "domain": "google.com.br", "uule_name": "Brazil",                                            "cr": "countryBR", "ddg_kl": "br-pt"},
    {"name": "Brazil (São Paulo)",       "gl": "br", "hl": "pt-BR", "domain": "google.com.br", "uule_name": "Sao Paulo,State of Sao Paulo,Brazil",               "cr": "countryBR", "ddg_kl": "br-pt"},
    {"name": "Brazil (Rio de Janeiro)",  "gl": "br", "hl": "pt-BR", "domain": "google.com.br", "uule_name": "Rio de Janeiro,State of Rio de Janeiro,Brazil",     "cr": "countryBR", "ddg_kl": "br-pt"},
    # Portuguese-speaking
    {"name": "Portugal",                 "gl": "pt", "hl": "pt-PT", "domain": "google.pt",     "uule_name": "Portugal",                                          "cr": "countryPT", "ddg_kl": "pt-pt"},
    # Spanish-speaking
    {"name": "Spain",                    "gl": "es", "hl": "es",    "domain": "google.es",     "uule_name": "Spain",                                             "cr": "countryES", "ddg_kl": "es-es"},
    {"name": "Mexico",                   "gl": "mx", "hl": "es",    "domain": "google.com.mx", "uule_name": "Mexico",                                            "cr": "countryMX", "ddg_kl": "mx-es"},
    {"name": "Argentina",                "gl": "ar", "hl": "es",    "domain": "google.com.ar", "uule_name": "Argentina",                                         "cr": "countryAR", "ddg_kl": "ar-es"},
    {"name": "Colombia",                 "gl": "co", "hl": "es",    "domain": "google.com.co", "uule_name": "Colombia",                                          "cr": "countryCO", "ddg_kl": "co-es"},
    {"name": "Chile",                    "gl": "cl", "hl": "es",    "domain": "google.cl",     "uule_name": "Chile",                                             "cr": "countryCL", "ddg_kl": "cl-es"},
    {"name": "Peru",                     "gl": "pe", "hl": "es",    "domain": "google.com.pe", "uule_name": "Peru",                                              "cr": "countryPE", "ddg_kl": "pe-es"},
    # English-speaking
    {"name": "United States",            "gl": "us", "hl": "en",    "domain": "google.com",    "uule_name": "United States",                                     "cr": "countryUS", "ddg_kl": "us-en"},
    {"name": "United Kingdom",           "gl": "gb", "hl": "en",    "domain": "google.co.uk",  "uule_name": "United Kingdom",                                    "cr": "countryGB", "ddg_kl": "uk-en"},
    {"name": "Canada",                   "gl": "ca", "hl": "en",    "domain": "google.ca",     "uule_name": "Canada",                                            "cr": "countryCA", "ddg_kl": "ca-en"},
    {"name": "Australia",                "gl": "au", "hl": "en",    "domain": "google.com.au", "uule_name": "Australia",                                         "cr": "countryAU", "ddg_kl": "au-en"},
    {"name": "India",                    "gl": "in", "hl": "en",    "domain": "google.co.in",  "uule_name": "India",                                             "cr": "countryIN", "ddg_kl": "in-en"},
    # European
    {"name": "Germany",                  "gl": "de", "hl": "de",    "domain": "google.de",     "uule_name": "Germany",                                           "cr": "countryDE", "ddg_kl": "de-de"},
    {"name": "France",                   "gl": "fr", "hl": "fr",    "domain": "google.fr",     "uule_name": "France",                                            "cr": "countryFR", "ddg_kl": "fr-fr"},
    {"name": "Italy",                    "gl": "it", "hl": "it",    "domain": "google.it",     "uule_name": "Italy",                                             "cr": "countryIT", "ddg_kl": "it-it"},
    {"name": "Netherlands",              "gl": "nl", "hl": "nl",    "domain": "google.nl",     "uule_name": "Netherlands",                                       "cr": "countryNL", "ddg_kl": "nl-nl"},
]

def fetch_serp_duckduckgo(query, location_name="Global (No Geolocation)"):
    """
    DuckDuckGo HTML endpoint — reliable from cloud IPs where Google is blocked.
    Returns the same dict shape as fetch_serp_results: {organic: [...], related_keywords: [...]}
    """
    loc_data = next((l for l in GEOLOCATIONS if l["name"] == location_name), GEOLOCATIONS[0])
    hl = loc_data.get("hl", "en")
    kl = loc_data.get("ddg_kl", "wt-wt")

    encoded_query = urllib.parse.quote_plus(query)
    url = f"https://html.duckduckgo.com/html/?q={encoded_query}&kl={kl}"

    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Accept-Language": f"{hl},en;q=0.8",
        "Referer": "https://duckduckgo.com/",
    }

    try:
        session = crequests.Session()
        resp = session.get(url, headers=headers, impersonate="chrome120", timeout=15)
        if resp.status_code != 200:
            return {"organic": [], "related_keywords": []}

        soup = BeautifulSoup(resp.text, "html.parser")
        results = {"organic": [], "related_keywords": []}

        for div in soup.select(".result:not(.result--ad)"):
            try:
                title_tag = div.select_one(".result__title a")
                if not title_tag:
                    continue
                link = title_tag.get("href", "")
                # DDG wraps links in a redirect — extract the real URL
                if "duckduckgo.com" in link:
                    parsed = urllib.parse.urlparse(link)
                    uddg = urllib.parse.parse_qs(parsed.query).get("uddg")
                    link = uddg[0] if uddg else link
                if not link.startswith("http"):
                    continue
                title = title_tag.get_text(strip=True)
                snippet_tag = div.select_one(".result__snippet")
                snippet = snippet_tag.get_text(strip=True) if snippet_tag else "N/A"
                results["organic"].append({"title": title, "link": link, "snippet": snippet})
                if len(results["organic"]) >= 5:
                    break
            except:
                continue

        # Related keywords from DDG "searches related to" block
        for tag in soup.select(".result--related .result__a"):
            kw = tag.get_text(strip=True)
            if kw and len(kw) < 60 and kw not in results["related_keywords"]:
                results["related_keywords"].append(kw)

        return results
    except Exception as e:
        return {"organic": [], "related_keywords": [], "error": str(e)}


def fetch_serp_via_serpapi(query, location_name="Global (No Geolocation)"):
    """
    Fetches real Google SERP via SerpAPI. Returns the standard shape:
    {organic: [{title, link, snippet}], related_keywords: [...], paa: [{question, answer}]}
    """
    api_key = os.getenv("SERPAPI_KEY")
    if not api_key:
        return {"error": "SERPAPI_KEY not configured"}

    loc_data = next((l for l in GEOLOCATIONS if l["name"] == location_name), GEOLOCATIONS[0])

    params = {
        "q": query,
        "num": 10,
        "api_key": api_key,
        "engine": "google",
    }
    if loc_data["gl"]:
        params["gl"] = loc_data["gl"]
    if loc_data.get("hl"):
        params["hl"] = loc_data["hl"]
    if loc_data["domain"] != "google.com":
        params["google_domain"] = loc_data["domain"]

    try:
        resp = requests.get("https://serpapi.com/search", params=params, timeout=30)
        if not resp.ok:
            return {"error": f"SerpAPI error {resp.status_code}: {resp.text[:200]}"}

        data = resp.json()

        organic = [
            {"title": r.get("title", ""), "link": r.get("link", ""), "snippet": r.get("snippet", "N/A")}
            for r in data.get("organic_results", [])[:10]
        ]
        related_keywords = [r["query"] for r in data.get("related_searches", [])[:8] if r.get("query")]
        paa = [
            {"question": p.get("question", ""), "answer": p.get("snippet", p.get("answer", ""))}
            for p in data.get("people_also_ask", [])[:5]
        ]

        return {"organic": organic, "related_keywords": related_keywords, "paa": paa}
    except Exception as e:
        return {"error": f"SerpAPI request failed: {e}"}


def fetch_serp_results(query, location_name="Global (No Geolocation)", hl="en", provider="auto"):
    """
    SERP fetcher. Priority: SerpAPI (real Google) → DuckDuckGo → Google scraper.
    Fallback chain always runs in full — SerpAPI failure never blocks DDG.
    """
    # SerpAPI — real Google data, used whenever the key is configured
    serpapi_result = fetch_serp_via_serpapi(query, location_name)
    if serpapi_result.get("organic"):
        return serpapi_result
    serpapi_error = serpapi_result.get("error", "")

    # DuckDuckGo — reliable from cloud IPs, used as fallback when SerpAPI fails
    ddg = fetch_serp_duckduckgo(query, location_name)
    if ddg.get("organic"):
        return ddg

    # Google path — Googlebot Mobile emulation (last resort)
    sleep_min = float(os.getenv("SCRAPER_SLEEP_MIN", 3))
    sleep_max = float(os.getenv("SCRAPER_SLEEP_MAX", 7))
    
    proxy = os.getenv("PROXY_URL")
    proxies = {"http": proxy, "https": proxy} if proxy else None
    
    loc_data = next((l for l in GEOLOCATIONS if l["name"] == location_name), GEOLOCATIONS[0])

    domain = loc_data["domain"]
    gl = loc_data["gl"]
    hl = loc_data.get("hl", "en")  # use location's language, not the default parameter
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
            
    detail = f" (SerpAPI: {serpapi_error})" if serpapi_error and "not configured" not in serpapi_error else ""
    return {"error": f"All SERP sources failed{detail}. Google server IP may be blocked — try again in a few minutes."}

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
