from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import pandas as pd
from typing import List, Optional
import os
import io

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
    # Check env var first (persists across Vercel serverless invocations)
    _env = os.getenv("LOG_SITES_JSON")
    if _env:
        try:
            return _json_cfg.loads(_env)
        except Exception:
            pass
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

_google_api_key = os.getenv("GOOGLE_API_KEY")
if _google_api_key:
    genai.configure(api_key=_google_api_key)

_flash_model_cache = None

def _get_flash_model():
    global _flash_model_cache
    if _flash_model_cache:
        return _flash_model_cache
    try:
        available_models = [m.name for m in genai.list_models() if 'generateContent' in m.supported_generation_methods]
        for target in ['models/gemini-2.0-flash', 'models/gemini-1.5-flash', 'models/gemini-flash-latest']:
            if target in available_models:
                _flash_model_cache = target
                return _flash_model_cache
        flash_models = [m for m in available_models if 'flash' in m.lower()]
        _flash_model_cache = flash_models[0] if flash_models else 'models/gemini-2.0-flash'
        return _flash_model_cache
    except:
        _flash_model_cache = 'models/gemini-2.0-flash'
        return _flash_model_cache

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


def _fetch_serp_via_gemini(keyword: str, location_name: str = "Global (No Geolocation)") -> dict:
    """
    Uses Gemini to simulate a Google SERP — no scraping, no IP blocks, ~3s response.
    Returns the same shape as fetch_serp_results: {organic: [...], related_keywords: [...]}.
    """
    import json as _json, re as _re
    loc_hint = f"in {location_name}" if location_name != "Global (No Geolocation)" else "globally"
    prompt = f"""You are simulating a Google SERP for an SEO research tool.

Keyword: "{keyword}"
Search context: {loc_hint}

Return ONLY a valid JSON object — no markdown, no explanation, no code fences. Format:
{{
  "organic": [
    {{"title": "...", "link": "https://...", "snippet": "..."}},
    {{"title": "...", "link": "https://...", "snippet": "..."}},
    {{"title": "...", "link": "https://...", "snippet": "..."}},
    {{"title": "...", "link": "https://...", "snippet": "..."}},
    {{"title": "...", "link": "https://...", "snippet": "..."}}
  ],
  "related_keywords": ["...", "...", "...", "...", "...", "..."],
  "paa": [
    {{"question": "...", "answer": "..."}},
    {{"question": "...", "answer": "..."}},
    {{"question": "...", "answer": "..."}},
    {{"question": "...", "answer": "..."}}
  ]
}}

Rules:
- Use real, existing domains that would realistically rank for this keyword.
- The snippet should mirror a real Google meta-description / snippet for that URL.
- For the keyword context ({loc_hint}), prefer results in the appropriate language.
- related_keywords must be short (2-6 words each), realistic Google "related searches".
- paa must be 4 realistic "People Also Ask" questions with concise answers (2-4 sentences each) in the appropriate language.
- Return exactly 5 organic results, 6 related_keywords, and 4 paa items."""

    try:
        raw = _gemini_generate(prompt)
        # Strip markdown fences at start/end
        raw = _re.sub(r"^```(?:json)?\s*|\s*```$", "", raw.strip())
        # Extract the first JSON object even if Gemini added preamble text
        match = _re.search(r'\{[\s\S]*\}', raw)
        if match:
            raw = match.group(0)
        data = _json.loads(raw)
        if isinstance(data.get("organic"), list) and data["organic"]:
            return data
        return {"organic": [], "related_keywords": [], "error": f"Gemini returned no organic results. Raw: {raw[:200]}"}
    except Exception as exc:
        return {"organic": [], "related_keywords": [], "error": f"Gemini SERP simulation failed: {exc}"}

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

    # Build matrix with per-cell anchor data
    matrix = []
    for d_src in all_data:
        row = {"source": d_src['source_url'], "values": {}}
        if d_src.get('error'):
            for t in req.urls:
                row["values"][t] = {"status": "error", "anchors": []}
        else:
            src_n = _norm(d_src['source_url'])
            for t in req.urls:
                t_n = _norm(t)
                if src_n == t_n:
                    row["values"][t] = {"status": "self", "anchors": []}
                else:
                    matching = [l['anchor'] for l in d_src.get('links', []) if _norm(l['url']) == t_n]
                    row["values"][t] = {"status": "link" if matching else "none", "anchors": matching[:10]}
        matrix.append(row)

    # Compute inbound counts from matrix (avoids a second pass over all_data)
    inbound = {u: 0 for u in req.urls}
    for row in matrix:
        for t, cell in row['values'].items():
            if cell.get('status') == 'link':
                inbound[t] = inbound.get(t, 0) + 1

    # Build summary with outbound anchor details per inter-link
    summary = []
    for d in all_data:
        if d.get('error'):
            summary.append({
                "url": d['source_url'], "status": f"Error: {d['error']}", "title": "N/A",
                "contextual_links": 0, "inter_links": 0, "word_count": 0,
                "inbound_count": 0, "outbound_anchors": []
            })
        else:
            inter = [l for l in d.get('links', [])
                     if any(_norm(l['url']) == _norm(t) for t in req.urls if t != d['source_url'])]
            outbound_anchors = [{"to": l['url'], "anchor": l['anchor']} for l in inter[:20]]
            summary.append({
                "url": d['source_url'], "status": "OK", "title": d.get('title', 'N/A'),
                "contextual_links": d.get('internal_links_count', 0),
                "inter_links": len(inter), "word_count": d.get('word_count', 0),
                "inbound_count": inbound.get(d['source_url'], 0),
                "outbound_anchors": outbound_anchors
            })

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


# --- Header Analysis Endpoints ---
class HeadersRequest(BaseModel):
    url: str
    keyword: str
    auth_user: Optional[str] = None
    auth_pass: Optional[str] = None

@app.post("/api/headers/analyze")
def headers_analyze(req: HeadersRequest):
    url = req.url if req.url.startswith("http") else "https://" + req.url
    auth = (req.auth_user, req.auth_pass) if req.auth_user else None
    ua = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36"}
    try:
        response = http_requests.get(url, headers=ua, timeout=15, auth=auth)
        response.raise_for_status()
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Could not fetch URL: {e}")

    soup = BeautifulSoup(response.text, 'html.parser')
    header_tags = soup.find_all(['h1', 'h2', 'h3', 'h4', 'h5', 'h6'])
    if not header_tags:
        raise HTTPException(status_code=404, detail="No heading tags (H1–H6) found on this page.")

    keyword_lower = req.keyword.lower()
    keyword_words = set(w for w in keyword_lower.split() if len(w) > 2)

    headers_list = []
    for i, tag in enumerate(header_tags):
        text = tag.get_text(strip=True)
        text_lower = text.lower()
        has_full = keyword_lower in text_lower
        has_partial = bool(keyword_words) and sum(1 for w in keyword_words if w in text_lower) >= max(1, len(keyword_words) // 2)
        headers_list.append({
            "level": int(tag.name[1]),
            "text": text,
            "has_keyword": has_full or has_partial,
            "position": i,
        })

    issues = []
    h1_count = sum(1 for h in headers_list if h["level"] == 1)
    if h1_count == 0:
        issues.append({"severity": "critical", "message": "No H1 tag found on the page."})
    elif h1_count > 1:
        issues.append({"severity": "critical", "message": f"Multiple H1 tags found ({h1_count}). There should be exactly one H1."})

    if h1_count >= 1 and not any(h["has_keyword"] for h in headers_list if h["level"] == 1):
        issues.append({"severity": "critical", "message": f"H1 does not contain the target keyword '{req.keyword}'."})

    prev_level = 0
    seen_skips = set()
    for h in headers_list:
        if h["level"] > prev_level + 1 and prev_level > 0:
            skip_key = (prev_level, h["level"])
            if skip_key not in seen_skips:
                issues.append({"severity": "warning", "message": f"Heading hierarchy skips from H{prev_level} to H{h['level']}: \"{h['text'][:50]}\""})
                seen_skips.add(skip_key)
        prev_level = h["level"]

    kw_count = sum(1 for h in headers_list if h["has_keyword"])
    if kw_count == 0:
        issues.append({"severity": "critical", "message": "No headings reference the target keyword or its variants."})
    elif kw_count < 2 and len(headers_list) >= 5:
        issues.append({"severity": "warning", "message": "Only 1 heading references the keyword. Add keyword variants to more subheadings."})

    score = 100 - sum(25 if i["severity"] == "critical" else 10 for i in issues)
    score = max(0, min(100, score))

    headers_md = "\n".join(f"{'#' * h['level']} {h['text']}" for h in headers_list[:50])
    prompt = f"""You are an SEO expert auditing the heading structure of a webpage.

Target keyword: "{req.keyword}"
URL: {url}

Heading structure:
{headers_md}

Detected issues: {[i['message'] for i in issues] if issues else 'None detected'}

Give a concise, actionable analysis. Cover:
1. H1 optimization for the keyword
2. Heading hierarchy and logical content flow
3. Keyword distribution and semantic coverage across headings
4. Rewritten examples for the most problematic headings

Use markdown. Be specific. Max 350 words."""

    try:
        model = genai.GenerativeModel(_get_flash_model())
        ai_analysis = model.generate_content(prompt).text
    except Exception as e:
        ai_analysis = f"AI analysis unavailable: {e}"

    return {
        "headers": headers_list,
        "issues": issues,
        "score": score,
        "ai_analysis": ai_analysis,
        "total": len(headers_list),
        "keyword": req.keyword,
    }


# --- SEO Health / Sheets KPI Endpoints ---
import json as _json_mod

@app.get("/api/sheets/sites")
def sheets_sites():
    raw = os.getenv("SEO_HEALTH_SITES", "[]")
    try:
        sites = _json_mod.loads(raw)
    except Exception:
        sites = []
    return {"sites": sites}

class SheetAnalyzeRequest(BaseModel):
    spreadsheet_id: str
    site_name: str = ""

def _extract_spreadsheet_id(url_or_id: str) -> str:
    m = _re_log.search(r'/spreadsheets/d/([a-zA-Z0-9-_]+)', url_or_id)
    return m.group(1) if m else url_or_id.strip()

_SHEETS_METRIC_MAP = [
    # === Screaming Frog crawl summary (specific patterns first) ===
    # Crawl coverage
    ("total internal indexable urls",        "Indexable URLs",       "technical",   None),
    ("total internal non-indexable",         "Non-Indexable URLs",   "technical",   None),
    ("total internal blocked by robots",     "Robots Blocked",       "technical",   None),
    ("total urls crawled",                   "URLs Crawled",         "technical",   None),
    ("total urls encountered",               "URLs Encountered",     "technical",   None),
    ("total internal urls",                  "Internal URLs",        "technical",   None),
    ("total external urls",                  "External URLs",        "technical",   None),
    # H1 structure
    ("h1:missing",                           "H1 Missing",           "technical",   None),
    ("h1:duplicate",                         "H1 Duplicate",         "technical",   None),
    ("h1:over x",                            "H1 Too Long",          "technical",   None),
    ("h1:multiple",                          "H1 Multiple",          "technical",   None),
    ("h1:all",                               "H1 Total",             "technical",   None),
    # H2 structure
    ("h2:missing",                           "H2 Missing",           "technical",   None),
    ("h2:duplicate",                         "H2 Duplicate",         "technical",   None),
    ("h2:non-sequential",                    "H2 Non-Sequential",    "technical",   None),
    ("h2:over x",                            "H2 Too Long",          "technical",   None),
    ("h2:all",                               "H2 Total",             "technical",   None),
    # JavaScript / rendering
    ("javascript:pages with javascript errors",   "JS Errors",            "technical",   None),
    ("javascript:pages with javascript warnings", "JS Warnings",          "technical",   None),
    ("javascript:pages with chrome issues",       "Chrome Issues",        "technical",   None),
    ("javascript:canonical mismatch",             "Canonical Mismatch",   "technical",   None),
    ("javascript:all",                            "JS Pages",             "technical",   None),
    # === Generic SEO metrics (for other sheet types) ===
    ("organic session",    "Organic Sessions",   "traffic",     None),
    ("organic traffic",    "Organic Traffic",    "traffic",     None),
    ("organic click",      "Organic Clicks",     "traffic",     None),
    ("session",            "Sessions",           "traffic",     None),
    ("pageview",           "Pageviews",          "traffic",     None),
    ("active user",        "Active Users",       "traffic",     None),
    ("new user",           "New Users",          "traffic",     None),
    ("user",               "Users",              "traffic",     None),
    ("visit",              "Visits",             "traffic",     None),
    ("click",              "Clicks",             "traffic",     None),
    ("impression",         "Impressions",        "traffic",     None),
    ("bounce rate",        "Bounce Rate",        "traffic",     "percent"),
    ("average position",   "Avg Position",       "rankings",    "score"),
    ("avg position",       "Avg Position",       "rankings",    "score"),
    ("ctr",                "CTR",                "rankings",    "percent"),
    ("position",           "Avg Position",       "rankings",    "score"),
    ("domain rating",      "Domain Rating",      "backlinks",   "score"),
    ("domain authority",   "Domain Authority",   "backlinks",   "score"),
    ("referring domain",   "Referring Domains",  "backlinks",   None),
    ("backlink",           "Backlinks",          "backlinks",   None),
    ("revenue",            "Revenue",            "conversions", None),
    ("conversion",         "Conversions",        "conversions", None),
    ("transaction",        "Transactions",       "conversions", None),
    ("lcp",                "LCP",                "technical",   "ms"),
    ("cls",                "CLS",                "technical",   None),
    ("fid",                "FID",                "technical",   "ms"),
    ("inp",                "INP",                "technical",   "ms"),
    ("response time",      "Response Time",      "technical",   "ms"),
    ("crawl error",        "Crawl Errors",       "technical",   None),
    ("404",                "404 Errors",         "technical",   None),
]

_DATE_KEYWORDS = {"date", "time", "period", "month", "week", "day", "year", "hour", "elapsed", "modified"}

def _parse_num(val):
    if val is None or str(val).strip() == "":
        return None
    s = str(val).strip().replace(",", "").replace("%", "").replace("$", "").replace("R$", "").strip()
    try:
        return float(s)
    except ValueError:
        return None

def _calculate_health_score(all_data):
    """Compute 0-100 SEO health score from crawl summary data with breakdown."""
    kv = {}
    for sd in all_data:
        for i, h in enumerate(sd["headers"]):
            row = sd["rows"][-1] if sd["rows"] else []
            kv[h.lower().strip()] = row[i] if i < len(row) else ""

    def n(key, default=0.0):
        try:
            return float(str(kv.get(key, default)).replace(",", "").strip() or default)
        except Exception:
            return default

    score = 100.0
    breakdown = []

    # 1. Indexability (max -20)
    idx = n("total internal indexable urls")
    non_idx = n("total internal non-indexable urls")
    total = idx + non_idx
    if total > 0:
        pct = non_idx / total
        p = 20 if pct > 0.20 else 12 if pct > 0.10 else 5 if pct > 0.05 else 2 if pct > 0 else 0
        score -= p
        if p: breakdown.append({"issue": f"{pct*100:.1f}% non-indexable URLs", "penalty": p})

    # 2. Robots.txt blocking (max -10)
    robots = n("total internal blocked by robots.txt")
    if total > 0 and robots > 0:
        p = min(10, max(3, round((robots / total) * 100)))
        score -= p
        breakdown.append({"issue": f"{int(robots)} internal URLs blocked by robots.txt", "penalty": p})

    # 3. H1 quality (max -30)
    h1_all = n("h1:all")
    if h1_all > 0:
        miss_p = n("h1:missing") / h1_all
        dup_p  = n("h1:duplicate") / h1_all
        multi_p = n("h1:multiple") / h1_all
        long_p = n("h1:over x characters") / h1_all

        if miss_p > 0.10: p = 20; r = f"{miss_p*100:.0f}% of pages missing H1"
        elif miss_p > 0.03: p = 12; r = f"{miss_p*100:.1f}% of pages missing H1"
        elif miss_p > 0: p = 5; r = f"{int(n('h1:missing'))} pages missing H1"
        else: p = 0; r = None
        score -= p
        if r: breakdown.append({"issue": r, "penalty": p})

        if dup_p > 0.10: p = 8; r = f"{dup_p*100:.0f}% duplicate H1s"
        elif dup_p > 0: p = 3; r = f"{int(n('h1:duplicate'))} duplicate H1s"
        else: p = 0; r = None
        score -= p
        if r: breakdown.append({"issue": r, "penalty": p})

        if multi_p > 0.10: p = 5; r = f"{multi_p*100:.0f}% pages with multiple H1s"
        elif multi_p > 0.03: p = 2; r = None
        else: p = 0; r = None
        score -= p
        if r: breakdown.append({"issue": r, "penalty": p})

        if long_p > 0.20: p = 3; r = f"{long_p*100:.0f}% H1s too long"
        else: p = 0; r = None
        score -= p
        if r: breakdown.append({"issue": r, "penalty": p})

    # 4. H2 quality (max -20)
    h2_all = n("h2:all")
    if h2_all > 0:
        miss_p = n("h2:missing") / h2_all
        dup_p  = n("h2:duplicate") / h2_all
        ns_p   = n("h2:non-sequential") / h2_all
        long_p = n("h2:over x characters") / h2_all

        if miss_p > 0.20: p = 8; r = f"{miss_p*100:.0f}% of pages missing H2"
        elif miss_p > 0.05: p = 4; r = f"{miss_p*100:.1f}% of pages missing H2"
        elif miss_p > 0: p = 1; r = None
        else: p = 0; r = None
        score -= p
        if r: breakdown.append({"issue": r, "penalty": p})

        if dup_p > 0.30: p = 7; r = f"{dup_p*100:.0f}% duplicate H2s"
        elif dup_p > 0.10: p = 4; r = f"{dup_p*100:.0f}% duplicate H2s"
        elif dup_p > 0: p = 2; r = f"{int(n('h2:duplicate'))} duplicate H2s"
        else: p = 0; r = None
        score -= p
        if r: breakdown.append({"issue": r, "penalty": p})

        if ns_p > 0.05: p = 3; r = f"{ns_p*100:.1f}% non-sequential H2s"
        elif ns_p > 0: p = 1; r = None
        else: p = 0; r = None
        score -= p
        if r: breakdown.append({"issue": r, "penalty": p})

        if long_p > 0.20: p = 2; r = f"{long_p*100:.0f}% H2s too long"
        else: p = 0; r = None
        score -= p
        if r: breakdown.append({"issue": r, "penalty": p})

    # 5. Canonical integrity (max -15)
    canon = n("javascript:canonical mismatch")
    if total > 0 and canon > 0:
        p = min(15, max(5, round((canon / total) * 100)))
        score -= p
        breakdown.append({"issue": f"{int(canon)} canonical mismatches", "penalty": p})

    # 6. JavaScript errors (max -10)
    js_all = n("javascript:all")
    if js_all > 0:
        js_err = n("javascript:pages with javascript errors")
        err_p = js_err / js_all
        if err_p > 0.10: p = 10; r = f"{err_p*100:.0f}% of pages have JS errors"
        elif err_p > 0.02: p = 5; r = f"{err_p*100:.1f}% of pages have JS errors"
        elif js_err > 0: p = 2; r = f"{int(js_err)} pages with JS errors"
        else: p = 0; r = None
        score -= p
        if r: breakdown.append({"issue": r, "penalty": p})

    final = max(0, min(100, round(score)))
    label = "Excellent" if final >= 90 else "Good" if final >= 75 else "Needs Work" if final >= 55 else "Critical"
    return {"score": final, "label": label, "breakdown": breakdown}

def _extract_metrics_deterministic(all_data):
    seen_names = set()
    metrics = []
    for sd in all_data:
        headers = sd["headers"]
        rows = sd["rows"]
        if len(rows) < 1:
            continue
        current_row = rows[-1]
        prev_row = rows[-2] if len(rows) >= 2 else None

        for col_idx, raw_header in enumerate(headers):
            header_lc = raw_header.lower().strip()
            if any(kw in header_lc for kw in _DATE_KEYWORDS):
                continue

            matched_name, matched_cat, matched_unit = None, "other", None
            for keyword, disp, cat, unit in _SHEETS_METRIC_MAP:
                if keyword in header_lc:
                    matched_name = disp
                    matched_cat = cat
                    matched_unit = unit
                    break

            if matched_name is None or matched_name in seen_names:
                continue

            cur_val = _parse_num(current_row[col_idx] if col_idx < len(current_row) else None)
            if cur_val is None:
                continue

            prev_val = None
            if prev_row is not None:
                prev_val = _parse_num(prev_row[col_idx] if col_idx < len(prev_row) else None)

            trend = "neutral"
            if cur_val is not None and prev_val is not None:
                trend = "up" if cur_val > prev_val else ("down" if cur_val < prev_val else "neutral")

            seen_names.add(matched_name)
            metrics.append({
                "name": matched_name,
                "current": cur_val,
                "previous": prev_val,
                "unit": matched_unit,
                "category": matched_cat,
                "trend": trend,
            })

    return metrics


@app.post("/api/sheets/analyze")
def sheets_analyze(req: SheetAnalyzeRequest):
    # Prefer a dedicated unrestricted server key; fall back to the shared key
    api_key = os.getenv("GOOGLE_SHEETS_API_KEY") or os.getenv("GOOGLE_API_KEY")
    if not api_key:
        raise HTTPException(status_code=503, detail="No Google API key configured. Set GOOGLE_SHEETS_API_KEY in Vercel env vars.")

    sheet_id = _extract_spreadsheet_id(req.spreadsheet_id)

    try:
        meta_r = http_requests.get(
            f"https://sheets.googleapis.com/v4/spreadsheets/{sheet_id}",
            params={"key": api_key}, timeout=15
        )
        meta_r.raise_for_status()
        meta = meta_r.json()
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Cannot access spreadsheet: {e}. Ensure it is set to 'Anyone with the link can view'.")

    spreadsheet_title = meta.get("properties", {}).get("title", req.site_name or "Unknown")
    sheets = meta.get("sheets", [])

    all_data = []
    for sheet in sheets[:4]:
        sheet_name = sheet["properties"]["title"]
        try:
            val_r = http_requests.get(
                f"https://sheets.googleapis.com/v4/spreadsheets/{sheet_id}/values/{sheet_name}!A1:AZ500",
                params={"key": api_key}, timeout=15
            )
            val_r.raise_for_status()
            values = val_r.json().get("values", [])
            if not values or len(values) < 2:
                continue
            headers = values[0]
            rows = values[1:]
            recent = rows[-15:] if len(rows) > 15 else rows
            all_data.append({"sheet": sheet_name, "headers": headers, "rows": recent})
        except Exception:
            continue

    if not all_data:
        raise HTTPException(status_code=404, detail="No readable data found in this spreadsheet.")

    metrics = _extract_metrics_deterministic(all_data)
    health  = _calculate_health_score(all_data)

    return {
        "site_name": req.site_name or spreadsheet_title,
        "spreadsheet_title": spreadsheet_title,
        "metrics": metrics,
        "sheets_read": [d["sheet"] for d in all_data],
        "score": health["score"],
        "score_label": health["label"],
        "score_breakdown": health["breakdown"],
    }


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


# --- Featured Snippet Stealer ---

def _classify_intent(keyword: str) -> str:
    kw = keyword.lower()
    transactional = ["comprar", "buy", "price", "preço", "código", "code", "coupon", "cupom",
                     "promo", "desconto", "discount", "grátis", "free", "download", "assinar",
                     "cadastro", "signup", "register", "bet", "bônus", "bonus", "oferta", "deal"]
    commercial    = ["melhor", "best", "review", "avaliação", "comparar", "vs", "versus",
                     "recomenda", "ranking", "top", "alternativa", "vale a pena", "opinion"]
    informational = ["como", "o que", "what", "how", "why", "por que", "quando", "where",
                     "onde", "quem", "who", "tutorial", "guia", "guide", "dica", "tip",
                     "exemplo", "example", "significa", "definição", "definition"]
    for t in transactional:
        if t in kw:
            return "Transactional"
    for c in commercial:
        if c in kw:
            return "Commercial"
    for i in informational:
        if i in kw:
            return "Informational"
    return "Navigational"


class FsStealerRequest(BaseModel):
    keyword: str
    target_url: str
    location_name: str = "Global (No Geolocation)"
    auth_user: Optional[str] = None
    auth_pass: Optional[str] = None

@app.post("/api/fs/analyze")
def fs_stealer_analyze(req: FsStealerRequest):
    target_url = req.target_url if req.target_url.startswith("http") else "https://" + req.target_url
    intent = _classify_intent(req.keyword)

    # Step 1 — Gemini simulates the SERP (~3s, no scraping, no IP blocks)
    serp = _fetch_serp_via_gemini(req.keyword, req.location_name)
    if not serp.get("organic"):
        raise HTTPException(status_code=502, detail=serp.get("error", "SERP simulation failed. Please try again."))

    organic = serp.get("organic", [])
    related_keywords = serp.get("related_keywords", [])
    fs_holder = organic[0]

    serp_context = "\n".join(
        f"#{i+1} — {r['title']}\n   URL: {r['link']}\n   Snippet: {r['snippet']}"
        for i, r in enumerate(organic[:5])
    )
    related_context = ", ".join(related_keywords) if related_keywords else "None detected."

    # Step 2 — Gemini generates the full action plan (~5-8s)
    # No page fetching — Gemini uses its own knowledge of the FS holder and target domain.
    prompt = f"""You are an elite SEO strategist specializing in Featured Snippet (FS) optimization.
SERP data is AI-simulated. Use your knowledge of the FS holder domain and target page to make recommendations specific and copy-paste ready.

KEYWORD: "{req.keyword}"
DETECTED INTENT: {intent}
TARGET PAGE: {target_url}
GEOLOCATION: {req.location_name}

═══ SIMULATED SERP (top 5) ═══
{serp_context}

═══ RELATED SEARCHES (semantic cluster) ═══
{related_context}

═══ FS HOLDER (Position #1) ═══
URL: {fs_holder["link"]}
Title: {fs_holder["title"]}
Snippet: {fs_holder["snippet"]}

FS TYPE WINNING STRATEGIES:
- Paragraph FS → 40-60 word direct answer right after the H2/H3 matching the query.
- Numbered List FS → <ol> with 5-8 steps under a "Como…"/"How to…" heading; each step ≤ 80 words.
- Bulleted List FS → <ul> under a "Quais são…"/"What are…" heading; bold the first 2-3 words per item.
- Table FS → <table> with clear caption and ≥2 columns; rows labeled with user-scanned keywords.

---

Provide the Featured Snippet Steal Action Plan in clean Markdown:

## 🔎 SERP Intent
One sentence confirming the {intent} intent and what content format Google rewards for it.

## 🔍 Featured Snippet Diagnosis
- **FS Type**: Paragraph / Numbered List / Bulleted List / Table
- **What Google is extracting**: exact block description
- **Why the current holder wins**: 2-3 bullets
- **FS opportunity score**: N/10 — justification specific to {target_url}

## 🧩 Semantic Gap — Related Keywords Analysis
| Related Keyword | Covered on Target Page? | Recommended Placement |
|-----------------|------------------------|-----------------------|
[5-7 rows — base "Covered?" on your knowledge of {target_url}]

## 📊 Gap Analysis — Target vs FS Holder
| Factor | FS Holder ({fs_holder["link"]}) | Target Page ({target_url}) | Priority |
|--------|--------------------------------|---------------------------|----------|
[rows: Direct answer placement, Content format, Word count of answer block, Header structure, Schema markup, Reading level, Mobile formatting, Semantic coverage]

## 🎯 Step-by-Step Action Plan
[5-8 numbered steps. Each must have:
- **What to do**: specific action
- **Exactly where**: section / heading / element on {target_url}
- **Copy-paste example**: actual HTML or content — not a description]

## ⚡ Quick Wins (implement in < 1 hour)
3 changes that alone could trigger a FS swap within days.

## 📋 Validation Checklist
Checkbox list the user ticks off after each change.

Be ruthlessly specific — tie every recommendation to what {fs_holder["link"]} does that {target_url} does not."""

    try:
        analysis = _gemini_generate(prompt)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"AI analysis failed: {e}")

    return {
        "keyword": req.keyword,
        "target_url": target_url,
        "intent": intent,
        "fs_holder": fs_holder,
        "organic": organic[:5],
        "related_keywords": related_keywords,
        "paa": serp.get("paa", []),
        "analysis": analysis,
    }


# --- SEO Data API proxy (indexation control) ---

_SEO_DATA_BASE = "https://api.moveupx.ai/data/v1/seo"

def _seo_get(path: str, params: dict = None):
    key = os.getenv("SEO_DATA_API_KEY")
    if not key:
        raise HTTPException(status_code=500, detail="SEO_DATA_API_KEY not configured in environment")
    resp = http_requests.get(
        f"{_SEO_DATA_BASE}/{path}",
        headers={"Authorization": f"Bearer {key}"},
        params=params or {},
        timeout=25,
    )
    if resp.status_code == 404:
        return None
    if not resp.ok:
        try:
            detail = resp.json()
        except Exception:
            detail = {"error": resp.text}
        raise HTTPException(status_code=resp.status_code, detail=detail)
    return resp.json()


@app.get("/api/indexation/gsc-sites")
def indexation_gsc_sites():
    data = _seo_get("dims/gsc-sites")
    return {"sites": data or []}


@app.get("/api/indexation/gsc-dates")
def indexation_gsc_dates():
    data = _seo_get("gsc/dates")
    if not data:
        return {"dates": []}
    settled = [d for d in data if (d.get("row_count") or 0) > 0]
    return {"dates": settled}


class IndexationRequest(BaseModel):
    site_slug: str
    date: Optional[str] = None
    search_type: str = "web"
    urls: Optional[List[str]] = None


@app.post("/api/indexation/check")
def indexation_check(req: IndexationRequest):
    params: dict = {}
    if req.date:
        params["date"] = req.date
    if req.search_type:
        params["search_type"] = req.search_type

    pages = _seo_get(f"gsc/{req.site_slug}/page", params) or []

    sitemaps: list = []
    try:
        sm_params = {"date": req.date} if req.date else {}
        sitemaps = _seo_get(f"gsc/{req.site_slug}/sitemaps", sm_params) or []
    except Exception:
        pass

    def _norm(u: str) -> str:
        from urllib.parse import urlparse as _up
        p = _up(u.strip())
        host = p.netloc.lower().replace("www.", "")
        path = p.path.rstrip("/") or "/"
        return host + path

    indexed_map = {_norm(p["page"]): p for p in pages if p.get("page")}

    url_results: list = []
    if req.urls:
        for u in req.urls:
            if not u.strip():
                continue
            match = indexed_map.get(_norm(u))
            url_results.append({
                "url": u.strip(),
                "in_gsc": match is not None,
                "clicks": match["clicks"] if match else None,
                "impressions": match["impressions"] if match else None,
                "ctr": match["ctr"] if match else None,
                "position": match["position"] if match else None,
            })

    pages_sorted = sorted(pages, key=lambda x: x.get("impressions") or 0, reverse=True)[:2000]

    stats = {
        "total_pages": len(pages),
        "with_clicks": sum(1 for p in pages if (p.get("clicks") or 0) > 0),
        "no_clicks": sum(1 for p in pages if (p.get("clicks") or 0) == 0),
        "sitemap_count": len(sitemaps),
        "report_date": pages[0]["report_date"] if pages else req.date,
    }

    return {
        "stats": stats,
        "pages": pages_sorted,
        "sitemaps": sitemaps,
        "url_results": url_results,
    }


class SitemapCheckRequest(BaseModel):
    site_slug: str
    date: Optional[str] = None
    search_type: str = "web"
    sitemap_url: str


@app.post("/api/indexation/sitemap-check")
def indexation_sitemap_check(req: SitemapCheckRequest):
    import xml.etree.ElementTree as ET
    from urllib.parse import urlparse as _up

    _HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; MoveupSEOBot/1.0)"}

    def _fetch_xml(url: str, timeout: int = 15):
        try:
            r = http_requests.get(url, timeout=timeout, headers=_HEADERS)
            r.raise_for_status()
            return ET.fromstring(r.content)
        except ET.ParseError as exc:
            raise HTTPException(status_code=400, detail=f"Invalid XML in {url}: {exc}")
        except Exception as exc:
            raise HTTPException(status_code=400, detail=f"Could not fetch {url}: {exc}")

    def _extract_locs(root):
        return [
            el.text.strip()
            for el in root.iter()
            if (el.tag.endswith("}loc") or el.tag == "loc") and el.text and el.text.strip()
        ]

    def _is_sitemap_index(root):
        return any(el.tag.endswith("}sitemap") or el.tag == "sitemap" for el in root)

    root = _fetch_xml(req.sitemap_url, timeout=20)

    loc_urls: list = []
    child_sitemaps: list = []

    if _is_sitemap_index(root):
        for el in root.iter():
            if el.tag.endswith("}sitemap") or el.tag == "sitemap":
                for child in el:
                    if (child.tag.endswith("}loc") or child.tag == "loc") and child.text and child.text.strip():
                        child_sitemaps.append(child.text.strip())
        for child_url in child_sitemaps[:20]:
            try:
                child_root = _fetch_xml(child_url, timeout=12)
                loc_urls.extend(_extract_locs(child_root))
            except Exception:
                pass
    else:
        loc_urls = _extract_locs(root)

    seen: set = set()
    unique_urls: list = []
    for u in loc_urls:
        if u not in seen:
            seen.add(u)
            unique_urls.append(u)

    if not unique_urls:
        raise HTTPException(status_code=400, detail="No URLs found in sitemap")

    params: dict = {}
    if req.date:
        params["date"] = req.date
    if req.search_type:
        params["search_type"] = req.search_type

    pages = _seo_get(f"gsc/{req.site_slug}/page", params) or []

    def _norm(u: str) -> str:
        p = _up(u.strip())
        host = p.netloc.lower().replace("www.", "")
        path = p.path.rstrip("/") or "/"
        return host + path

    indexed_map = {_norm(p["page"]): p for p in pages if p.get("page")}

    url_results: list = []
    for u in unique_urls[:10000]:
        match = indexed_map.get(_norm(u))
        url_results.append({
            "url": u,
            "in_gsc": match is not None,
            "clicks":      match["clicks"]      if match else None,
            "impressions": match["impressions"]  if match else None,
            "ctr":         match["ctr"]          if match else None,
            "position":    match["position"]     if match else None,
        })

    total   = len(url_results)
    indexed = sum(1 for r in url_results if r["in_gsc"])

    return {
        "sitemap_url":       req.sitemap_url,
        "child_sitemaps":    child_sitemaps,
        "total_urls":        total,
        "indexed_count":     indexed,
        "not_indexed_count": total - indexed,
        "coverage_pct":      round(indexed / total * 100, 1) if total > 0 else 0,
        "report_date":       pages[0]["report_date"] if pages else req.date,
        "gsc_pages_total":   len(pages),
        "debug_sample": {
            "gsc_norms":     [_norm(p["page"]) for p in pages[:5] if p.get("page")],
            "sitemap_norms": [_norm(u) for u in unique_urls[:5]],
        },
        "url_results":       url_results,
    }


# --- Vercel serverless handler (only active when mangum is installed) ---
try:
    from mangum import Mangum
    handler = Mangum(app, lifespan="off")
except ImportError:
    pass
