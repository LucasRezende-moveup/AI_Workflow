
import unittest
from unittest.mock import MagicMock, patch
from googleapiclient.errors import HttpError
from gsc_client import GSCClient
import httplib2

class TestGSCRetry(unittest.TestCase):
    def test_retry_logic_success(self):
        """Test that it returns result on success."""
        client = GSCClient(client_secret_path='dummy.json') 
        # Mock credentials to avoid real auth flow
        client.credentials = MagicMock()
        client.credentials.valid = True
        
        mock_request = MagicMock()
        mock_request.execute.return_value = {'rows': []}
        
        result = client._execute_with_retry(mock_request)
        self.assertEqual(result, {'rows': []})
        self.assertEqual(mock_request.execute.call_count, 1)

    @patch('time.sleep') # Mock sleep to speed up tests
    def test_retry_on_503(self, mock_sleep):
        """Test that it retries on 503 error."""
        client = GSCClient(client_secret_path='dummy.json')
        client.credentials = MagicMock()
        
        mock_request = MagicMock()
        
        # Create a mock HttpError
        resp = httplib2.Response({'status': 503})
        error = HttpError(resp, b'Service Unavailable')
        
        # Fail twice, then succeed
        mock_request.execute.side_effect = [error, error, {'rows': ['success']}]
        
        result = client._execute_with_retry(mock_request)
        self.assertEqual(result, {'rows': ['success']})
        self.assertEqual(mock_request.execute.call_count, 3)

    @patch('time.sleep')
    def test_max_retries_exceeded(self, mock_sleep):
        """Test that it raises exception after max retries."""
        client = GSCClient(client_secret_path='dummy.json')
        client.credentials = MagicMock()
        
        mock_request = MagicMock()
        resp = httplib2.Response({'status': 503})
        error = HttpError(resp, b'Service Unavailable')
        
        mock_request.execute.side_effect = error
        
        with self.assertRaises(Exception) as context:
            client._execute_with_retry(mock_request, max_retries=3)
        
        self.assertIn("Max retries exceeded", str(context.exception))
        self.assertEqual(mock_request.execute.call_count, 3)

if __name__ == '__main__':
    # We need to mock the __init__ authentication part or just mock the whole client creation
    # simpler to just patch the _authenticate method to do nothing
    with patch.object(GSCClient, '_authenticate', return_value=None):
        unittest.main()
