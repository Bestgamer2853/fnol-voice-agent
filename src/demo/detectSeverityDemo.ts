import 'dotenv/config';
import { detectSeverity } from '../services/detectSeverity.js';
import type { Claim } from '../types/claim.js';

const claims: Array<{ label: string; claim: Claim }> = [
  {
    label: 'Low severity: minor damage only',
    claim: {
      incidentDescription: 'Small bumper scratch in a parking area.',
      injuriesReported: false,
      policeReportFiled: false,
      vehicleDrivable: true,
    },
  },
  {
    label: 'Medium severity: police and not drivable',
    claim: {
      incidentDescription: 'Two cars collided at a junction.',
      injuriesReported: false,
      policeReportFiled: true,
      vehicleDrivable: false,
      otherParties: 'One other driver was involved.',
    },
  },
  {
    label: 'High severity: injury and ambulance',
    claim: {
      incidentDescription: 'The car rolled over and an ambulance arrived.',
      injuriesReported: true,
      injuryDetails: 'Caller has neck pain.',
      policeReportFiled: true,
      vehicleDrivable: false,
    },
  },
];

for (const { label, claim } of claims) {
  const result = detectSeverity({ claim });

  console.log(`\n${label}`);
  console.log(`  severity: ${result.severity}`);
  console.log(`  escalationRequired: ${result.escalationRequired}`);
  console.log(`  reasons: ${result.reasons.join(' | ') || 'none'}`);
}
