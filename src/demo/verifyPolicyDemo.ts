import 'dotenv/config';
import {
  verifyPolicy,
  type VerifyPolicyResult,
} from '../services/verifyPolicy.js';

function printResult(label: string, result: VerifyPolicyResult): void {
  console.log(`\n${label}`);

  if (result.verified) {
    console.log('  verified: true');
    console.log(`  policyNumber: ${result.policy.policyNumber}`);
    console.log(`  policyholderName: ${result.policy.policyholderName}`);
    console.log(`  coverageType: ${result.coverageType}`);
    console.log(`  towingIncluded: ${result.towingIncluded}`);
    return;
  }

  console.log('  verified: false');
  console.log(`  reason: ${result.reason}`);
  console.log(`  message: ${result.message}`);
}

const scenarios = [
  {
    label: '1. Valid policy',
    input: { policyNumber: 'MMI-10234', callerName: 'Arjun Rao' },
  },
  {
    label: '2. Invalid policy number',
    input: { policyNumber: 'MMI-99999', callerName: 'Arjun Rao' },
  },
  {
    label: '3. Wrong caller name',
    input: { policyNumber: 'MMI-10234', callerName: 'Wrong Name' },
  },
  {
    label: '4. Towing included',
    input: { policyNumber: 'MMI-10234', callerName: 'Arjun Rao' },
  },
  {
    label: '5. Towing not included',
    input: { policyNumber: 'MMI-10871', callerName: 'Priya Nair' },
  },
] as const;

for (const scenario of scenarios) {
  printResult(scenario.label, verifyPolicy(scenario.input));
}
