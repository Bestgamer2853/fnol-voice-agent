import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { generateSummary } from '../src/services/generateSummary.js';
import type { Claim } from '../src/types/claim.js';
import type { Policy } from '../src/types/policy.js';

describe('Logging & Summary Generation Integrity', () => {
  it('generates a non-empty summary mentioning incident, severity, and services', async () => {
    const mockClaim: Claim = {
      claimReferenceNumber: 'CLM-TEST-001',
      policyNumber: 'MMI-998877',
      policyholderName: 'Jane Doe',
      dateOfIncident: '2026-08-05',
      timeOfIncident: '14:00',
      location: '5th Avenue',
      description: 'Rear-ended at traffic light',
      injuriesReported: true,
      injuryDetails: 'Whiplash',
      policeContacted: true,
      policeReportNumber: 'PR-99',
      hasPhotos: true,
      isVehicleDrivable: false,
      needsTowing: true,
      needsRentalCar: true,
      wantsRentalCar: true,
      createdAt: new Date().toISOString(),
    };

    const mockPolicy: Policy = {
      policyNumber: 'MMI-998877',
      policyholderName: 'Jane Doe',
      coverageType: 'Comprehensive',
      towingIncluded: true,
      rentalCarIncluded: true,
      vehicle: { make: 'Honda', model: 'Civic', registration: 'NY-123' },
    };

    const mockState = {
      currentConversationStep: 'completed',
      verifiedPolicy: mockPolicy,
      missingFields: [],
    } as any;

    const result = await generateSummary({
      claim: mockClaim,
      verifiedPolicy: mockPolicy,
      state: mockState,
    });

    const summary = result.summary;

    assert.ok(summary && summary.length > 20, 'Summary must be non-empty and detailed');
    assert.ok(summary.includes('Jane Doe') || summary.includes('MMI-998877'), 'Summary must mention policy or holder name');
    assert.ok(summary.toLowerCase().includes('high') || summary.toLowerCase().includes('whiplash') || summary.toLowerCase().includes('injury'), 'Summary must reflect severe status/injuries');
  });
});
