import { normalizeClaimPatch } from '../src/services/normalizeClaimData.js';
import { verifyPolicy } from '../src/services/verifyPolicy.js';

console.log('--- TEST 1: Policy Normalization ---');
console.log('Input: "policy MMI 10234" ->', normalizeClaimPatch({ policyNumber: 'policy MMI 10234' }));
console.log('Input: "my policy is MMI-10234" ->', normalizeClaimPatch({ policyNumber: 'my policy is MMI-10234' }));
console.log('Input: "MMI 10871" ->', normalizeClaimPatch({ policyNumber: 'MMI 10871' }));
console.log('Input: "mike mike india 10871" ->', normalizeClaimPatch({ policyNumber: 'mike mike india 10871' }));

console.log('\n--- TEST 2: Policy Verification ---');
console.log('Match 1 (policy MMI 10234):', verifyPolicy({ policyNumber: 'policy MMI 10234', callerName: 'Arjun Rao' }));
console.log('Match 2 (MMI 10871):', verifyPolicy({ policyNumber: 'MMI 10871', callerName: 'Priya Nair' }));
console.log('Match 3 (phonetic):', verifyPolicy({ policyNumber: 'mike mike india 10871', callerName: 'Priya Nair' }));
console.log('Match 4 (combined phrase name):', verifyPolicy({ policyNumber: 'policy MMI-10234', callerName: 'Arjun Rao and my policy number is MMI-10234' }));
