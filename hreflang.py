"""
Hreflang checker — finds pages across a site's locale subfolders that are the same content in
different languages, and reports where the hreflang annotations are missing or broken.

The hard part is not reading hreflang tags, it is deciding which pages *should* be linked. A
translation shares almost no words with its original, so lexical similarity — the obvious
approach — fails exactly where it is needed most. Three signals are used instead, cheapest
first, and the caller only spends an AI call on what is left ambiguous:

  1. Path parity.        /en/about-us vs /pt/about-us — the same path under a different locale
                         prefix. Reliable on any site whose slugs are not translated.
  2. Structural finger-  Image filenames, outbound link hosts and numeric tokens (prices,
     prints.             dates, stats) survive translation. Two pages sharing them are almost
                         always the same page.
  3. Lexical similarity. Only meaningful between locales of the *same* language (pt-BR vs
                         pt-PT, en-US vs en-GB), where it is very strong.

Anything still uncertain is handed to the caller as a candidate for an AI verdict.
"""
import re
from collections import defaultdict
from urllib.parse import urlparse, urljoin

# ISO 639-1 languages, trimmed to the ones that realistically appear in a locale subfolder.
_LANGS = {
    "aa", "ab", "af", "ak", "am", "ar", "as", "ay", "az", "ba", "be", "bg", "bh", "bi", "bm",
    "bn", "bo", "br", "bs", "ca", "ce", "co", "cs", "cy", "da", "de", "dv", "dz", "ee", "el",
    "en", "eo", "es", "et", "eu", "fa", "ff", "fi", "fj", "fo", "fr", "fy", "ga", "gd", "gl",
    "gn", "gu", "gv", "ha", "he", "hi", "hr", "ht", "hu", "hy", "ia", "id", "ig", "is", "it",
    "iw", "ja", "jv", "ka", "kk", "kl", "km", "kn", "ko", "ku", "kw", "ky", "la", "lb", "lg",
    "ln", "lo", "lt", "lv", "mg", "mi", "mk", "ml", "mn", "mr", "ms", "mt", "my", "nb", "ne",
    "nl", "nn", "no", "ny", "oc", "om", "or", "pa", "pl", "ps", "pt", "qu", "rm", "rn", "ro",
    "ru", "rw", "sa", "sd", "se", "sg", "si", "sk", "sl", "sn", "so", "sq", "sr", "ss", "st",
    "su", "sv", "sw", "ta", "te", "tg", "th", "ti", "tk", "tl", "tn", "to", "tr", "ts", "tt",
    "tw", "ug", "uk", "ur", "uz", "ve", "vi", "wo", "xh", "yi", "yo", "zh", "zu",
}

# ISO 3166-1 alpha-2 regions. "UK" is deliberately absent — it is the single most common
# hreflang mistake and the checker has to be able to call it invalid.
_REGIONS = {
    "AD", "AE", "AF", "AG", "AI", "AL", "AM", "AO", "AR", "AT", "AU", "AW", "AZ", "BA", "BB",
    "BD", "BE", "BF", "BG", "BH", "BI", "BJ", "BM", "BN", "BO", "BR", "BS", "BT", "BW", "BY",
    "BZ", "CA", "CD", "CF", "CG", "CH", "CI", "CL", "CM", "CN", "CO", "CR", "CU", "CV", "CY",
    "CZ", "DE", "DJ", "DK", "DM", "DO", "DZ", "EC", "EE", "EG", "ER", "ES", "ET", "FI", "FJ",
    "FM", "FO", "FR", "GA", "GB", "GD", "GE", "GH", "GI", "GL", "GM", "GN", "GQ", "GR", "GT",
    "GW", "GY", "HK", "HN", "HR", "HT", "HU", "ID", "IE", "IL", "IN", "IQ", "IR", "IS", "IT",
    "JM", "JO", "JP", "KE", "KG", "KH", "KI", "KM", "KN", "KP", "KR", "KW", "KY", "KZ", "LA",
    "LB", "LC", "LI", "LK", "LR", "LS", "LT", "LU", "LV", "LY", "MA", "MC", "MD", "ME", "MG",
    "MH", "MK", "ML", "MM", "MN", "MO", "MR", "MT", "MU", "MV", "MW", "MX", "MY", "MZ", "NA",
    "NE", "NG", "NI", "NL", "NO", "NP", "NR", "NZ", "OM", "PA", "PE", "PG", "PH", "PK", "PL",
    "PR", "PS", "PT", "PW", "PY", "QA", "RO", "RS", "RU", "RW", "SA", "SB", "SC", "SD", "SE",
    "SG", "SI", "SK", "SL", "SM", "SN", "SO", "SR", "SS", "ST", "SV", "SY", "SZ", "TD", "TG",
    "TH", "TJ", "TL", "TM", "TN", "TO", "TR", "TT", "TV", "TW", "TZ", "UA", "UG", "US", "UY",
    "UZ", "VA", "VC", "VE", "VN", "VU", "WS", "YE", "ZA", "ZM", "ZW",
}

# Region codes people wrongly use as languages, and the usual intent.
_COMMON_MISTAKES = {
    "uk": "en-GB (UK is not a language code — 'uk' means Ukrainian)",
    "br": "pt-BR (BR is not a language code — 'br' means Breton)",
    "cn": "zh-CN (CN is not a language code)",
    "jp": "ja (JP is not a language code)",
    "gr": "el (GR is not a language code)",
    "en-uk": "en-GB (the UK's region code is GB)",
    "pt-pt": None,   # valid, listed only so the parser does not flag it
}

_HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; MoveupSEOBot/1.0; +hreflang-checker)"}


# ── locale detection ──────────────────────────────────────────────────────────

def parse_locale(token: str):
    """Is this path segment a locale? Returns (lang, region) or None.

    Accepts `pt`, `pt-br`, `pt_BR`. Returns the parts lowercased/uppercased canonically so
    `/PT-br/` and `/pt-BR/` are recognised as the same locale.
    """
    if not token:
        return None
    t = token.strip().strip("/").replace("_", "-").lower()
    if not t or len(t) > 6:
        return None
    parts = t.split("-")
    if parts[0] not in _LANGS:
        return None
    if len(parts) == 1:
        return (parts[0], None)
    if len(parts) == 2 and parts[1].upper() in _REGIONS:
        return (parts[0], parts[1].upper())
    return None


def locale_label(lang: str, region: str) -> str:
    return f"{lang}-{region}" if region else lang


def split_locale_path(path: str):
    """Split a URL path into (locale_label or None, remainder).

    `/pt-br/produtos/x` -> ("pt-BR", "/produtos/x"); `/produtos/x` -> (None, "/produtos/x").
    """
    clean = "/" + (path or "").strip("/")
    segs = [s for s in clean.split("/") if s]
    if not segs:
        return None, "/"
    loc = parse_locale(segs[0])
    if not loc:
        return None, clean
    rest = "/" + "/".join(segs[1:])
    return locale_label(*loc), (rest if rest != "/" else "/")


def validate_hreflang(code: str) -> str:
    """Return an error string for a malformed hreflang value, or "" when it is valid."""
    raw = (code or "").strip()
    if not raw:
        return "empty hreflang value"
    low = raw.lower()
    if low == "x-default":
        return ""
    if "_" in raw:
        return f'uses an underscore — "{raw}" should be "{raw.replace("_", "-")}"'
    hint = _COMMON_MISTAKES.get(low)
    if hint:
        return f'"{raw}" is not valid — use {hint}'
    parts = low.split("-")
    if parts[0] not in _LANGS:
        return f'"{parts[0]}" is not an ISO 639-1 language code'
    if len(parts) == 1:
        return ""
    if len(parts) == 2:
        if parts[1].upper() not in _REGIONS:
            return f'"{parts[1].upper()}" is not an ISO 3166-1 region code'
        return ""
    return f'"{raw}" has too many subtags for hreflang'


# ── fetching ──────────────────────────────────────────────────────────────────

def discover_sitemap_urls(base: str, session, timeout: int = 15, cap: int = 5000) -> dict:
    """Collect page URLs from robots.txt-declared sitemaps, falling back to the usual paths."""
    import xml.etree.ElementTree as ET

    roots, tried = [], []

    def _get_xml(url):
        tried.append(url)
        try:
            r = session.get(url, headers=_HEADERS, timeout=timeout, allow_redirects=True)
            if not r.ok:
                return None
            body = r.content
            # Large sites commonly serve sitemap.xml.gz. requests transparently handles gzip
            # *transfer* encoding but not a gzipped file body, so without this the XML parse
            # fails and the site looks like it has no sitemap at all.
            if body[:2] == bytes([0x1F, 0x8B]) or url.lower().endswith(".gz"):
                import gzip
                try:
                    body = gzip.decompress(body)
                except Exception:
                    pass
            return ET.fromstring(body)
        except Exception:
            return None

    # robots.txt is authoritative when it declares sitemaps
    try:
        r = session.get(urljoin(base, "/robots.txt"), headers=_HEADERS, timeout=timeout)
        if r.ok:
            for line in r.text.splitlines():
                if line.lower().startswith("sitemap:"):
                    roots.append(line.split(":", 1)[1].strip())
    except Exception:
        pass
    if not roots:
        roots = [urljoin(base, p) for p in
                 ("/sitemap.xml", "/sitemap_index.xml", "/sitemap-index.xml", "/sitemap1.xml")]

    def _locs(root):
        return [el.text.strip() for el in root.iter()
                if (el.tag.endswith("}loc") or el.tag == "loc") and el.text and el.text.strip()]

    urls, seen, indexes = [], set(), []
    for sm in roots[:10]:
        root = _get_xml(sm)
        if root is None:
            continue
        is_index = any(el.tag.endswith("}sitemap") or el.tag == "sitemap" for el in root)
        if is_index:
            children = _locs(root)
            indexes.append({"sitemap": sm, "children": len(children)})
            for child in children[:50]:
                croot = _get_xml(child)
                if croot is None:
                    continue
                for u in _locs(croot):
                    if u not in seen and len(urls) < cap:
                        seen.add(u); urls.append(u)
        else:
            for u in _locs(root):
                if u not in seen and len(urls) < cap:
                    seen.add(u); urls.append(u)
        if len(urls) >= cap:
            break
    return {"urls": urls, "sitemaps_tried": tried, "indexes": indexes}


_WORD_RE = re.compile(r"[^\W\d_]{3,}", re.UNICODE)
_NUM_RE = re.compile(r"\d[\d.,:/-]{1,}")


def fetch_page(url: str, session, timeout: int = 15) -> dict:
    """Fetch one page and extract everything the matcher and the audit need."""
    from bs4 import BeautifulSoup

    out = {"url": url, "status": None, "error": None, "hreflangs": {}, "lang": None,
           "canonical": None, "title": "", "h1": "", "words": set(), "images": set(),
           "numbers": set(), "outbound": set(), "final_url": url}
    try:
        r = session.get(url, headers=_HEADERS, timeout=timeout, allow_redirects=True)
        out["status"] = r.status_code
        out["final_url"] = r.url
        if not r.ok or "html" not in (r.headers.get("Content-Type") or "").lower():
            return out
        soup = BeautifulSoup(r.text, "html.parser")
    except Exception as exc:
        out["error"] = str(exc)[:200]
        return out

    html_tag = soup.find("html")
    if html_tag:
        out["lang"] = (html_tag.get("lang") or "").strip() or None

    for link in soup.find_all("link", rel=lambda v: v and "alternate" in " ".join(v).lower()):
        code = (link.get("hreflang") or "").strip()
        href = (link.get("href") or "").strip()
        if code and href:
            out["hreflangs"][code] = urljoin(r.url, href)

    can = soup.find("link", rel=lambda v: v and "canonical" in " ".join(v).lower())
    if can and can.get("href"):
        out["canonical"] = urljoin(r.url, can["href"].strip())

    if soup.title and soup.title.string:
        out["title"] = soup.title.string.strip()[:300]
    h1 = soup.find("h1")
    if h1:
        out["h1"] = h1.get_text(" ", strip=True)[:300]

    host = urlparse(r.url).netloc.lower().replace("www.", "")
    for img in soup.find_all("img", src=True)[:120]:
        name = urlparse(urljoin(r.url, img["src"])).path.rsplit("/", 1)[-1].lower()
        # Ignore resize/cache suffixes so the same asset matches across locales.
        name = re.sub(r"-\d{2,4}x\d{2,4}(?=\.)", "", name)
        if name and not name.endswith((".svg", ".gif")):
            out["images"].add(name)

    for a in soup.find_all("a", href=True)[:400]:
        h = urlparse(urljoin(r.url, a["href"])).netloc.lower().replace("www.", "")
        if h and h != host:
            out["outbound"].add(h)

    for tag in soup(["script", "style", "nav", "header", "footer"]):
        tag.decompose()
    text = soup.get_text(" ", strip=True)[:20000]
    out["words"] = set(w.lower() for w in _WORD_RE.findall(text))
    out["numbers"] = set(n.strip(".,:/-") for n in _NUM_RE.findall(text))
    out["numbers"].discard("")
    return out


# ── matching ──────────────────────────────────────────────────────────────────

def _jaccard(a: set, b: set) -> float:
    if not a or not b:
        return 0.0
    return len(a & b) / len(a | b)


def score_pair(p: dict, q: dict, same_language: bool) -> dict:
    """How likely are these two pages the same content in different locales?"""
    images = _jaccard(p["images"], q["images"])
    numbers = _jaccard(p["numbers"], q["numbers"])
    outbound = _jaccard(p["outbound"], q["outbound"])
    lexical = _jaccard(p["words"], q["words"])

    # Weighted toward whatever survives translation.
    structural = (images * 0.5) + (numbers * 0.3) + (outbound * 0.2)

    signals = []
    if images >= 0.4:
        signals.append(f"{int(images * 100)}% of image files in common")
    if numbers >= 0.4:
        signals.append(f"{int(numbers * 100)}% of numbers in common")
    if outbound >= 0.4:
        signals.append(f"{int(outbound * 100)}% of outbound links in common")

    if same_language:
        # Same language: shared wording is the strongest evidence there is.
        confidence = max(lexical, structural)
        if lexical >= 0.5:
            signals.append(f"{int(lexical * 100)}% of wording in common (same language)")
        method = "lexical" if lexical >= structural else "structural"
    else:
        confidence = structural
        method = "structural"

    return {"confidence": round(confidence, 3), "method": method, "signals": signals,
            "lexical": round(lexical, 3), "structural": round(structural, 3)}


def group_by_path(pages: list) -> dict:
    """Group fetched pages by their locale-stripped path — the strongest equivalence signal."""
    groups = defaultdict(dict)
    for p in pages:
        if p.get("status") != 200:
            continue
        loc, rest = split_locale_path(urlparse(p["final_url"]).path)
        if not loc:
            continue
        key = rest.rstrip("/") or "/"
        groups[key][loc] = p
    return {k: v for k, v in groups.items() if len(v) > 1}


# ── auditing ──────────────────────────────────────────────────────────────────

def _norm_url(u: str) -> str:
    try:
        p = urlparse(u)
        return f"{p.netloc.lower().replace('www.', '')}{(p.path or '/').rstrip('/') or '/'}"
    except Exception:
        return (u or "").lower()


def audit_group(path_key: str, members: dict) -> dict:
    """Check one set of equivalent pages for missing or broken hreflang annotations.

    `members` maps locale label -> fetched page. Returns the issues found plus the tag block
    the whole group should carry.
    """
    issues = []
    by_norm = {_norm_url(p["final_url"]): loc for loc, p in members.items()}

    annotated = sum(1 for p in members.values() if p["hreflangs"])
    if annotated == 0:
        issues.append({
            "type": "missing_entirely", "severity": "high",
            "detail": f"{len(members)} locale versions of this page exist and none of them "
                      f"declares hreflang, so Google has no signal that they are alternates.",
        })

    for loc, p in members.items():
        tags = p["hreflangs"]
        if not tags:
            if annotated:
                issues.append({"type": "missing_on_page", "severity": "high", "locale": loc,
                               "url": p["final_url"],
                               "detail": "other locales annotate this set, this page declares nothing"})
            continue

        # Self-reference is required; without it Google may ignore the whole set.
        if not any(_norm_url(h) == _norm_url(p["final_url"]) for h in tags.values()):
            issues.append({"type": "missing_self_reference", "severity": "medium", "locale": loc,
                           "url": p["final_url"],
                           "detail": "no hreflang points at this page itself"})

        for code, href in tags.items():
            err = validate_hreflang(code)
            if err:
                issues.append({"type": "invalid_code", "severity": "high", "locale": loc,
                               "url": p["final_url"], "detail": err})

        # Reciprocity: Google discards a pair unless both sides point at each other.
        for other_loc, other in members.items():
            if other_loc == loc:
                continue
            points_out = any(_norm_url(h) == _norm_url(other["final_url"]) for h in tags.values())
            points_back = any(_norm_url(h) == _norm_url(p["final_url"])
                              for h in other["hreflangs"].values())
            if points_out and not points_back:
                issues.append({"type": "not_reciprocal", "severity": "high", "locale": loc,
                               "url": p["final_url"],
                               "detail": f"declares {other_loc} as an alternate, but {other_loc} "
                                         f"does not point back — Google ignores one-way pairs"})
            elif not points_out and annotated:
                issues.append({"type": "missing_alternate", "severity": "medium", "locale": loc,
                               "url": p["final_url"],
                               "detail": f"does not declare the {other_loc} version at "
                                         f"{other['final_url']}"})

        # A canonical pointing at another locale cancels the hreflang set.
        if p["canonical"] and _norm_url(p["canonical"]) != _norm_url(p["final_url"]):
            target = by_norm.get(_norm_url(p["canonical"]))
            if target:
                issues.append({"type": "canonical_conflict", "severity": "high", "locale": loc,
                               "url": p["final_url"],
                               "detail": f"canonical points at the {target} version, which tells "
                                         f"Google to drop this page instead of ranking it in {loc}"})

        # A declared lang that disagrees with the folder is usually a template bug.
        if p["lang"]:
            declared = (p["lang"] or "").replace("_", "-").lower().split("-")[0]
            if declared and declared != loc.split("-")[0].lower():
                issues.append({"type": "lang_mismatch", "severity": "low", "locale": loc,
                               "url": p["final_url"],
                               "detail": f'html lang="{p["lang"]}" but the page sits under /{loc}/'})

    if not any(c.lower() == "x-default" for p in members.values() for c in p["hreflangs"]):
        issues.append({"type": "missing_x_default", "severity": "low",
                       "detail": "no x-default — set one so unmatched languages have a fallback"})

    return {
        "path": path_key,
        "locales": sorted(members.keys()),
        "pages": {loc: {"url": p["final_url"], "title": p["title"], "lang": p["lang"],
                        "canonical": p["canonical"], "hreflangs": p["hreflangs"]}
                  for loc, p in members.items()},
        "issues": issues,
        "severity": ("high" if any(i["severity"] == "high" for i in issues)
                     else "medium" if any(i["severity"] == "medium" for i in issues)
                     else "low" if issues else "ok"),
        "suggested_tags": suggest_tags(members),
    }


def suggest_tags(members: dict) -> list:
    """The reciprocal, self-referencing tag block every page in the group should carry."""
    tags = [{"hreflang": loc, "href": p["final_url"]} for loc, p in sorted(members.items())]
    # x-default belongs on the locale-neutral choice; English is the usual convention, else
    # whichever locale sorts first so the output is at least deterministic.
    default = next((loc for loc in sorted(members) if loc.split("-")[0] == "en"), None)
    if default:
        tags.append({"hreflang": "x-default", "href": members[default]["final_url"]})
    return tags


def tags_to_html(tags: list) -> str:
    return "\n".join(
        f'<link rel="alternate" hreflang="{t["hreflang"]}" href="{t["href"]}" />' for t in tags)
