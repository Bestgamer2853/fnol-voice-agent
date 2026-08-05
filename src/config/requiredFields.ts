import type { Claim } from '../types/claim.js';

export const REQUIRED_FNOL_FIELDS = [
  'policyNumber',
  'callerName',
  'dateOfIncident',
  'timeOfIncident',
  'locationOfIncident',
  'incidentDescription',
  'insuredVehicle',
  'injuriesReported',
  'policeReportFiled',
  'photosAvailable',
  'vehicleDrivable',
] as const satisfies readonly (keyof Claim)[];

export type RequiredFnolField = (typeof REQUIRED_FNOL_FIELDS)[number];

export const CONDITIONAL_FNOL_FIELDS = [
  'injuryDetails',
  'policeReportReference',
  'otherParties',
] as const satisfies readonly (keyof Claim)[];

export type ConditionalFnolField = (typeof CONDITIONAL_FNOL_FIELDS)[number];

export type TrackableFnolField = RequiredFnolField | ConditionalFnolField;

export const SERVICE_FIELDS = [
  'towingRequested',
  'rentalRequested',
] as const satisfies readonly (keyof Claim)[];
