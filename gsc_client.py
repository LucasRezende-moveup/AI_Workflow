import os.path
import pickle
import time
import random
import logging
from google_auth_oauthlib.flow import InstalledAppFlow
from google.auth.transport.requests import Request
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

SCOPES = [
    'https://www.googleapis.com/auth/webmasters.readonly',
    'https://www.googleapis.com/auth/spreadsheets'
]

class GSCClient:
    def __init__(self, client_secret_path='client_secret.json', token_path='token.pickle'):
        self.client_secret_path = client_secret_path
        self.token_path = token_path
        self.credentials = None
        self.service = None
        self._authenticate()

    def _authenticate(self):
        """Standard boilerplate for Google API authentication."""
        if os.path.exists(self.token_path):
            with open(self.token_path, 'rb') as token:
                self.credentials = pickle.load(token)
        
        if not self.credentials or not self.credentials.valid:
            if self.credentials and self.credentials.expired and self.credentials.refresh_token:
                self.credentials.refresh(Request())
            else:
                flow = InstalledAppFlow.from_client_secrets_file(
                    self.client_secret_path, SCOPES)
                self.credentials = flow.run_local_server(port=0)
            
            with open(self.token_path, 'wb') as token:
                pickle.dump(self.credentials, token)
        
        self.service = build('searchconsole', 'v1', credentials=self.credentials)

    def _execute_with_retry(self, request, max_retries=5):
        """Executes an API request with exponential backoff for rate limits."""
        for n in range(0, max_retries):
            try:
                return request.execute()
            except HttpError as error:
                if error.resp.status in [403, 429, 500, 503]:
                    wait_time = (2 ** n) + random.random()
                    logger.warning(f"API Error {error.resp.status}: {error}. Retrying in {wait_time:.2f} seconds...")
                    time.sleep(wait_time)
                else:
                    logger.error(f"API Error {error.resp.status}: {error}")
                    raise error
        
        raise Exception("Max retries exceeded for GSC API request.")

    def list_properties(self):
        """Lists all GSC properties."""
        try:
            request = self.service.sites().list()
            site_list = self._execute_with_retry(request)
            return site_list.get('siteEntry', [])
        except Exception as e:
            logger.error(f"Failed to list properties: {e}")
            return []

    def get_search_analytics(self, site_url, start_date=None, end_date=None, days=30, dimensions=['query', 'page'], row_limit=25000, progress_callback=None):
        """
        Fetches search analytics data with pagination support.
        """
        import datetime
        
        if not end_date:
            end_date = datetime.date.today().strftime('%Y-%m-%d')
        if not start_date:
            start = datetime.date.today() - datetime.timedelta(days=days)
            start_date = start.strftime('%Y-%m-%d')

        all_rows = []
        start_row = 0
        chunk_size = 5000 # Max limit per single API request

        while start_row < row_limit:
            request_body = {
                'startDate': start_date,
                'endDate': end_date,
                'dimensions': dimensions,
                'rowLimit': chunk_size,
                'startRow': start_row
            }
            
            try:
                request = self.service.searchanalytics().query(siteUrl=site_url, body=request_body)
                response = self._execute_with_retry(request)
                rows = response.get('rows', [])
                
                if not rows:
                    break
                
                all_rows.extend(rows)
                start_row += len(rows)
                
                if progress_callback:
                    # Since we don't know total, we'll just report how many we found so far
                    progress_callback(len(all_rows))
                
                # If we got fewer rows than requested, we reached the end
                if len(rows) < chunk_size:
                    break
                    
            except Exception as e:
                logger.error(f"Failed to fetch search analytics at row {start_row}: {e}")
                break

        # Flatten 'keys' into columns
        processed_rows = []
        for row in all_rows:
            new_row = row.copy()
            for dim in dimensions: new_row[dim] = "N/A"
                
            if 'keys' in row:
                for i, dim in enumerate(dimensions):
                    if i < len(row['keys']):
                        new_row[dim] = row['keys'][i]
                del new_row['keys']
            processed_rows.append(new_row)
        
        return processed_rows

    @staticmethod
    def generate_mock_data(days=30, include_date=False):
        """Generates mock GSC data for demonstration purposes."""
        import random
        import datetime
        
        data = []
        queries = ['seo agent', 'google search console api', 'python seo tools', 'streamlit dashboard', 'ai for seo']
        pages = ['/home', '/blog/gsc-guide', '/tools/agent', '/contact']
        
        if include_date:
            end_date = datetime.date.today()
            for i in range(days):
                date = (end_date - datetime.timedelta(days=i)).strftime('%Y-%m-%d')
                for q in queries:
                    row = {
                        'date': date,
                        'query': q,
                        'page': random.choice(pages),
                        'clicks': random.randint(0, 50),
                        'impressions': random.randint(100, 1000),
                        'ctr': random.uniform(0.01, 0.10),
                        'position': random.uniform(1, 20)
                    }
                    data.append(row)
        else:
            # Aggregated Mock Data
            for q in queries:
                for p in pages:
                    if random.random() > 0.5: # Randomly skip some combos
                        row = {
                            'query': q,
                            'page': p,
                            'clicks': random.randint(100, 500),
                            'impressions': random.randint(1000, 10000),
                            'ctr': random.uniform(0.01, 0.05),
                            'position': random.uniform(1, 15)
                        }
                        data.append(row)
        return data
