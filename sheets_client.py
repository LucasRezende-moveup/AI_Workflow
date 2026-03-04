import logging
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError

logger = logging.getLogger(__name__)

class SheetsClient:
    def __init__(self, credentials):
        self.credentials = credentials
        self.service = build('sheets', 'v4', credentials=self.credentials)

    def create_spreadsheet(self, title):
        """Creates a new Google Spreadsheet."""
        try:
            spreadsheet = {
                'properties': {
                    'title': title
                }
            }
            spreadsheet = self.service.spreadsheets().create(body=spreadsheet, fields='spreadsheetId').execute()
            return spreadsheet.get('spreadsheetId')
        except HttpError as error:
            logger.error(f"An error occurred while creating spreadsheet: {error}")
            return None

    def write_matrix(self, spreadsheet_id, df):
        """Writes a DataFrame to the spreadsheet as a matrix."""
        try:
            # Prepare data: Header + Rows
            header = [df.index.name or "From / To"] + list(df.columns)
            values = [header]
            for index, row in df.iterrows():
                values.append([index] + list(row.values))

            body = {
                'values': values
            }
            
            range_name = 'Sheet1!A1' # Default sheet name is usually Sheet1
            result = self.service.spreadsheets().values().update(
                spreadsheetId=spreadsheet_id, 
                range=range_name,
                valueInputOption='RAW', 
                body=body
            ).execute()
            
            return result
        except HttpError as error:
            logger.error(f"An error occurred while writing to spreadsheet: {error}")
            return None
