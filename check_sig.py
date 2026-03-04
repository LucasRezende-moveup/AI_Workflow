import inspect
from gsc_client import GSCClient

def check():
    client = GSCClient()
    sig = inspect.signature(client.get_search_analytics)
    print(f"Signature: {sig}")
    if 'progress_callback' in sig.parameters:
        print("Success: progress_callback found.")
    else:
        print("Error: progress_callback NOT found.")

if __name__ == "__main__":
    check()
