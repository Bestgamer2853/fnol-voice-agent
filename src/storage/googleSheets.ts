import { google } from 'googleapis';
import type { ClaimLoggerService, ClaimLogRecord } from '../services/claimLogger.js';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const moduleDirectory = dirname(fileURLToPath(import.meta.url));

const HEADERS = [
  'Claim ID',
  'Timestamp',
  'Policy Number',
  'Policyholder',
  'Policy Verified',
  'Incident Date',
  'Incident Time',
  'Incident Location',
  'Incident Description',
  'Vehicle Make',
  'Vehicle Model',
  'Registration Number',
  'Other Vehicle',
  'Other Party',
  'Injuries',
  'Police Report Filed',
  'Police Report Number',
  'Photos Available',
  'Vehicle Drivable',
  'Severity',
  'Escalation Required',
  'Recommended Services',
  'Conversation Summary'
];

export class GoogleSheetsClaimLogger implements ClaimLoggerService {
  private sheets;
  private initialized = false;
  
  constructor(
    private readonly spreadsheetId: string,
    private readonly credentialsPath: string = join(moduleDirectory, '../../google-credentials.json')
  ) {
    let authOptions: any = { scopes: ['https://www.googleapis.com/auth/spreadsheets'] };
    
    if (process.env.GOOGLE_CREDENTIALS_JSON) {
      try {
        authOptions.credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON);
      } catch (e) {
        console.error('Failed to parse GOOGLE_CREDENTIALS_JSON environment variable');
      }
    } else {
      authOptions.keyFile = this.credentialsPath;
    }

    const auth = new google.auth.GoogleAuth(authOptions);
    this.sheets = google.sheets({ version: 'v4', auth });
  }

  private async initializeSheet(): Promise<void> {
    if (this.initialized) return;

    try {
      console.log('Checking Google Sheets initialization status...');
      const range = `Sheet1!A1:${String.fromCharCode(64 + HEADERS.length)}1`; // 'A1:W1'
      
      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId: this.spreadsheetId,
        range,
      });

      const values = response.data.values;
      const isEmpty = !values || values.length === 0;
      const isAlreadyInitialized = !isEmpty && values?.[0]?.[0] === HEADERS[0];
      const isPopulatedWithoutHeaders = !isEmpty && values?.[0]?.[0] !== HEADERS[0];

      if (isAlreadyInitialized) {
        console.log('Sheet is already initialized with headers. Skipping format.');
        this.initialized = true;
        return;
      }

      console.log(`Sheet state: Empty=${isEmpty}, PopulatedWithoutHeaders=${isPopulatedWithoutHeaders}`);

      // Get sheetId for batch updates
      const spreadsheet = await this.sheets.spreadsheets.get({
          spreadsheetId: this.spreadsheetId
      });
      const sheetId = spreadsheet.data.sheets?.[0]?.properties?.sheetId || 0;
      
      const batchRequests: any[] = [];

      if (isPopulatedWithoutHeaders) {
        console.log('Existing claim data detected without headers. Shifting data down...');
        batchRequests.push({
          insertDimension: {
            range: {
              sheetId: sheetId,
              dimension: 'ROWS',
              startIndex: 0,
              endIndex: 1,
            },
            inheritFromBefore: false,
          }
        });
      }

      // Add formatting requests
      batchRequests.push(
        {
          updateSheetProperties: {
            properties: {
              sheetId: sheetId,
              gridProperties: { frozenRowCount: 1 },
            },
            fields: 'gridProperties.frozenRowCount',
          },
        },
        {
          repeatCell: {
            range: {
              sheetId: sheetId,
              startRowIndex: 0,
              endRowIndex: 1,
              startColumnIndex: 0,
              endColumnIndex: HEADERS.length,
            },
            cell: {
              userEnteredFormat: {
                backgroundColor: { red: 0.2, green: 0.2, blue: 0.2 },
                textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 } },
              },
            },
            fields: 'userEnteredFormat(backgroundColor,textFormat)',
          },
        },
        {
          autoResizeDimensions: {
            dimensions: {
              sheetId: sheetId,
              dimension: 'COLUMNS',
              startIndex: 0,
              endIndex: HEADERS.length,
            },
          },
        }
      );

      console.log('Executing batchUpdate to set up headers and formatting...');
      await this.sheets.spreadsheets.batchUpdate({
        spreadsheetId: this.spreadsheetId,
        requestBody: {
          requests: batchRequests,
        },
      });

      console.log('Writing header values to Row 1...');
      await this.sheets.spreadsheets.values.update({
        spreadsheetId: this.spreadsheetId,
        range,
        valueInputOption: 'USER_ENTERED',
        requestBody: {
          values: [HEADERS],
        },
      });

      console.log('Google Sheets initialization complete!');
      this.initialized = true;
    } catch (e) {
      console.error('Failed to initialize Google Sheets headers:', e);
    }
  }

  async log(record: ClaimLogRecord): Promise<void> {
    try {
      await this.initializeSheet();

      // Format the row data
      const row = [
        record.claimNumber,
        record.timestamp,
        record.verifiedPolicy?.policyNumber ?? 'N/A',
        record.verifiedPolicy?.policyholderName ?? record.claim.callerName ?? 'N/A',
        record.verifiedPolicy ? 'Yes' : 'No',
        record.claim.dateOfIncident ?? 'N/A',
        record.claim.timeOfIncident ?? 'N/A',
        record.claim.locationOfIncident ?? 'N/A',
        record.claim.incidentDescription ?? 'N/A',
        record.claim.insuredVehicle?.make ?? 'N/A',
        record.claim.insuredVehicle?.model ?? 'N/A',
        record.claim.insuredVehicle?.registration ?? 'N/A',
        'N/A', // Other Vehicle
        record.claim.otherParties ?? 'None',
        record.claim.injuriesReported ? (record.claim.injuryDetails ? `Yes - ${record.claim.injuryDetails}` : 'Yes') : 'No',
        record.claim.policeReportFiled ? 'Yes' : 'No',
        record.claim.policeReportReference ?? 'N/A',
        record.claim.photosAvailable ? 'Yes' : 'No',
        record.claim.vehicleDrivable ? 'Yes' : 'No',
        record.severity ?? 'N/A',
        record.escalationRequired ? 'Yes' : 'No',
        record.claim.recommendedServices?.join(', ') ?? 'None',
        record.summary
      ];

      const endCol = String.fromCharCode(64 + HEADERS.length);

      // Append to the sheet
      await this.sheets.spreadsheets.values.append({
        spreadsheetId: this.spreadsheetId,
        range: `Sheet1!A:${endCol}`,
        valueInputOption: 'USER_ENTERED',
        requestBody: {
          values: [row],
        },
      });

      console.log(`Successfully logged claim ${record.claimNumber} to Google Sheets.`);
    } catch (error) {
      console.error(`Failed to log claim ${record.claimNumber} to Google Sheets:`, error);
      throw error;
    }
  }
}
