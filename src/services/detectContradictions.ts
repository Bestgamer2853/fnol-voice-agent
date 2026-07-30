import type { TrackableFnolField } from '../config/requiredFields.js';
import type { Claim } from '../types/claim.js';

export interface DetectContradictionsInput {
  previousClaim: Claim;
  updatedClaim: Claim;
}

export interface DetectContradictionsResult {
  contradictions: ClaimContradiction[];
}

export interface DetectContradictionsService {
  detect(
    input: DetectContradictionsInput,
  ): DetectContradictionsResult | Promise<DetectContradictionsResult>;
}

export interface ClaimContradiction {
  field: TrackableFnolField;
  description: string;
  priorValue: string;
  newValue: string;
}

type ComparableClaimField =
  | 'policyNumber'
  | 'callerName'
  | 'dateOfIncident'
  | 'timeOfIncident'
  | 'locationOfIncident'
  | 'incidentDescription'
  | 'insuredVehicle'
  | 'injuriesReported'
  | 'injuryDetails'
  | 'policeReportFiled'
  | 'policeReportReference'
  | 'photosAvailable'
  | 'vehicleDrivable'
  | 'otherParties';

const COMPARABLE_FIELDS = [
  'policyNumber',
  'callerName',
  'dateOfIncident',
  'timeOfIncident',
  'locationOfIncident',
  'incidentDescription',
  'insuredVehicle',
  'injuriesReported',
  'injuryDetails',
  'policeReportFiled',
  'policeReportReference',
  'photosAvailable',
  'vehicleDrivable',
  'otherParties',
] as const satisfies readonly ComparableClaimField[];

const FIELD_LABELS: Record<ComparableClaimField, string> = {
  policyNumber: 'policy number',
  callerName: 'caller name',
  dateOfIncident: 'incident date',
  timeOfIncident: 'incident time',
  locationOfIncident: 'incident location',
  incidentDescription: 'incident description',
  insuredVehicle: 'insured vehicle',
  injuriesReported: 'injury status',
  injuryDetails: 'injury details',
  policeReportFiled: 'police report status',
  policeReportReference: 'police report reference',
  photosAvailable: 'photo availability',
  vehicleDrivable: 'vehicle drivable status',
  otherParties: 'other parties',
};

function normalizeOptionalText(value: string | undefined): string | undefined {
  const normalized = value?.trim().replace(/\s+/g, ' ');
  return normalized && normalized.length > 0 ? normalized : undefined;
}

function normalizeBoolean(value: boolean | undefined): string | undefined {
  return typeof value === 'boolean' ? String(value) : undefined;
}

function normalizeVehicle(value: Claim['insuredVehicle']): string | undefined {
  if (!value) {
    return undefined;
  }

  const make = normalizeOptionalText(value.make);
  const model = normalizeOptionalText(value.model);
  const registration = normalizeOptionalText(value.registration);

  if (!make && !model && !registration) {
    return undefined;
  }

  return JSON.stringify({
    make,
    model,
    registration,
  });
}

function normalizedFieldValue(
  claim: Claim,
  field: ComparableClaimField,
): string | undefined {
  switch (field) {
    case 'policyNumber':
    case 'callerName':
    case 'dateOfIncident':
    case 'timeOfIncident':
    case 'locationOfIncident':
    case 'incidentDescription':
    case 'injuryDetails':
    case 'policeReportReference':
    case 'otherParties':
      return normalizeOptionalText(claim[field]);
    case 'insuredVehicle':
      return normalizeVehicle(claim.insuredVehicle);
    case 'injuriesReported':
    case 'policeReportFiled':
    case 'photosAvailable':
    case 'vehicleDrivable':
      return normalizeBoolean(claim[field]);
  }
}

function toDisplayValue(value: string): string {
  if (value === 'true') {
    return 'yes';
  }

  if (value === 'false') {
    return 'no';
  }

  return value;
}

export function detectContradictions(
  input: DetectContradictionsInput,
): DetectContradictionsResult {
  const contradictions: ClaimContradiction[] = [];

  for (const field of COMPARABLE_FIELDS) {
    const priorValue = normalizedFieldValue(input.previousClaim, field);
    const newValue = normalizedFieldValue(input.updatedClaim, field);

    if (
      priorValue === undefined ||
      newValue === undefined ||
      priorValue === newValue
    ) {
      continue;
    }

    contradictions.push({
      field,
      description: `The ${FIELD_LABELS[field]} changed from "${toDisplayValue(priorValue)}" to "${toDisplayValue(newValue)}".`,
      priorValue: toDisplayValue(priorValue),
      newValue: toDisplayValue(newValue),
    });
  }

  return { contradictions };
}

export function createDetectContradictionsService(): DetectContradictionsService {
  return {
    detect: detectContradictions,
  };
}
