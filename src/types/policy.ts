import type { Vehicle } from './common.js';

export type CoverageType = 'Comprehensive' | 'Third party only';

export interface Policy {
  policyNumber: string;
  policyholderName: string;
  vehicle: Vehicle;
  coverageType: CoverageType;
  towingIncluded: boolean;
  rentalCarIncluded: boolean;
}
