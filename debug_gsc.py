from gsc_client import GSCClient
import os

def test_fetch():
    secret = 'client_secret.json'
    if not os.path.exists(secret):
        print(f"Error: {secret} not found")
        return
        
    client = GSCClient(secret)
    props = client.list_properties()
    if not props:
        print("No properties found.")
        return
        
    site_url = props[0]['siteUrl']
    print(f"Testing fetch for: {site_url}")
    
    data = client.get_search_analytics(site_url, days=3)
    print(f"Fetched {len(data)} rows.")
    if data:
        print("Sample row:", data[0])
    else:
        print("Empty data returned.")

if __name__ == "__main__":
    test_fetch()
