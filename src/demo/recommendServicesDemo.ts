import 'dotenv/config';
import { recommendServices } from '../services/recommendServices.js';
import type { Claim } from '../types/claim.js';
import type { Policy } from '../types/policy.js';

const comprehensivePolicy: Policy = {
  policyNumber: 'MMI-10234',
  policyholderName: 'Arjun Rao',
  vehicle: {
    make: 'Hyundai',
    model: 'i20',
    registration: 'TN-58-AB-1234',
  },
  coverageType: 'Comprehensive',
  towingIncluded: true,
};

const thirdPartyPolicy: Policy = {
  policyNumber: 'MMI-10871',
  policyholderName: 'Priya Nair',
  vehicle: {
    make: 'Maruti',
    model: 'Swift',
    registration: 'KL-07-CD-5678',
  },
  coverageType: 'Third party only',
  towingIncluded: false,
};

const claims: Array<{ label: string; claim: Claim; policy: Policy }> = [
  {
    label: 'Comprehensive policy with towing',
    policy: comprehensivePolicy,
    claim: {
      vehicleDrivable: false,
      injuriesReported: true,
      policeReportFiled: true,
      photosAvailable: true,
      otherParties: 'One other driver involved.',
    },
  },
  {
    label: 'Third party policy without towing',
    policy: thirdPartyPolicy,
    claim: {
      vehicleDrivable: false,
      injuriesReported: false,
      policeReportFiled: false,
      photosAvailable: true,
    },
  },
];

for (const { label, claim, policy } of claims) {
  const result = recommendServices({ claim, policy });

  console.log(`\n${label}`);
  console.log(`  recommendations: ${result.recommendations.join(', ') || 'none'}`);
}
