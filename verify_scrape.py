from comparator import scrape_url
import json
import sys

def verify(url):
    print(f"Testing refactored scrape_url for: {url}")
    result = scrape_url(url)
    if result.get('error'):
        print(f"Error: {result['error']}")
    else:
        print(f"Title: {result['title']}")
        print(f"Found {len(result['schemas_detailed'])} schema entities.")
        for i, s in enumerate(result['schemas_detailed']):
            print(f"  Entity {i+1}: {s}")

if __name__ == "__main__":
    target = sys.argv[1] if len(sys.argv) > 1 else "https://theplayoffs.news/mx/mejores-casinos-en-linea/"
    verify(target)
