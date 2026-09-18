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

# Folder names people use for a country that are not its ISO region code.
_FOLDER_REGION_ALIAS = {"uk": "GB", "eu": "EU", "cn": "CN", "jp": "JP", "kr": "KR"}

_HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; MoveupSEOBot/1.0; +hreflang-checker)"}


# ── locale detection ──────────────────────────────────────────────────────────

def parse_locale(token: str):
    """Is this path segment a locale folder? Returns (lang, region) or None.

    Three shapes are accepted, because real sites use all of them:
      `pt`, `pt-br`, `pt_BR`   a language, optionally with a region
      `cl`, `mx`, `us`         a *region only* — extremely common ("/cl/" for Chile), and
                               invisible to a language-code-only check
      `int-en`, `en-int`       an "international" catch-all some CMSs emit

    A region-only folder yields (None, REGION): the language is unknown from the path alone
    and is resolved later from the page's own html lang, which is authoritative. That also
    settles the genuinely ambiguous segments — `/ca/` is Catalan by ISO and Canada by
    intention, and only the page can say which.
    """
    if not token:
        return None
    t = token.strip().strip("/").replace("_", "-").lower()
    if not t or len(t) > 7:
        return None
    parts = t.split("-")

    # int-en / en-int — treat the language half as the locale, ignore the "int" marker
    if len(parts) == 2 and "int" in parts:
        other = parts[0] if parts[1] == "int" else parts[1]
        if other in _LANGS:
            return (other, "INT")
        return None

    if parts[0] in _LANGS:
        if len(parts) == 1:
            return (parts[0], None)
        if len(parts) == 2 and parts[1].upper() in _REGIONS:
            return (parts[0], parts[1].upper())
        # not a country — fall through to the subdivision shape below

    # Region-only folder
    if len(parts) == 1 and (parts[0].upper() in _REGIONS
                            or parts[0] in _FOLDER_REGION_ALIAS):
        return (None, _FOLDER_REGION_ALIAS.get(parts[0], parts[0].upper()))

    # Country plus subdivision, e.g. /ca-on/ for Ontario. The language is unknowable from the
    # path, so it is left for the page's html lang to supply.
    if (len(parts) == 2 and 2 <= len(parts[1]) <= 3 and parts[1].isalpha()
            and (parts[0] in _LANGS or parts[0].upper() in _REGIONS
                 or parts[0] in _FOLDER_REGION_ALIAS)):
        return (None, t.upper())
    return None


def locale_label(lang: str, region: str) -> str:
    """A display label for a locale folder. A region-only folder is shown as "/cl/" until the
    page's html lang fills the language in, so it is never silently mislabelled."""
    if lang and region:
        return f"{lang}-{region}"
    if lang:
        return lang
    return f"/{(region or '').lower()}/"


def reconcile_locale(folder_label: str, html_lang: str) -> dict:
    """Decide a page's real locale from its folder and its declared html lang.

    The page wins. A folder called /cl/ says nothing about language on its own; a page there
    declaring es-CL settles it. Where both are present and disagree on the *language*, that is
    a genuine template bug worth reporting — but a region-only folder disagreeing with a
    language is not a bug at all, just an under-specified path.
    """
    declared = (html_lang or "").strip().replace("_", "-")
    parsed = parse_locale(folder_label.strip("/")) if folder_label else None
    folder_lang = parsed[0] if parsed else None
    folder_region = parsed[1] if parsed else None

    out = {"label": folder_label, "source": "folder", "mismatch": None}
    if not declared:
        return out

    dparts = declared.split("-")
    dlang = dparts[0].lower() if dparts[0].lower() in _LANGS else None
    dregion = dparts[1].upper() if len(dparts) > 1 and dparts[1].upper() in _REGIONS else None

    if not dlang:
        return out

    if folder_lang is None:
        # Region-only folder: the page supplies the language, and its region wins over the
        # folder's — a subdivision folder like /ca-on/ is not a valid hreflang region, but the
        # page's en-CA is.
        region = dregion or folder_region
        if region and "-" in region:
            head = region.split("-")[0]
            region = head if head in _REGIONS else None
        out["label"] = f"{dlang}-{region}" if region else dlang
        out["source"] = "html lang + folder"
        return out

    if dlang != folder_lang:
        # Segments that are both a language and a region are the real trap: /ca/ is Catalan by
        # ISO and Canada by intention, /br/ is Breton and Brazil. When the page's own region
        # matches the segment, the folder plainly means the country — reading it as a language
        # would mislabel the locale and raise a bug report about a page that is correct.
        seg = folder_label.strip("/").upper()
        seg = _FOLDER_REGION_ALIAS.get(seg.lower(), seg)
        if seg in _REGIONS and dregion == seg:
            out["label"] = f"{dlang}-{dregion}"
            out["source"] = "html lang (folder is a region code)"
            return out
        out["mismatch"] = f'html lang="{declared}" but the page sits under /{folder_label}/'
    return out


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
    """Collect page URLs from robots.txt-declared sitemaps, falling back to the usual paths.

    The budget is divided across every declared sitemap and then across each index's children,
    because multilingual sites routinely publish one sitemap index *per locale*
    (/fr/sitemap_index.xml, /mx/sitemap_index.xml, ...). Draining them in order and stopping at
    the cap is what made a nine-locale site look monolingual.
    """
    import xml.etree.ElementTree as ET

    roots, tried, notes = [], [], []

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

    def _locs(root):
        return [el.text.strip() for el in root.iter()
                if (el.tag.endswith("}loc") or el.tag == "loc") and el.text and el.text.strip()]

    try:
        r = session.get(urljoin(base, "/robots.txt"), headers=_HEADERS, timeout=timeout)
        if r.ok:
            for line in r.text.splitlines():
                if line.lower().startswith("sitemap:"):
                    roots.append(line.split(":", 1)[1].strip())
    except Exception:
        pass
    if roots:
        notes.append(f"robots.txt declares {len(roots)} sitemap(s)")
    else:
        roots = [urljoin(base, p) for p in
                 ("/sitemap.xml", "/sitemap_index.xml", "/sitemap-index.xml", "/wp-sitemap.xml")]

    roots = roots[:20]
    urls, seen, indexes = [], set(), []
    per_root = max(60, cap // max(len(roots), 1))

    def _take(root_xml, budget):
        """Pull up to `budget` URLs out of one urlset, newest first as published."""
        got = 0
        for u in _locs(root_xml):
            if got >= budget or len(urls) >= cap:
                break
            if u not in seen:
                seen.add(u); urls.append(u); got += 1
        return got

    for sm in roots:
        if len(urls) >= cap:
            break
        root = _get_xml(sm)
        if root is None:
            continue
        budget = min(per_root, cap - len(urls))
        is_index = any(el.tag.endswith("}sitemap") or el.tag == "sitemap" for el in root)
        if not is_index:
            _take(root, budget)
            continue

        children = _locs(root)
        indexes.append({"sitemap": sm, "children": len(children)})
        # Children are usually grouped by post type or date, so each locale clusters into a run
        # of files. Evenly spaced children keep every cluster represented inside the budget.
        max_children = 40
        sample = children
        if len(children) > max_children:
            step = len(children) / max_children
            sample = [children[int(i * step)] for i in range(max_children)]
        per_child = max(20, budget // max(len(sample), 1))
        for child in sample:
            if len(urls) >= cap or budget <= 0:
                break
            croot = _get_xml(child)
            if croot is None:
                continue
            budget -= _take(croot, min(per_child, budget))

    return {"urls": urls, "sitemaps_tried": tried, "indexes": indexes,
            "roots": roots, "notes": notes}


_WORD_RE = re.compile(r"[^\W\d_]{3,}", re.UNICODE)
_NUM_RE = re.compile(r"\d[\d.,:/-]{1,}")


def fetch_page(url: str, session, timeout: int = 15) -> dict:
    """Fetch one page and extract everything the matcher and the audit need."""
    from bs4 import BeautifulSoup

    out = {"url": url, "status": None, "error": None, "hreflangs": {}, "lang": None,
           "canonical": None, "title": "", "h1": "", "words": set(), "images": set(),
           "numbers": set(), "outbound": set(), "internal": set(), "final_url": url}
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
        absolute = urljoin(r.url, a["href"])
        parts = urlparse(absolute)
        h = parts.netloc.lower().replace("www.", "")
        if h and h != host:
            out["outbound"].add(h)
        elif h == host and parts.scheme in ("http", "https"):
            out["internal"].add(absolute.split("#")[0])

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
        path_loc, rest = split_locale_path(urlparse(p["final_url"]).path)
        # Prefer the locale already reconciled against the page's html lang; fall back to the
        # folder. Without this, /cl/ and /mx/ pages would regroup under their raw folder names
        # and lose the language the page itself declared.
        loc = p.get("locale") or path_loc
        if not loc:
            continue
        key = p.get("rest") or (rest.rstrip("/") or "/")
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

        # A declared lang that disagrees with the folder is usually a template bug — but only
        # when the folder really states a language. reconcile_locale() has already decided
        # that, so a region-only folder like /cl/ is not reported here.
        if p.get("locale_mismatch"):
            issues.append({"type": "lang_mismatch", "severity": "low", "locale": loc,
                           "url": p["final_url"], "detail": p["locale_mismatch"]})

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
    """The reciprocal, self-referencing tag block every page in the group should carry.

    An "international" locale (an /int-en/ style folder) has no valid hreflang region — INT is
    not ISO — so it is emitted as the bare language, or, when a real locale already claims that
    language, as x-default alone. That is what such a page is for, and it keeps this function
    from suggesting a tag that validate_hreflang() would reject.
    """
    plain, intl = {}, {}
    for loc, p in members.items():
        (intl if loc.upper().endswith("-INT") else plain)[loc] = p

    tags, claimed = [], set()
    for loc, p in sorted(plain.items()):
        tags.append({"hreflang": loc, "href": p["final_url"]})
        claimed.add(loc.split("-")[0].lower())

    default_href = None
    for loc, p in sorted(intl.items()):
        lang = loc.split("-")[0].lower()
        if lang not in claimed:
            tags.append({"hreflang": lang, "href": p["final_url"]})
            claimed.add(lang)
        # Either way an international edition is the natural fallback.
        default_href = default_href or p["final_url"]

    if not default_href:
        # Otherwise prefer an English locale, else the first by sort order, so output is stable.
        pick = (next((l for l in sorted(plain) if l.split("-")[0] == "en"), None)
                or (sorted(plain)[0] if plain else None))
        default_href = plain[pick]["final_url"] if pick else None
    if default_href:
        tags.append({"hreflang": "x-default", "href": default_href})
    return tags


def tags_to_html(tags: list) -> str:
    return "\n".join(
        f'<link rel="alternate" hreflang="{t["hreflang"]}" href="{t["href"]}" />' for t in tags)

# Locale folders worth probing when the sitemap does not mention any. Deliberately short: each
# entry is one request, and the aim is to catch an edition that exists but was never sitemapped
# — a real pattern, and invisible to a sitemap-only crawl.
_PROBE_SEGMENTS = [
    "us", "uk", "gb", "ie", "au", "ca", "nz", "za", "in", "br", "mx", "es", "ar", "cl", "co",
    "pt", "fr", "de", "it", "nl", "en", "int-en", "eu",
]


def probe_locale_roots(base: str, session, known: set, root_lang: str, timeout: int = 12) -> list:
    """Look for locale sections that respond but are absent from the sitemap.

    A section counts only if it declares a different html lang than the site root — otherwise
    /us/ is just a page about the United States.
    """
    found = []
    root_norm = (root_lang or "").strip().lower()
    for seg in _PROBE_SEGMENTS:
        label_guess = parse_locale(seg)
        if not label_guess:
            continue
        if locale_label(*label_guess) in known or seg in known:
            continue
        url = urljoin(base, f"/{seg}/")
        try:
            r = session.get(url, headers=_HEADERS, timeout=timeout, allow_redirects=True)
        except Exception:
            continue
        if not r.ok or "html" not in (r.headers.get("Content-Type") or "").lower():
            continue
        # A redirect away from the folder means it is not a section of its own.
        if f"/{seg}/" not in urlparse(r.url).path.lower():
            continue
        from bs4 import BeautifulSoup
        tag = BeautifulSoup(r.text, "html.parser").find("html")
        lang = ((tag.get("lang") if tag else "") or "").strip()
        if not lang or lang.strip().lower() == root_norm:
            continue
        rec = reconcile_locale(locale_label(*label_guess), lang)
        found.append({"segment": seg, "label": rec["label"], "html_lang": lang,
                      "url": r.url, "in_sitemap": False})
    return found


def urls_for_locale_root(base: str, segment: str, session, cap: int = 40, timeout: int = 15) -> list:
    """Get a sample of URLs inside a locale section that the main sitemap omits.

    Tries that section's own sitemap first — many CMSs publish one per locale even when
    robots.txt does not list it — then falls back to the links on its landing page.
    """
    for candidate in (f"/{segment}/sitemap_index.xml", f"/{segment}/sitemap.xml",
                      f"/sitemap_{segment}.xml"):
        disc = discover_sitemap_urls(urljoin(base, candidate), session, timeout=timeout, cap=cap)
        inside = [u for u in disc["urls"] if f"/{segment}/" in urlparse(u).path.lower()]
        if inside:
            return inside[:cap]

    page = fetch_page(urljoin(base, f"/{segment}/"), session, timeout=timeout)
    links = [u for u in page.get("internal", set())
             if f"/{segment}/" in urlparse(u).path.lower()]
    return sorted(set(links))[:cap]
