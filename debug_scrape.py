import requests
import sys

def diagnose(url):
    print(f"Diagnosing URL: {url}")
    if not url.startswith('http'):
        url = 'https://' + url
    
    headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'}
    
    try:
        print("Attempting GET request...")
        response = requests.get(url, headers=headers, timeout=15)
        print(f"Status Code: {response.status_code}")
        response.raise_for_status()
        print("Success!")
    except requests.exceptions.SSLError as e:
        print(f"SSL ERROR: {e}")
    except requests.exceptions.ConnectionError as e:
        print(f"CONNECTION ERROR: {e}")
    except requests.exceptions.HTTPError as e:
        print(f"HTTP ERROR: {e}")
    except Exception as e:
        print(f"GENERAL ERROR: {e}")

if __name__ == "__main__":
    test_url = "https://www.google.com" # Default test
    if len(sys.argv) > 1:
        test_url = sys.argv[1]
    diagnose(test_url)
