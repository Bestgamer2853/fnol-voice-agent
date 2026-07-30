import type { Severity } from '../conversation/types.js';
import type { Vehicle } from './common.js';

export interface Claim {
  claimReferenceNumber?: string;
  policyNumber?: string;
  callerName?: string;
  dateOfIncident?: string;
  timeOfIncident?: string;
  locationOfIncident?: string;
  incidentDescription?: string;
  insuredVehicle?: Vehicle;
  otherParties?: string;
  injuriesReported?: boolean;
  injuryDetails?: string;
  policeReportFiled?: boolean;
  policeReportReference?: string;
  photosAvailable?: boolean;
  vehicleDrivable?: boolean;
  recommendedServices?: string[];
  callSummary?: string;
  severityClassification?: Severity;
}
