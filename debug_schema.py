import requests
from bs4 import BeautifulSoup
import json
import sys

def test_scrape_schema(url):
    print(f"Scraping: {url}")
    headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'}
    try:
        response = requests.get(url, headers=headers, timeout=15)
        response.raise_for_status()
        soup = BeautifulSoup(response.text, 'lxml')
        
        scripts = soup.find_all('script', type='application/ld+json')
        print(f"Found {len(scripts)} JSON-LD blocks.")
        
        for i, script in enumerate(scripts):
            try:
                data = json.loads(script.string)
                print(f"\nBlock {i+1}:")
                if isinstance(data, dict):
                    if '@graph' in data:
                        print(f"  - CONTAINS @GRAPH with {len(data['@graph'])} items")
                        for item in data['@graph']:
                            print(f"    - Type: {item.get('@type')}")
                    else:
                        print(f"  - Type: {data.get('@type')}")
                elif isinstance(data, list):
                    print(f"  - IS LIST with {len(data)} items")
                    for item in data:
                        print(f"    - Type: {item.get('@type')}")
            except Exception as e:
                print(f"  - Failed to parse block {i+1}: {e}")
                
    except Exception as e:
        print(f"General Error: {e}")

if __name__ == "__main__":
    target = sys.argv[1] if len(sys.argv) > 1 else "https://theplayoffs.news/mx/mejores-casinos-en-linea/"
    test_scrape_schema(target)
