import 'dotenv/config';
import { detectContradictions } from '../services/detectContradictions.js';
import type { Claim } from '../types/claim.js';

const previousClaim: Claim = {
  dateOfIncident: '2026-07-28',
  locationOfIncident: 'MG Road, Bengaluru',
  injuriesReported: false,
  vehicleDrivable: true,
  incidentDescription: 'Minor rear-end collision.',
};

const updatedClaim: Claim = {
  dateOfIncident: '2026-07-29',
  locationOfIncident: 'Outer Ring Road, Bengaluru',
  injuriesReported: true,
  injuryDetails: 'Caller now reports neck stiffness.',
  vehicleDrivable: false,
  incidentDescription: 'Rear-end collision, vehicle cannot be driven.',
};

const result = detectContradictions({
  previousClaim,
  updatedClaim,
});

console.log('Detected contradictions');

for (const contradiction of result.contradictions) {
  console.log(
    `  ${contradiction.field}: ${contradiction.priorValue} -> ${contradiction.newValue}`,
  );
  console.log(`    ${contradiction.description}`);
}
