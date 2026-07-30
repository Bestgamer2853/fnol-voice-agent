import type { Severity } from '../conversation/types.js';
import type { Claim } from '../types/claim.js';

export interface DetectSeverityInput {
  claim: Claim;
}

export interface DetectSeverityResult {
  severity: Severity;
  escalationRequired: boolean;
  reasons: string[];
}

export interface DetectSeverityService {
  detect(input: DetectSeverityInput): DetectSeverityResult | Promise<DetectSeverityResult>;
}

const AMBULANCE_TERMS = ['ambulance', 'paramedic', 'emergency medical'];
const ROLLOVER_TERMS = ['rollover', 'rolled over', 'overturned', 'flipped'];
const FIRE_TERMS = ['fire', 'smoke', 'burning', 'flames'];
const MULTIPLE_VEHICLE_TERMS = [
  'two cars',
  'three cars',
  'multiple vehicles',
  'another vehicle',
  'other vehicle',
  'other car',
  'third vehicle',
];

function normalizeText(value: string | undefined): string {
  return value?.toLowerCase() ?? '';
}

function includesAny(value: string, terms: readonly string[]): boolean {
  return terms.some((term) => value.includes(term));
}

function hasOtherParties(claim: Claim): boolean {
  return typeof claim.otherParties === 'string' && claim.otherParties.trim().length > 0;
}

export function detectSeverity(input: DetectSeverityInput): DetectSeverityResult {
  const { claim } = input;
  const description = normalizeText(claim.incidentDescription);
  const injuryDetails = normalizeText(claim.injuryDetails);
  const combinedNarrative = `${description} ${injuryDetails}`;
  const reasons: string[] = [];

  if (claim.injuriesReported === true) {
    reasons.push('Injuries were reported.');
  }

  if (includesAny(combinedNarrative, AMBULANCE_TERMS)) {
    reasons.push('Ambulance or emergency medical support was mentioned.');
  }

  if (claim.policeReportFiled === true || Boolean(claim.policeReportReference?.trim())) {
    reasons.push('Police involvement was reported.');
  }

  if (claim.vehicleDrivable === false) {
    reasons.push('The insured vehicle is not drivable.');
  }

  if (includesAny(description, ROLLOVER_TERMS)) {
    reasons.push('The incident involved a rollover or overturned vehicle.');
  }

  if (includesAny(description, FIRE_TERMS)) {
    reasons.push('Fire, smoke, burning, or flames were mentioned.');
  }

  if (hasOtherParties(claim) || includesAny(description, MULTIPLE_VEHICLE_TERMS)) {
    reasons.push('Multiple vehicles or other parties were involved.');
  }

  const highSeverityReasonPrefixes = [
    'Injuries',
    'Ambulance',
    'The incident involved a rollover',
    'Fire',
  ];
  const hasHighSeverityReason = reasons.some((reason) =>
    highSeverityReasonPrefixes.some((prefix) => reason.startsWith(prefix)),
  );
  const severity: Severity = hasHighSeverityReason
    ? 'high'
    : reasons.length > 0
      ? 'medium'
      : 'low';

  return {
    severity,
    escalationRequired: severity === 'high',
    reasons,
  };
}

export function createDetectSeverityService(): DetectSeverityService {
  return {
    detect: detectSeverity,
  };
}
