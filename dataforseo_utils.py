# DataForSEO SERP client — used only by the *test copy* of rank tracking (/api/tracking-dfs).
#
# Why this exists: production tracking is pinned to SerpAPI, and a rank series is only
# meaningful when every point comes from the same source. Rather than adding a provider
# switch to the live series, this module powers a parallel tracking module with its own
# tables, so DataForSEO's positions can be compared against SerpAPI's side by side without
# ever mixing the two into one chart.
#
# Endpoint: /v3/serp/google/organic/live/advanced — the "live" family returns the SERP in the
# same request (no task_post → task_get polling), which is what the per-keyword check flow needs.
import os
import base64
import requests

DFS_BASE = "https://api.dataforseo.com/v3"

# The app's own geolocation names (serp_utils.GEOLOCATIONS) mapped onto DataForSEO's location
# system. Country codes are 2000 + the ISO-3166 numeric code, which is how DataForSEO numbers
# countries; cities have no derivable code, so they go by name and fall back to their country.
#
# "Global (No Geolocation)" has no DataForSEO equivalent — google/organic always requires a
# location — so it resolves to Brazil, this portfolio's actual market. Every response reports
# the location used (`resolved_location`) so a chart is never silently attributed elsewhere.
DFS_LOCATIONS = {
    "Global (No Geolocation)": {"location_code": 2076, "language_code": "pt", "note": "no global option — resolved to Brazil"},
    "Brazil (General)":        {"location_code": 2076, "language_code": "pt"},
    "Brazil (São Paulo)":      {"location_name": "São Paulo,State of São Paulo,Brazil", "language_code": "pt", "fallback_location_code": 2076},
    "Brazil (Rio de Janeiro)": {"location_name": "Rio de Janeiro,State of Rio de Janeiro,Brazil", "language_code": "pt", "fallback_location_code": 2076},
    "Portugal":                {"location_code": 2620, "language_code": "pt"},
    "Spain":                   {"location_code": 2724, "language_code": "es"},
    "Mexico":                  {"location_code": 2484, "language_code": "es"},
    "Argentina":               {"location_code": 2032, "language_code": "es"},
    "Colombia":                {"location_code": 2170, "language_code": "es"},
    "Chile":                   {"location_code": 2152, "language_code": "es"},
    "Peru":                    {"location_code": 2604, "language_code": "es"},
    "United States":           {"location_code": 2840, "language_code": "en"},
    "United Kingdom":          {"location_code": 2826, "language_code": "en"},
    "Canada":                  {"location_code": 2124, "language_code": "en"},
    "Australia":               {"location_code": 2036, "language_code": "en"},
    "India":                   {"location_code": 2356, "language_code": "en"},
    "Germany":                 {"location_code": 2276, "language_code": "de"},
    "France":                  {"location_code": 2250, "language_code": "fr"},
    "Italy":                   {"location_code": 2380, "language_code": "it"},
    "Netherlands":             {"location_code": 2528, "language_code": "nl"},
}

# Google-composed answer boxes nobody owns — mirrors serp_utils._UNSTEALABLE_ANSWER_BOXES so
# both providers agree on what counts as a winnable featured snippet.
_UNSTEALABLE_ITEM_TYPES = {
    "math_solver", "currency_box", "currency_converter", "weather", "unit_converter",
    "translation", "time", "stocks_box", "top_stories", "sports_scores", "google_flights",
}


def dfs_auth_header():
    """Basic-auth header from DATAFORSEO_LOGIN / DATAFORSEO_PASSWORD. None when unset."""
    login = os.getenv("DATAFORSEO_LOGIN", "").strip()
    password = os.getenv("DATAFORSEO_PASSWORD", "").strip()
    if not login or not password:
        return None
    token = base64.b64encode(f"{login}:{password}".encode()).decode()
    return {"Authorization": f"Basic {token}", "Content-Type": "application/json"}


def dfs_locations():
    """Location names this module can send to DataForSEO — drives the test UI's dropdown."""
    return list(DFS_LOCATIONS.keys())


def _post(path: str, payload, timeout: int = 60):
    """POST to DataForSEO. Returns (json, error_string) — never raises."""
    headers = dfs_auth_header()
    if not headers:
        return None, "DATAFORSEO_LOGIN / DATAFORSEO_PASSWORD not configured"
    try:
        resp = requests.post(f"{DFS_BASE}{path}", headers=headers, json=payload, timeout=timeout)
    except Exception as exc:
        return None, f"DataForSEO request failed: {exc}"
    try:
        data = resp.json()
    except Exception:
        return None, f"DataForSEO returned non-JSON ({resp.status_code}): {resp.text[:200]}"
    # 40104 (unverified account), 40200 (out of credits) etc. arrive as HTTP 4xx *and* a
    # status_message worth surfacing verbatim — the operator needs to know which one it is.
    status = data.get("status_code")
    if status != 20000:
        return data, f"DataForSEO {status}: {data.get('status_message', 'unknown error')}"
    return data, None


def dfs_account_status():
    """Live credential/quota check — powers the test module's diagnostics panel."""
    headers = dfs_auth_header()
    if not headers:
        return {"ok": False, "error": "DATAFORSEO_LOGIN / DATAFORSEO_PASSWORD not configured"}
    try:
        resp = requests.get(f"{DFS_BASE}/appendix/user_data", headers=headers, timeout=30)
        data = resp.json()
    except Exception as exc:
        return {"ok": False, "error": f"DataForSEO request failed: {exc}"}
    if data.get("status_code") != 20000:
        return {"ok": False, "error": f"DataForSEO {data.get('status_code')}: {data.get('status_message')}"}
    result = ((data.get("tasks") or [{}])[0].get("result") or [{}])[0]
    return {
        "ok": True,
        "login": result.get("login"),
        "money": result.get("money", {}),
        "timezone": result.get("timezone"),
    }


def _normalize_featured_snippet(item: dict):
    """DataForSEO's featured_snippet item → the app's {type,title,link,content} shape."""
    if not isinstance(item, dict):
        return None
    table = item.get("table")
    if isinstance(table, dict) and (table.get("rows") or table.get("table_header")):
        fs_type = "Table"
        rows = []
        header = table.get("table_header")
        if isinstance(header, list) and header:
            rows.append(" | ".join(str(c) for c in header))
        for row in (table.get("rows") or [])[:12]:
            rows.append(" | ".join(str(c) for c in row) if isinstance(row, list) else str(row))
        content = "\n".join(rows)
    else:
        content = (item.get("description") or item.get("featured_title") or "").strip()
        fs_type = "Paragraph"
    if not content:
        return None
    return {
        "type": fs_type,
        "title": item.get("title") or item.get("featured_title") or "",
        "link": item.get("url") or "",
        "content": content[:2000],
        "raw_type": "featured_snippet",
    }


def parse_dfs_serp(result: dict) -> dict:
    """
    One DataForSEO result block → the app's standard SERP shape:
    {organic, related_keywords, paa, featured_snippet, source, ...}

    Organic position comes from `rank_group` (rank among organic results, i.e. what an SEO
    calls "position #3"), not `rank_absolute` (rank among *all* SERP blocks, which counts ads
    and widgets and would read several places lower than the same result in SerpAPI).
    """
    items = result.get("items") or []
    organic, related, paa = [], [], []
    featured = None

    for it in items:
        itype = it.get("type")
        if itype == "organic":
            organic.append({
                "title": it.get("title", ""),
                "link": it.get("url", ""),
                "snippet": it.get("description") or "N/A",
                "position": it.get("rank_group") or len(organic) + 1,
                "domain": it.get("domain", ""),
            })
        elif itype == "featured_snippet" and featured is None:
            featured = _normalize_featured_snippet(it)
        elif itype == "related_searches":
            for kw in (it.get("items") or [])[:8]:
                if isinstance(kw, str) and kw not in related:
                    related.append(kw)
        elif itype == "people_also_ask":
            for q in (it.get("items") or [])[:5]:
                expanded = (q.get("expanded_element") or [{}])[0]
                paa.append({
                    "question": q.get("title", ""),
                    "answer": expanded.get("description", "") if isinstance(expanded, dict) else "",
                })

    # Some SERPs put the snippet owner in an organic item flagged is_featured_snippet instead
    # of emitting a separate featured_snippet block.
    if featured is None:
        for it in items:
            if it.get("type") == "organic" and it.get("is_featured_snippet"):
                featured = {
                    "type": "Paragraph",
                    "title": it.get("title", ""),
                    "link": it.get("url", ""),
                    "content": (it.get("description") or "")[:2000],
                    "raw_type": "organic_featured",
                }
                break

    return {
        "organic": organic,
        "related_keywords": related,
        "paa": paa,
        "featured_snippet": featured,
        "source": "dataforseo",
        "item_types": result.get("item_types") or [],
        "se_results_count": result.get("se_results_count"),
        "check_url": result.get("check_url"),
        "resolved_location": result.get("location_code") or result.get("location_name"),
        "resolved_language": result.get("language_code"),
    }


def fetch_serp_via_dataforseo(query: str, location_name: str = "Global (No Geolocation)",
                              depth: int = None, device: str = None) -> dict:
    """
    Live Google organic SERP from DataForSEO, in the same shape the rest of the app expects
    from serp_utils.fetch_serp_via_serpapi. Returns {"error": ...} on any failure — the caller
    (the test tracker) records nothing rather than storing a fabricated position.
    """
    loc = DFS_LOCATIONS.get(location_name)
    if not loc:
        # Unknown location string (e.g. a keyword imported with a location this map doesn't
        # cover) — measure it in the portfolio's market rather than guessing at random.
        loc = DFS_LOCATIONS["Global (No Geolocation)"]

    depth = int(depth or os.getenv("DATAFORSEO_DEPTH", "10"))
    device = device or os.getenv("DATAFORSEO_DEVICE", "desktop")

    task = {
        "keyword": query,
        "language_code": loc["language_code"],
        "device": device,
        "os": "windows" if device == "desktop" else "android",
        "depth": max(10, min(depth, 100)),
        "calculate_rectangles": False,
    }
    if loc.get("location_code"):
        task["location_code"] = loc["location_code"]
    else:
        task["location_name"] = loc["location_name"]

    data, err = _post("/serp/google/organic/live/advanced", [task])
    if err:
        return {"error": err, "source": "dataforseo"}

    tasks = data.get("tasks") or []
    if not tasks:
        return {"error": "DataForSEO returned no tasks", "source": "dataforseo"}
    t = tasks[0]

    # A bad city name fails at the task level (40501 Invalid Field). Retry once at country
    # level so a city-scoped keyword still produces a point instead of a silent gap.
    if t.get("status_code") != 20000 and loc.get("fallback_location_code"):
        task.pop("location_name", None)
        task["location_code"] = loc["fallback_location_code"]
        data, err = _post("/serp/google/organic/live/advanced", [task])
        if err:
            return {"error": err, "source": "dataforseo"}
        t = (data.get("tasks") or [{}])[0]

    if t.get("status_code") != 20000:
        return {"error": f"DataForSEO task {t.get('status_code')}: {t.get('status_message')}",
                "source": "dataforseo"}

    results = t.get("result") or []
    if not results:
        return {"error": "DataForSEO task returned no result block", "source": "dataforseo"}

    out = parse_dfs_serp(results[0])
    # Cost is per request and small, but a test that quietly spends is a test nobody repeats —
    # every snapshot carries what it cost.
    out["cost"] = float(data.get("cost") or 0)
    out["requested_location"] = location_name
    if loc.get("note"):
        out["location_note"] = loc["note"]
    return out


# ── Backlinks ─────────────────────────────────────────────────────────────────
# Live-only endpoints, priced per call. The audit makes exactly two: one profile summary and
# one page of the worst-scoring referring domains.

def fetch_backlinks_summary(target: str) -> dict:
    """Whole-profile metrics for a domain: counts, spam score, link types, platforms, TLDs."""
    task = {
        "target": target,
        "internal_list_limit": 10,
        "backlinks_status_type": "live",
        "include_subdomains": True,
    }
    data, err = _post("/backlinks/summary/live", [task])
    if err:
        return {"error": err}
    t = (data.get("tasks") or [{}])[0]
    if t.get("status_code") != 20000:
        return {"error": f"DataForSEO task {t.get('status_code')}: {t.get('status_message')}"}
    result = (t.get("result") or [{}])[0]
    result["cost"] = float(data.get("cost") or 0)
    return result


def fetch_backlinks(target: str, limit: int = 200, min_spam_score: int = None) -> dict:
    """The referring links themselves, worst spam score first, one row per referring domain.

    `one_per_domain` is deliberate: a disavow decision is made per domain (a `domain:` line
    covers every URL on it), so pulling 50 links from one spam network would spend the row
    budget without adding a single new decision.
    """
    task = {
        "target": target,
        "mode": "one_per_domain",
        "limit": max(1, min(limit, 1000)),
        "order_by": ["backlink_spam_score,desc", "domain_from_rank,asc"],
        "backlinks_status_type": "live",
        "include_subdomains": True,
        "include_indirect_links": False,
    }
    if min_spam_score is not None:
        task["filters"] = [["backlink_spam_score", ">=", int(min_spam_score)]]

    data, err = _post("/backlinks/backlinks/live", [task])
    if err:
        return {"error": err}
    t = (data.get("tasks") or [{}])[0]
    if t.get("status_code") != 20000:
        return {"error": f"DataForSEO task {t.get('status_code')}: {t.get('status_message')}"}
    result = (t.get("result") or [{}])[0]
    return {
        "items": result.get("items") or [],
        "total_count": result.get("total_count"),
        "items_count": result.get("items_count"),
        "cost": float(data.get("cost") or 0),
    }
