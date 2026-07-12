"""
Shared Gemini helpers used by the API and the analysis modules.

Centralizes model selection so `genai.list_models()` (a network round-trip) runs
at most once per process instead of on every request, and gives all callers one
consistent flash-model preference order + generation path.
"""
import os

_FLASH_MODEL_CACHE = None
_CONFIGURED = False

# Preference order — newest/cheapest flash first, then graceful fallbacks
_PREFERRED = [
    'models/gemini-2.5-flash',
    'models/gemini-2.0-flash',
    'models/gemini-1.5-flash',
    'models/gemini-flash-latest',
]
_DEFAULT = 'models/gemini-2.5-flash'


def ensure_configured():
    """Configure the genai client once with GOOGLE_API_KEY (idempotent)."""
    global _CONFIGURED
    if _CONFIGURED:
        return
    import google.generativeai as genai
    api_key = os.getenv("GOOGLE_API_KEY")
    if api_key:
        genai.configure(api_key=api_key)
    _CONFIGURED = True


def get_flash_model():
    """Return a cached preferred Gemini flash model name (lists models at most once per process)."""
    global _FLASH_MODEL_CACHE
    if _FLASH_MODEL_CACHE:
        return _FLASH_MODEL_CACHE
    ensure_configured()
    try:
        import google.generativeai as genai
        available = [m.name for m in genai.list_models()
                     if 'generateContent' in m.supported_generation_methods]
        for target in _PREFERRED:
            if target in available:
                _FLASH_MODEL_CACHE = target
                return _FLASH_MODEL_CACHE
        flash = [m for m in available if 'flash' in m.lower()]
        _FLASH_MODEL_CACHE = flash[0] if flash else (available[0] if available else _DEFAULT)
    except Exception:
        _FLASH_MODEL_CACHE = _DEFAULT
    return _FLASH_MODEL_CACHE


def gemini_generate(prompt):
    """Generate text with the cached flash model. Returns the response text."""
    import google.generativeai as genai
    ensure_configured()
    model = genai.GenerativeModel(get_flash_model())
    return model.generate_content(prompt).text
