from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import pandas as pd
from typing import List, Optional
import os

# Credential bootstrap: reconstruct files from env vars on read-only filesystems (e.g. Vercel)
def _bootstrap_credentials():
    import base64
    token_b64 = os.getenv("TOKEN_PICKLE_B64")
    secret_json = os.getenv("CLIENT_SECRET_JSON")
    if token_b64:
        try:
            with open("/tmp/token.pickle", "wb") as _f:
                _f.write(base64.b64decode(token_b64))
        except Exception:
            pass
    if secret_json:
        try:
            with open("/tmp/client_secret.json", "w") as _f:
                _f.write(secret_json)
        except Exception:
            pass

try:
    _bootstrap_credentials()
except Exception:
    pass

# Log sites helpers (inlined to avoid streamlit dependency)
import json as _json_cfg
import re as _re_log

def load_sites():
    for _path in ("log_sites.json", "/tmp/log_sites.json"):
        if os.path.exists(_path):
            try:
                with open(_path) as _f:
                    return _json_cfg.load(_f)
            except Exception:
                pass
    return {}

def save_sites(sites: dict):
    _path = "log_sites.json"
    try:
        with open(_path, "w") as _f:
            _json_cfg.dump(sites, _f, indent=4)
    except OSError:
        with open("/tmp/log_sites.json", "w") as _f:
            _json_cfg.dump(sites, _f, indent=4)

def fetch_log_files(url: str, username: str, password: str):
    import requests as _req
    _hdrs = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}
    try:
        if not url.endswith("/"):
            url += "/"
        _resp = _req.get(url, auth=(username, password), headers=_hdrs, timeout=10)
        _resp.raise_for_status()
        _files = list(set(_re_log.findall(r'href="([^"]+\.json\.gz)"', _resp.text)))
        return sorted(_files, reverse=True)
    except Exception:
        return []

# Import GSC and Analysis logic
from gsc_client import GSCClient
from analysis import generate_insights, ask_agent

# Import Screaming Frog logic
from screaming_frog import parse_sf_file

app = FastAPI(title="Moveup Media SaaS API")

# Setup CORS for the Vite frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

class SiteConfig(BaseModel):
    name: str
    url: str
    username: str
    password: str

class SiteDelete(BaseModel):
    name: str

class LogRequest(BaseModel):
    site_name: str

class AnalyzeRequest(BaseModel):
    site_name: str
    files: List[str]

@app.get("/api/sites")
def get_sites():
    return load_sites()

@app.post("/api/sites")
def add_site(site: SiteConfig):
    sites = load_sites()
    sites[site.name] = {
        "url": site.url,
        "username": site.username,
        "password": site.password
    }
    save_sites(sites)
    return {"status": "success", "sites": sites}

@app.delete("/api/sites/{site_name}")
def delete_site(site_name: str):
    sites = load_sites()
    if site_name in sites:
        del sites[site_name]
        save_sites(sites)
        return {"status": "success"}
    raise HTTPException(status_code=404, detail="Site not found")

@app.post("/api/logs/files")
def get_log_files(req: LogRequest):
    sites = load_sites()
    if req.site_name not in sites:
        raise HTTPException(status_code=404, detail="Site not found")
        
    site = sites[req.site_name]
    files = fetch_log_files(site["url"], site["username"], site["password"])
    return {"files": files}

@app.post("/api/logs/analyze")
def analyze_logs(req: AnalyzeRequest):
    import gzip, json as _json
    from collections import Counter

    sites = load_sites()
    if req.site_name not in sites:
        raise HTTPException(status_code=404, detail="Site not found")

    site   = sites[req.site_name]
    base   = site["url"].rstrip("/") + "/"
    auth   = (site["username"], site["password"])
    hdrs   = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}

    BOT_NAMES   = ["Googlebot","bingbot","AhrefsBot","SemrushBot","YandexBot",
                   "dotbot","mj12bot","PetalBot","DataForSeoBot"]
    MAX_SAMPLE  = 5000
    MAX_IPS     = 500_000

    total_hits  = 0
    status_cnt  = Counter()
    path_cnt    = Counter()
    ip_set      = set()
    bot_hits    = Counter()
    time_cnt    = Counter()
    sample_rows = []

    # Per-bot aggregations (status, paths, time) computed over full dataset
    bot_status  = {b: Counter() for b in BOT_NAMES}
    bot_paths   = {b: Counter() for b in BOT_NAMES}
    bot_time    = {b: Counter() for b in BOT_NAMES}
    any_bot_status = Counter()
    any_bot_paths  = Counter()
    any_bot_time   = Counter()

    import requests as _req_lib
    for file_name in req.files:
        try:
            resp = _req_lib.get(base + file_name, auth=auth, headers=hdrs, timeout=60)
            if resp.status_code != 200:
                continue
            with gzip.GzipFile(fileobj=io.BytesIO(resp.content)) as gz:
                for raw in gz:
                    line = raw.decode("utf-8", errors="replace").strip()
                    if "@cee: " not in line:
                        continue
                    _, _, payload_str = line.partition("@cee: ")
                    try:
                        entry = _json.loads(payload_str)
                    except _json.JSONDecodeError:
                        continue

                    total_hits += 1
                    status   = str(entry.get("status", "Unknown"))
                    path     = entry.get("request", "/")
                    ip       = entry.get("ip", "")
                    ua_lower = (entry.get("user_agent", "") or "").lower()

                    status_cnt[status] += 1
                    path_cnt[path]     += 1
                    time_cnt[file_name] += 1
                    if len(ip_set) < MAX_IPS:
                        ip_set.add(ip)

                    is_any_bot = False
                    for bot in BOT_NAMES:
                        if bot.lower() in ua_lower:
                            bot_hits[bot]        += 1
                            bot_status[bot][status] += 1
                            bot_paths[bot][path]    += 1
                            bot_time[bot][file_name] += 1
                            is_any_bot = True
                    if is_any_bot:
                        any_bot_status[status]   += 1
                        any_bot_paths[path]      += 1
                        any_bot_time[file_name]  += 1

                    if len(sample_rows) < MAX_SAMPLE:
                        entry["_source_file"] = file_name
                        entry["status"]        = status
                        sample_rows.append(entry)
        except Exception:
            continue

    if total_hits == 0:
        return {"total_hits": 0, "sample_rows": []}

    def _build_agg(s_cnt, p_cnt, t_cnt):
        return {
            "status_data":  [{"name": k, "value": v} for k, v in s_cnt.most_common()],
            "top_paths":    [{"path": p[:60], "hits": c} for p, c in p_cnt.most_common(10)],
            "time_series":  [{"date": k.replace(".json.gz", ""), "hits": v} for k, v in sorted(t_cnt.items())],
        }

    bot_aggregations = {}
    for b in BOT_NAMES:
        if bot_hits[b] > 0:
            bot_aggregations[b] = _build_agg(bot_status[b], bot_paths[b], bot_time[b])
    if sum(any_bot_status.values()) > 0:
        bot_aggregations["Any Bot"] = _build_agg(any_bot_status, any_bot_paths, any_bot_time)

    googlebot_hits = bot_hits.get("Googlebot", 0)
    return {
        "total_hits":        total_hits,
        "errors_404":        status_cnt.get("404", 0),
        "errors_5xx":        sum(v for k, v in status_cnt.items() if k.startswith("5")),
        "unique_ips":        len(ip_set),
        "googlebot_hits":    googlebot_hits,
        "googlebot_rate":    round(googlebot_hits / total_hits * 100, 1) if total_hits else 0,
        "bot_count":         len(bot_hits),
        "status_data":       [{"name": k, "value": v} for k, v in status_cnt.most_common()],
        "top_paths":         [{"path": p[:60], "hits": c} for p, c in path_cnt.most_common(10)],
        "time_series":       [{"date": k.replace(".json.gz", ""), "hits": v} for k, v in sorted(time_cnt.items())],
        "bot_breakdown":     [{"bot": k, "hits": v} for k, v in bot_hits.most_common()],
        "bot_aggregations":  bot_aggregations,
        "sample_rows":       sample_rows,
        "sample_size":       MAX_SAMPLE,
    }


class ExportRequest(BaseModel):
    site_name: str
    files: List[str]
    status_filter: Optional[str] = None
    bot_filter: Optional[str] = "All"
    path_filter: Optional[str] = None
    ip_filter: Optional[str] = None
    custom_ua: Optional[str] = None

@app.post("/api/logs/export")
def export_logs(req: ExportRequest):
    import gzip, json as _json, csv, re as _re
    from fastapi.responses import StreamingResponse

    sites = load_sites()
    if req.site_name not in sites:
        raise HTTPException(status_code=404, detail="Site not found")

    site = sites[req.site_name]
    base = site["url"].rstrip("/") + "/"
    auth = (site["username"], site["password"])
    hdrs = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}

    CSV_FIELDS = ["_source_file", "ip", "status", "method", "request", "user_agent", "time", "size", "referer"]

    bf = (req.bot_filter or "All")

    def matches(entry):
        status   = str(entry.get("status", ""))
        path     = entry.get("request", "") or ""
        ip       = entry.get("ip", "") or ""
        ua_lower = (entry.get("user_agent", "") or "").lower()
        if req.status_filter and status != req.status_filter:
            return False
        if req.path_filter and req.path_filter.lower() not in path.lower():
            return False
        if req.ip_filter and req.ip_filter not in ip:
            return False
        if req.custom_ua and req.custom_ua.lower() not in ua_lower:
            return False
        if bf != "All":
            if bf == "Any Bot":
                if not _re.search(r"bot|spider|crawler", ua_lower):
                    return False
            else:
                if bf.lower() not in ua_lower:
                    return False
        return True

    def generate():
        import requests as _req_lib
        buf = io.StringIO()
        writer = csv.DictWriter(buf, fieldnames=CSV_FIELDS, extrasaction="ignore")
        writer.writeheader()
        yield buf.getvalue()

        for file_name in req.files:
            try:
                resp = _req_lib.get(base + file_name, auth=auth, headers=hdrs, timeout=60)
                if resp.status_code != 200:
                    continue
                with gzip.GzipFile(fileobj=io.BytesIO(resp.content)) as gz:
                    for raw in gz:
                        line = raw.decode("utf-8", errors="replace").strip()
                        if "@cee: " not in line:
                            continue
                        _, _, payload_str = line.partition("@cee: ")
                        try:
                            entry = _json.loads(payload_str)
                        except _json.JSONDecodeError:
                            continue
                        entry["_source_file"] = file_name
                        entry["status"]       = str(entry.get("status", ""))
                        if not matches(entry):
                            continue
                        buf.truncate(0)
                        buf.seek(0)
                        writer.writerow(entry)
                        yield buf.getvalue()
            except Exception:
                continue

    fname = f"logs_{req.site_name.replace(' ', '_')}.csv"
    return StreamingResponse(
        generate(),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{fname}"'},
    )


# --- GSC Endpoints ---

# Global GSC Client (Singleton)
gsc_client_instance = None

def get_gsc_client():
    global gsc_client_instance
    if not gsc_client_instance:
        secret_path = next(
            (p for p in ["/tmp/client_secret.json", "client_secret.json"] if os.path.exists(p)),
            None,
        )
        token_path = next(
            (p for p in ["/tmp/token.pickle", "token.pickle"] if os.path.exists(p)),
            "/tmp/token.pickle",
        )
        if not secret_path:
            raise HTTPException(
                status_code=400,
                detail="client_secret.json missing. Set CLIENT_SECRET_JSON env var.",
            )
        try:
            gsc_client_instance = GSCClient(secret_path, token_path)
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))
    return gsc_client_instance

class GscAnalyticsRequest(BaseModel):
    property_url: str
    start_date: str
    end_date: str

class GscInsightsRequest(BaseModel):
    data_rows: List[dict]

class GscChatRequest(BaseModel):
    prompt: str
    data_rows: List[dict]

@app.get("/api/gsc/properties")
def get_gsc_properties():
    client = get_gsc_client()
    try:
        props = client.list_properties()
        if props:
            return {"properties": sorted([p['siteUrl'] for p in props])}
        return {"properties": []}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/gsc/analytics")
def get_gsc_analytics(req: GscAnalyticsRequest):
    client = get_gsc_client()
    try:
        data = client.get_search_analytics(
            req.property_url,
            start_date=req.start_date,
            end_date=req.end_date
        )
        return {"data": data or []}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/gsc/insights")
def get_gsc_insights(req: GscInsightsRequest):
    try:
        insights = generate_insights(req.data_rows)
        return {"insights": insights}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/gsc/chat")
def get_gsc_chat(req: GscChatRequest):
    try:
        response = ask_agent(req.prompt, req.data_rows)
        return {"response": response}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# --- Screaming Frog Endpoints ---

class SfFileWrapper:
    def __init__(self, filename, content):
        self.name = filename
        self.content = content
    def getvalue(self):
        return self.content

import io

@app.post("/api/sf/analyze")
async def analyze_sf(file: UploadFile = File(...)):
    content = await file.read()
    filename = file.filename
    df = None
    debug = {}

    if filename.endswith((".seospider", ".dbseospider")):
        wrapper = SfFileWrapper(filename, content)
        df, debug = parse_sf_file(wrapper)
        if df is None:
            raise HTTPException(status_code=400, detail=f"Could not parse file. Details: {debug}")
    elif filename.endswith(".csv"):
        df = pd.read_csv(io.BytesIO(content))
    elif filename.endswith(".xlsx"):
        df = pd.read_excel(io.BytesIO(content))
    else:
        raise HTTPException(status_code=400, detail="Unsupported file format.")

    if df is not None:
        # Normalize columns
        rename_map = {
            'address': 'Address', 'url': 'Address', 'uri': 'Address',
            'status_code': 'Status Code', 'status': 'Status Code',
            'title_1': 'Title 1', 'title': 'Title 1', 'page_title': 'Title 1',
            'meta_description_1': 'Meta Description 1', 'meta_description': 'Meta Description 1',
            'h1_1': 'H1-1', 'h1': 'H1-1', 'content': 'Content Type', 'content_type': 'Content Type'
        }
        
        normalized_columns = {}
        for col in df.columns:
            lower_key = col.lower().replace(" ", "_").replace("-", "_")
            if lower_key in rename_map:
                normalized_columns[col] = rename_map[lower_key]
        df = df.rename(columns=normalized_columns)

        def get_col(df, options):
            for opt in options:
                if opt in df.columns: return opt
            return None

        addr_col = get_col(df, ['Address', 'URL'])
        status_col = get_col(df, ['Status Code', 'Status'])
        title_col = get_col(df, ['Title 1', 'Title'])
        desc_col = get_col(df, ['Meta Description 1', 'Meta Description'])

        if status_col:
            df[status_col] = pd.to_numeric(df[status_col], errors='coerce')
            status_200 = len(df[df[status_col] == 200])
        else:
            status_200 = 0
            
        missing_titles = len(df[df[title_col].isna()]) if title_col else 0
        missing_desc = len(df[df[desc_col].isna()]) if desc_col else 0
        total_urls = len(df)

        # Truncate for UI
        df = df.head(500)
        df = df.where(pd.notnull(df), None)

        return {
            "metrics": {
                "total_urls": total_urls,
                "status_200": status_200,
                "missing_titles": missing_titles,
                "missing_desc": missing_desc
            },
            "data": df.to_dict(orient="records"),
            "columns": list(df.columns),
            "cols_used": [addr_col, status_col, title_col, desc_col]
        }
    else:
        raise HTTPException(status_code=400, detail="Failed to load DataFrame.")

class SfInsightsRequest(BaseModel):
    summary_text: str
    sample_data: List[dict]

@app.post("/api/sf/insights")
def sf_insights(req: SfInsightsRequest):
    try:
        insights = generate_insights([{"summary": req.summary_text}] + req.sample_data)
        return {"insights": insights}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# --- E-E-A-T Analysis Endpoints ---
import requests as http_requests
from bs4 import BeautifulSoup
import google.generativeai as genai

def _get_flash_model():
    try:
        available_models = [m.name for m in genai.list_models() if 'generateContent' in m.supported_generation_methods]
        for target in ['models/gemini-1.5-flash', 'models/gemini-flash-latest', 'models/gemini-2.0-flash']:
            if target in available_models:
                return target
        flash_models = [m for m in available_models if 'flash' in m.lower()]
        return flash_models[0] if flash_models else 'models/gemini-1.5-flash'
    except:
        return 'models/gemini-1.5-flash'

def _fetch_page_text(url, auth=None):
    headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/91.0 Safari/537.36"}
    response = http_requests.get(url, headers=headers, timeout=15, auth=auth)
    response.raise_for_status()
    soup = BeautifulSoup(response.text, 'html.parser')
    for tag in soup(["script", "style", "nav", "footer", "header", "aside"]):
        tag.extract()
    return soup.get_text(separator=' ', strip=True)[:100000]

def _gemini_generate(prompt: str) -> str:
    model_name = _get_flash_model()
    model = genai.GenerativeModel(model_name)
    response = model.generate_content(prompt)
    return response.text

class EeatRequest(BaseModel):
    url: str
    auth_user: Optional[str] = None
    auth_pass: Optional[str] = None

@app.post("/api/eeat/analyze")
def eeat_analyze(req: EeatRequest):
    url = req.url
    if not url.startswith("http"):
        url = "https://" + url
    auth = (req.auth_user, req.auth_pass) if req.auth_user else None
    try:
        content = _fetch_page_text(url, auth=auth)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Could not fetch URL: {e}")
    
    prompt = f"""You are an SEO expert focused on Google's E-E-A-T (Experience, Expertise, Authoritativeness, Trustworthiness) guidelines.
Analyze the following content extracted from the URL: {url}

Evaluate the content strictly according to these 4 criteria and provide a detailed analysis:

1. Experience: Does the text convey real-world experience about the subject?
2. Expertise: Are the language and technical knowledge appropriate and deep?
3. Authoritativeness & Trustworthiness: Is there transparency in the evaluation (cited sources, author bio, etc.)?
4. Gaps: What is missing for this to be the definitive answer for this topic?

Format your response in Markdown, with clear, actionable suggestions for improvement.

Base page content:
{content}"""
    try:
        result = _gemini_generate(prompt)
        return {"analysis": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# --- Schema Audit Endpoints ---
import json as json_lib

class SchemaRequest(BaseModel):
    url: str
    auth_user: Optional[str] = None
    auth_pass: Optional[str] = None

@app.post("/api/schema/audit")
def schema_audit(req: SchemaRequest):
    url = req.url
    if not url.startswith("http"):
        url = "https://" + url
    auth = (req.auth_user, req.auth_pass) if req.auth_user else None
    headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36"}
    try:
        response = http_requests.get(url, headers=headers, timeout=15, auth=auth)
        response.raise_for_status()
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Could not fetch URL: {e}")

    soup = BeautifulSoup(response.text, 'html.parser')
    scripts = soup.find_all('script', type='application/ld+json')
    if not scripts:
        raise HTTPException(status_code=404, detail="No JSON-LD schema found on this page.")

    blocks = []
    all_schemas = []
    for script in scripts:
        try:
            data = json_lib.loads(script.string)
            all_schemas.append(data)
            types = []
            if isinstance(data, dict):
                if '@graph' in data:
                    for item in data['@graph']:
                        if '@type' in item:
                            t = item['@type']
                            types.extend(t if isinstance(t, list) else [t])
                elif '@type' in data:
                    t = data['@type']
                    types.extend(t if isinstance(t, list) else [t])
            elif isinstance(data, list):
                for item in data:
                    if isinstance(item, dict) and '@type' in item:
                        t = item['@type']
                        types.extend(t if isinstance(t, list) else [t])
            blocks.append({"data": data, "types": [str(t) for t in types]})
        except Exception:
            pass

    prompt = f"""You are an expert SEO schema auditor. Analyze the following JSON-LD schema extracted from {url}.
Identify missing recommended properties, validate according to Schema.org guidelines, and suggest improvements for better rich snippets.
Show exactly WHERE in the JSON improvements should be made with complete, copy-pasteable JSON-LD examples using // NEW: comments.

Schema Extracted:
{json_lib.dumps(all_schemas, indent=2)}

Provide your findings in clear, formatted markdown."""
    try:
        ai_analysis = _gemini_generate(prompt)
    except Exception as e:
        ai_analysis = f"AI analysis failed: {e}"

    return {"blocks": blocks, "ai_analysis": ai_analysis, "count": len(blocks)}


# --- SERP Analyzer Endpoints ---
from serp_utils import fetch_serp_results, GEOLOCATIONS

class SerpRequest(BaseModel):
    keyword: str
    location_name: str = "Global (No Geolocation)"
    target_url: Optional[str] = None
    auth_user: Optional[str] = None
    auth_pass: Optional[str] = None

@app.post("/api/serp/analyze")
def serp_analyze(req: SerpRequest):
    results_data = fetch_serp_results(req.keyword, location_name=req.location_name)
    if isinstance(results_data, dict) and "error" in results_data:
        raise HTTPException(status_code=502, detail=results_data["error"])
    if not results_data or not results_data.get("organic"):
        raise HTTPException(status_code=404, detail="No organic results found.")

    serp_results = results_data.get("organic", [])
    related = results_data.get("related_keywords", [])

    serp_context = ""
    for i, res in enumerate(serp_results):
        serp_context += f"\nResult {i+1}: {res['title']}\nURL: {res['link']}\nSnippet: {res['snippet']}\n"
    related_context = ", ".join(related) if related else "None detected."

    if req.target_url:
        auth = (req.auth_user, req.auth_pass) if req.auth_user else None
        try:
            target_text = _fetch_page_text(req.target_url, auth=auth)[:5000]
        except Exception:
            target_text = "Could not fetch target URL."
        prompt = f"""You are an SEO expert. Analyze the top 3 Google Mobile search results for: '{req.keyword}'.

TOP 3 SERP RESULTS:
{serp_context}

RELATED SEARCHES:
{related_context}

MY TARGET URL: {req.target_url}
Content snippet: {target_text}

TASK:
1. Compare the Target URL with the mobile top 3.
2. Identify semantic gaps using 'RELATED SEARCHES'.
3. Provide 3 specific, actionable recommendations for mobile dominance.
Format in clear Markdown."""
    else:
        prompt = f"""You are an SEO expert. Analyze the top 3 Google Mobile search results for: '{req.keyword}'.

TOP 3 SERP RESULTS:
{serp_context}

RELATED SEARCHES:
{related_context}

TASK:
1. Why are these results winning on Mobile?
2. Identify excellence factors and semantic trends.
Format in clear Markdown."""

    try:
        analysis = _gemini_generate(prompt)
    except Exception as e:
        analysis = f"AI analysis failed: {e}"

    return {
        "organic": serp_results,
        "related_keywords": related,
        "analysis": analysis
    }

@app.get("/api/serp/geolocations")
def serp_geolocations():
    return {"geolocations": [loc["name"] for loc in GEOLOCATIONS]}


# --- URL Comparator Endpoints ---
from comparator import scrape_url as _comp_scrape, compare_urls as _comp_compare

class ComparatorRequest(BaseModel):
    keyword: str
    url1: str
    url2: str
    url3: Optional[str] = None
    pos1: int = 1
    pos2: int = 2
    pos3: int = 3
    auth_user: Optional[str] = None
    auth_pass: Optional[str] = None

@app.post("/api/comparator/analyze")
def comparator_analyze(req: ComparatorRequest):
    auth = (req.auth_user, req.auth_pass) if req.auth_user else None
    d1 = _comp_scrape(req.url1, auth=auth)
    d2 = _comp_scrape(req.url2, auth=auth)
    d3 = _comp_scrape(req.url3, auth=auth) if req.url3 else None
    if d1.get('error'):
        raise HTTPException(status_code=400, detail=f"URL 1 error: {d1['error']}")
    if d2.get('error'):
        raise HTTPException(status_code=400, detail=f"URL 2 error: {d2['error']}")
    if d3 and d3.get('error'):
        d3 = None
    analysis = _comp_compare(req.keyword, d1, d2, d3, req.pos1, req.pos2, req.pos3)
    return {"scraped": [d1, d2, d3], "analysis": analysis}


# --- Internal Linking Endpoints ---
from internal_linking import scrape_internal_links as _il_scrape, analyze_linking_strategy as _il_analyze
from urllib.parse import urlparse as _urlparse

class InternalLinkingRequest(BaseModel):
    urls: List[str]
    auth_user: Optional[str] = None
    auth_pass: Optional[str] = None

@app.post("/api/internal-linking/analyze")
def internal_linking_analyze(req: InternalLinkingRequest):
    auth = (req.auth_user, req.auth_pass) if req.auth_user else None
    all_data = [_il_scrape(url, auth=auth) for url in req.urls]

    def _norm(u):
        p = _urlparse(u)
        return (p.netloc + p.path).rstrip('/').lower().replace('www.', '')

    summary = []
    for d in all_data:
        if d.get('error'):
            summary.append({"url": d['source_url'], "status": f"Error: {d['error']}", "title": "N/A",
                            "contextual_links": 0, "inter_links": 0, "word_count": 0})
        else:
            inter = [l for l in d.get('links', []) if any(t in l['url'] for t in req.urls if t != d['source_url'])]
            summary.append({"url": d['source_url'], "status": "OK", "title": d.get('title', 'N/A'),
                "contextual_links": d.get('internal_links_count', 0),
                "inter_links": len(inter), "word_count": d.get('word_count', 0)})

    matrix = []
    for d_src in all_data:
        row = {"source": d_src['source_url'], "values": {}}
        if d_src.get('error'):
            for t in req.urls:
                row["values"][t] = "N/A"
        else:
            src_n = _norm(d_src['source_url'])
            for t in req.urls:
                t_n = _norm(t)
                if src_n == t_n:
                    row["values"][t] = "Self"
                else:
                    row["values"][t] = "✅ Link" if any(_norm(l['url']) == t_n for l in d_src.get('links', [])) else "❌ No"
        matrix.append(row)

    analysis = _il_analyze(all_data, req.urls)
    return {"summary": summary, "matrix": matrix, "matrix_cols": req.urls, "analysis": analysis}


# --- Image Alt Analysis Endpoints ---
from PIL import Image as _PIL_Image

class ImageAltRequest(BaseModel):
    url: str
    keyword: str
    manual_intent: Optional[str] = None
    max_images: int = 10
    auth_user: Optional[str] = None
    auth_pass: Optional[str] = None

def _get_content_images(url, auth=None):
    from urllib.parse import urljoin
    headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/91.0 Safari/537.36"}
    resp = http_requests.get(url, headers=headers, timeout=15, auth=auth)
    resp.raise_for_status()
    soup = BeautifulSoup(resp.text, 'html.parser')
    exclude_kws = ['logo', 'icon', 'svg', 'avatar', 'social', 'button', 'arrow', 'sprite', 'profile', 'headshot', 'user']
    imgs = []
    for img in soup.find_all('img'):
        src = img.get('src', '')
        cls = img.get('class', [])
        class_str = " ".join(cls).lower() if isinstance(cls, list) else str(cls).lower()
        if not src or any(kw in src.lower() for kw in exclude_kws) or any(kw in class_str for kw in exclude_kws):
            continue
        imgs.append({"src": urljoin(url, src), "alt": img.get('alt', '')})
    return imgs, resp.text

def _detect_page_intent(url, html_content):
    soup = BeautifulSoup(html_content, 'html.parser')
    title = soup.title.string if soup.title else "N/A"
    h1s = [h.get_text().strip() for h in soup.find_all('h1')]
    meta = soup.find('meta', attrs={'name': 'description'})
    meta_desc = meta.get('content', '') if meta else ''
    prompt = (f"Analyze this webpage metadata and return the primary user intent in max 10 words.\n"
              f"URL: {url}\nTitle: {title}\nH1s: {h1s}\nMeta: {meta_desc}")
    return _gemini_generate(prompt).strip()

def _analyze_image_alt(img_src, current_alt, keyword, intent):
    headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/91.0 Safari/537.36"}
    img_resp = http_requests.get(img_src, headers=headers, timeout=10)
    img_resp.raise_for_status()
    pil_img = _PIL_Image.open(io.BytesIO(img_resp.content))
    model_name = _get_flash_model()
    model = genai.GenerativeModel(model_name)
    prompt = (f'Analyze this image in context of:\n- Target Keyword: {keyword}\n- Page Intent: {intent}\n'
              f'- Current Alt Text: "{current_alt}"\n'
              f'Return JSON: {{"is_best": boolean, "reasoning": "string", "proposed_alt": "string"}}')
    response = model.generate_content([prompt, pil_img])
    text = response.text
    if "```json" in text:
        text = text.split("```json")[1].split("```")[0].strip()
    elif "```" in text:
        text = text.split("```")[1].split("```")[0].strip()
    import json as _json
    return _json.loads(text)

@app.post("/api/image-alt/analyze")
def image_alt_analyze(req: ImageAltRequest):
    url = req.url if req.url.startswith("http") else "https://" + req.url
    auth = (req.auth_user, req.auth_pass) if req.auth_user else None
    try:
        imgs, html = _get_content_images(url, auth=auth)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Could not fetch URL: {e}")
    if not imgs:
        raise HTTPException(status_code=404, detail="No content images found on this page.")
    detected_intent = req.manual_intent or _detect_page_intent(url, html)
    results = []
    for img_info in imgs[:req.max_images]:
        try:
            analysis = _analyze_image_alt(img_info['src'], img_info['alt'], req.keyword, detected_intent)
            results.append({"src": img_info['src'], "alt": img_info['alt'],
                "status": "✅ Best" if analysis.get("is_best") else "⚠️ Needs Change",
                "reasoning": analysis.get("reasoning", ""), "proposed_alt": analysis.get("proposed_alt", "")})
        except Exception as e:
            results.append({"src": img_info['src'], "alt": img_info['alt'], "status": "❌ Error", "error": str(e)})
    return {"detected_intent": detected_intent, "total_images": len(imgs), "results": results}


# --- CWV Analysis Endpoints ---
class CwvRequest(BaseModel):
    url: str
    strategy: str = "mobile"
    auth_user: Optional[str] = None
    auth_pass: Optional[str] = None

@app.post("/api/cwv/analyze")
def cwv_analyze(req: CwvRequest):
    url = req.url if req.url.startswith("http") else "https://" + req.url
    api_key = os.getenv("GOOGLE_API_KEY")
    params = {"url": url, "strategy": req.strategy.lower(), "category": "performance"}
    if api_key:
        params["key"] = api_key
    try:
        r = http_requests.get("https://www.googleapis.com/pagespeedonline/v5/runPagespeed",
                              params=params, timeout=90)
        r.raise_for_status()
        data = r.json()
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"PageSpeed Insights API error: {e}")
    lh = data.get("lighthouseResult", {})
    audits = lh.get("audits", {})
    perf_score = int((lh.get("categories", {}).get("performance", {}).get("score", 0) or 0) * 100)

    def _m(key):
        a = audits.get(key, {})
        return {"value": a.get("displayValue", "N/A"), "score": a.get("score")}

    metrics = {
        "lcp": _m("largest-contentful-paint"),
        "fcp": _m("first-contentful-paint"),
        "cls": _m("cumulative-layout-shift"),
        "tbt": _m("total-blocking-time"),
        "si":  _m("speed-index"),
        "tti": _m("interactive"),
    }
    opps = []
    for v in audits.values():
        if v.get("details", {}).get("type") == "opportunity" and v.get("details", {}).get("overallSavingsMs", 0) > 0:
            opps.append({"title": v.get("title"), "description": v.get("description"),
                         "savings_ms": v.get("details", {}).get("overallSavingsMs", 0)})
    opps = sorted(opps, key=lambda x: x["savings_ms"], reverse=True)[:5]
    return {"performance_score": perf_score, "metrics": metrics, "opportunities": opps, "strategy": req.strategy}


# --- SEO Data API Proxy (moveupx) ---
_SEO_API_BASE = "https://api.moveupx.ai/data/v1/seo"

def _seo_get(path: str, params: dict = None):
    api_key = os.getenv("SEO_API_KEY")
    if not api_key:
        raise HTTPException(status_code=503, detail="SEO_API_KEY environment variable is not configured.")
    headers = {"Authorization": f"Bearer {api_key}"}
    r = http_requests.get(f"{_SEO_API_BASE}{path}", headers=headers, params=params or {}, timeout=30)
    if r.status_code == 404:
        return None
    if not r.ok:
        raise HTTPException(status_code=r.status_code, detail=r.text)
    return r.json()

@app.get("/api/data/gsc/sites")
def data_gsc_sites():
    return _seo_get("/dims/gsc-sites") or []

@app.get("/api/data/gsc/dates")
def data_gsc_dates():
    return _seo_get("/gsc/dates") or []

class GscQueryRequest(BaseModel):
    site_slug: str
    cut: str = "query"
    search_type: str = "web"
    date: Optional[str] = None

@app.post("/api/data/gsc/query")
def data_gsc_query(req: GscQueryRequest):
    params = {"search_type": req.search_type}
    if req.date:
        params["date"] = req.date
    return _seo_get(f"/gsc/{req.site_slug}/{req.cut}", params=params) or []

@app.get("/api/data/ahrefs/projects")
def data_ahrefs_projects():
    return _seo_get("/dims/ahrefs-projects") or []

class AhrefsRequest(BaseModel):
    project_slug: str
    date: Optional[str] = None
    device: str = "desktop"

@app.post("/api/data/ahrefs/site-metrics")
def data_ahrefs_site_metrics(req: AhrefsRequest):
    params = {}
    if req.date:
        params["date"] = req.date
    return _seo_get(f"/ahrefs/site-metrics/{req.project_slug}", params=params) or {}

@app.post("/api/data/ahrefs/rank-tracker")
def data_ahrefs_rank_tracker(req: AhrefsRequest):
    params = {"device": req.device}
    if req.date:
        params["date"] = req.date
    return _seo_get(f"/ahrefs/rank-tracker/{req.project_slug}", params=params) or []

@app.post("/api/data/ahrefs/keywords")
def data_ahrefs_keywords(req: AhrefsRequest):
    params = {}
    if req.date:
        params["date"] = req.date
    return _seo_get(f"/ahrefs/keywords/{req.project_slug}", params=params) or []

@app.post("/api/data/ahrefs/competitor-stats")
def data_ahrefs_competitor_stats(req: AhrefsRequest):
    params = {"device": req.device}
    if req.date:
        params["date"] = req.date
    return _seo_get(f"/ahrefs/competitor-stats/{req.project_slug}", params=params) or []


class SerpOrgRequest(BaseModel):
    keyword_slug: str
    geo: str = "BR"
    device: str = "desktop"
    date: Optional[str] = None

@app.post("/api/data/serp/organic")
def data_serp_organic(req: SerpOrgRequest):
    params = {"device": req.device}
    if req.date:
        params["date"] = req.date
    return _seo_get(f"/serp/{req.geo}/{req.keyword_slug}", params=params) or []

@app.post("/api/data/serp/related")
def data_serp_related(req: SerpOrgRequest):
    params = {"device": req.device}
    if req.date:
        params["date"] = req.date
    return _seo_get(f"/serp/{req.geo}/{req.keyword_slug}/related", params=params) or []


class KeywordHistoryRequest(BaseModel):
    project_slug: str
    keyword: str
    device: str = "desktop"

@app.post("/api/data/ahrefs/keyword-history")
def data_ahrefs_keyword_history(req: KeywordHistoryRequest):
    import datetime
    from concurrent.futures import ThreadPoolExecutor

    dates_data = _seo_get("/ahrefs/dates") or []
    today = datetime.date.today()
    cutoff = today - datetime.timedelta(days=30)
    valid_dates = sorted([
        d["date"] for d in dates_data
        if d.get("rank_tracker_rows", 0) > 0
        and datetime.date.fromisoformat(d["date"]) >= cutoff
    ])

    def _fetch(date_str):
        try:
            rows = _seo_get(f"/ahrefs/rank-tracker/{req.project_slug}",
                            params={"date": date_str, "device": req.device}) or []
            for row in rows:
                if (row.get("keyword") or "").lower() == req.keyword.lower():
                    return {"date": date_str, "position": row.get("position")}
        except Exception:
            pass
        return None

    with ThreadPoolExecutor(max_workers=6) as pool:
        results = list(pool.map(_fetch, valid_dates))

    return [r for r in results if r is not None]


# --- Serve React frontend (production build) ---
from fastapi.staticfiles import StaticFiles
import pathlib

_dist = pathlib.Path(__file__).parent / "frontend" / "dist"
if _dist.exists():
    app.mount("/", StaticFiles(directory=str(_dist), html=True), name="frontend")

# --- Vercel serverless handler (only active when mangum is installed) ---
try:
    from mangum import Mangum
    handler = Mangum(app, lifespan="off")
except ImportError:
    pass
