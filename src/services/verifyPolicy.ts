/**
 * @file verifyPolicy.ts
 * @description Validates user-provided policy information against a mock external insurance database.
 *
 * @responsibilities
 * - Load `policies.json` to act as the source of truth.
 * - Normalize incoming caller names and policy numbers (e.g. converting "mmi 102" to "MMI-102").
 * - Perform Jaro-Winkler and Levenshtein fuzzy matching to accommodate ASR (Speech-to-Text) misinterpretations.
 *
 * @architecture_position
 * Service Layer. Abstracted behind an interface so it can be easily swapped for an actual
 * API call (e.g., Salesforce, Guidewire) in a production environment.
 *
 * @production_notes
 * - Currently loads policies synchronously into memory. In production, this would be an async
 *   network request. `VerifyPolicyService.verify` already returns a `Promise` signature to support this.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { normalizePolicyNumber } from './normalizeClaimData.js';
import type { CoverageType, Policy } from '../types/policy.js';

export interface VerifyPolicyInput {
  policyNumber: string;
  callerName: string;
}

export type VerifyPolicyFailureReason =
  | 'policy_number_required'
  | 'caller_name_required'
  | 'policy_not_found'
  | 'caller_name_mismatch';

export type VerifyPolicyResult =
  | {
      verified: true;
      policy: Policy;
      coverageType: CoverageType;
      towingIncluded: boolean;
      rentalCarIncluded: boolean;
    }
  | {
      verified: false;
      reason: VerifyPolicyFailureReason;
      message: string;
    };

export interface VerifyPolicyService {
  verify(input: VerifyPolicyInput): VerifyPolicyResult | Promise<VerifyPolicyResult>;
}

const moduleDirectory = dirname(fileURLToPath(import.meta.url));
const policiesFilePath = join(moduleDirectory, '../config/policies.json');

function normalizeWhitespace(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

/**
 * Implements Jaro-Winkler string similarity algorithm.
 * 
 * @business_context
 * Used to verify caller names. "John Doe" vs "Jon Doe" should pass verification.
 * Insurance policies often have slightly misspelled names, or the Voice AI might transcribe
 * the spoken name slightly incorrectly. Jaro-Winkler heavily weights prefix matches,
 * which is ideal for first/last name comparisons.
 */
function jaroWinkler(s1: string, s2: string): number {
  if (s1 === s2) return 1.0;
  const len1 = s1.length;
  const len2 = s2.length;
  if (len1 === 0 || len2 === 0) return 0.0;
  
  const matchDistance = Math.floor(Math.max(len1, len2) / 2) - 1;
  const s1Matches = new Array(len1).fill(false);
  const s2Matches = new Array(len2).fill(false);
  
  let matches = 0;
  for (let i = 0; i < len1; i++) {
    const start = Math.max(0, i - matchDistance);
    const end = Math.min(i + matchDistance + 1, len2);
    for (let j = start; j < end; j++) {
      if (!s2Matches[j] && s1[i] === s2[j]) {
        s1Matches[i] = true;
        s2Matches[j] = true;
        matches++;
        break;
      }
    }
  }
  
  if (matches === 0) return 0.0;
  
  let transpositions = 0;
  let k = 0;
  for (let i = 0; i < len1; i++) {
    if (s1Matches[i]) {
      while (!s2Matches[k]) k++;
      if (s1[i] !== s2[k]) transpositions++;
      k++;
    }
  }
  
  const jaro = ((matches / len1) + (matches / len2) + ((matches - transpositions / 2) / matches)) / 3.0;
  
  let prefix = 0;
  for (let i = 0; i < Math.min(4, Math.min(len1, len2)); i++) {
    if (s1[i] === s2[i]) prefix++;
    else break;
  }
  
  return jaro + (prefix * 0.1 * (1.0 - jaro));
}

function levenshtein(a: string, b: string): number {
  const matrix: number[][] = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i++) matrix[i]![0] = i;
  for (let j = 0; j <= b.length; j++) matrix[0]![j] = j;

  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      if (a[i - 1] === b[j - 1]) {
        matrix[i]![j] = matrix[i - 1]![j - 1]!;
      } else {
        matrix[i]![j] = Math.min(
          matrix[i - 1]![j - 1]! + 1,
          matrix[i]![j - 1]! + 1,
          matrix[i - 1]![j]! + 1
        );
      }
    }
  }
  return matrix[a.length]![b.length]!;
}

function nameFuzzyMatch(spokenName: string, expectedName: string): boolean {
  const sName = (spokenName || '').toLowerCase().replace(/[^a-z]/g, '');
  const eName = (expectedName || '').toLowerCase().replace(/[^a-z]/g, '');
  
  if (sName.length === 0 || eName.length === 0) return false;
  
  const similarity = jaroWinkler(sName, eName);
  return similarity > 0.85;
}

function normalizeCallerName(callerName: string): string {
  return normalizeWhitespace(callerName).toLowerCase();
}

function isPolicy(value: unknown): value is Policy {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const record = value as Record<string, unknown>;
  const vehicle = record.vehicle;

  return (
    typeof record.policyNumber === 'string' &&
    typeof record.policyholderName === 'string' &&
    typeof record.coverageType === 'string' &&
    typeof record.towingIncluded === 'boolean' &&
    (record.rentalCarIncluded === undefined || typeof record.rentalCarIncluded === 'boolean') &&
    typeof vehicle === 'object' &&
    vehicle !== null
  );
}

export function loadPolicies(): Policy[] {
  const rawContents = readFileSync(policiesFilePath, 'utf8');
  const parsed: unknown = JSON.parse(rawContents);

  if (!Array.isArray(parsed)) {
    throw new Error('policies.json must contain an array of policies');
  }

  const policies = parsed.filter(isPolicy);

  if (policies.length !== parsed.length) {
    throw new Error('policies.json contains invalid policy records');
  }

  return policies;
}

function verifyAgainstPolicies(
  input: VerifyPolicyInput,
  policies: Policy[],
): VerifyPolicyResult {
  const policyNumber = normalizePolicyNumber(input.policyNumber);
  const callerName = normalizeCallerName(input.callerName);

  if (policyNumber.length === 0) {
    return {
      verified: false,
      reason: 'policy_number_required',
      message: 'Policy number is required for verification.',
    };
  }

  if (callerName.length === 0) {
    return {
      verified: false,
      reason: 'caller_name_required',
      message: 'Caller name is required for verification.',
    };
  }

  let matchedPolicy = policies.find(
    (policy) => normalizePolicyNumber(policy.policyNumber) === policyNumber,
  );

  if (!matchedPolicy) {
      // --- DETERMINISTIC FUZZY MATCHING ---
      // If an exact match fails (e.g., ASR heard 'M' instead of 'N'), we calculate
      // the Levenshtein edit distance. If it's within 2 characters, we accept it.
      // This is critical for voice applications where TTS/ASR isn't perfectly accurate.
      for (const policy of policies) {
          const expectedPolicy = normalizePolicyNumber(policy.policyNumber);
          if (levenshtein(expectedPolicy, policyNumber) <= 2) {
              matchedPolicy = policy;
              break;
          }
      }
  }

  if (!matchedPolicy) {
    return {
      verified: false,
      reason: 'policy_not_found',
      message: `No policy found for policy number ${policyNumber}.`,
    };
  }

  const expectedCallerName = matchedPolicy.policyholderName;

  if (!nameFuzzyMatch(input.callerName, expectedCallerName)) {
    return {
      verified: false,
      reason: 'caller_name_mismatch',
      message: `Caller name does not match the policyholder on record for ${policyNumber}.`,
    };
  }

  return {
    verified: true,
    policy: matchedPolicy,
    coverageType: matchedPolicy.coverageType,
    towingIncluded: matchedPolicy.towingIncluded,
    rentalCarIncluded: Boolean(matchedPolicy.rentalCarIncluded),
  };
}

export function verifyPolicy(input: VerifyPolicyInput): VerifyPolicyResult {
  return verifyAgainstPolicies(input, loadPolicies());
}

export function createVerifyPolicyService(
  policies: Policy[] = loadPolicies(),
): VerifyPolicyService {
  return {
    verify(input: VerifyPolicyInput): VerifyPolicyResult {
      return verifyAgainstPolicies(input, policies);
    },
  };
}
