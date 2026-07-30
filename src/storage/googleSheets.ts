import { google } from 'googleapis';
import type { ClaimLoggerService, ClaimLogRecord } from '../services/claimLogger.js';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const moduleDirectory = dirname(fileURLToPath(import.meta.url));

export class GoogleSheetsClaimLogger implements ClaimLoggerService {
  private sheets;
  
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

  async log(record: ClaimLogRecord): Promise<void> {
    try {
      // Format the row data
      const row = [
        record.claimNumber,
        record.timestamp,
        record.verifiedPolicy?.policyNumber ?? 'N/A',
        record.verifiedPolicy?.policyholderName ?? record.claim.callerName ?? 'N/A',
        record.claim.dateOfIncident ?? 'N/A',
        record.claim.timeOfIncident ?? 'N/A',
        record.claim.locationOfIncident ?? 'N/A',
        record.claim.incidentDescription ?? 'N/A',
        record.claim.insuredVehicle?.make ?? 'N/A',
        record.claim.insuredVehicle?.model ?? 'N/A',
        record.claim.insuredVehicle?.registration ?? 'N/A',
        record.claim.injuriesReported ? 'Yes' : 'No',
        record.claim.injuryDetails ?? 'N/A',
        record.claim.policeReportFiled ? 'Yes' : 'No',
        record.claim.policeReportReference ?? 'N/A',
        record.claim.photosAvailable ? 'Yes' : 'No',
        record.claim.vehicleDrivable ? 'Yes' : 'No',
        record.claim.otherParties ?? 'None',
        record.severity,
        record.escalationRequired ? 'Yes' : 'No',
        record.summary
      ];

      // Append to the sheet
      await this.sheets.spreadsheets.values.append({
        spreadsheetId: this.spreadsheetId,
        range: 'Sheet1!A:U', // Assuming the first sheet is named Sheet1
        valueInputOption: 'USER_ENTERED',
        requestBody: {
          values: [row],
        },
      });

      console.log(`Successfully logged claim ${record.claimNumber} to Google Sheets.`);
    } catch (error) {
      console.error(`Failed to log claim ${record.claimNumber} to Google Sheets:`, error);
      // We don't re-throw here to prevent failing the entire claim process if Sheets is down
    }
  }
}
