from serp_utils import fetch_serp_results
import json

def test_geolocation():
    locations = [
        "Brazil (São Paulo)",
        "Brazil (Rio de Janeiro)",
        "United States"
    ]
    
    query = "restaurantes proximos"
    
    for loc in locations:
        print(f"\n--- Testing Geolocation: {loc} ---")
        results = fetch_serp_results(query, location_name=loc)
        
        if isinstance(results, dict) and "error" in results:
            print(f"Error: {results['error']}")
        else:
            organic = results.get("organic", [])
            print(f"Results Found: {len(organic)}")
            for i, res in enumerate(organic):
                print(f"  {i+1}. {res['title']} ({res['link']})")

if __name__ == "__main__":
    test_geolocation()
