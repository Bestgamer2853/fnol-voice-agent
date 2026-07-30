import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

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

function normalizePolicyNumber(policyNumber: string): string {
  const wordToNumber: Record<string, string> = {
    zero: '0', one: '1', two: '2', three: '3', four: '4',
    five: '5', six: '6', seven: '7', eight: '8', nine: '9'
  };
  
  let normalized = policyNumber.toLowerCase();
  
  for (const [word, num] of Object.entries(wordToNumber)) {
    const regex = new RegExp(`\\b${word}\\b`, 'gi');
    normalized = normalized.replace(regex, num);
  }
  
  return normalized.replace(/[^a-z0-9]/gi, '').toUpperCase();
}

function nameFuzzyMatch(spokenName: string, expectedName: string): boolean {
  const spokenTokens = spokenName.toLowerCase().replace(/[^a-z ]/gi, '').split(/\s+/).filter(Boolean);
  const expectedTokens = expectedName.toLowerCase().replace(/[^a-z ]/gi, '').split(/\s+/).filter(Boolean);
  
  if (expectedTokens.length === 0) return false;

  let matchedTokens = 0;
  for (const exp of expectedTokens) {
    if (spokenTokens.includes(exp)) {
      matchedTokens++;
    }
  }
  
  if (matchedTokens === expectedTokens.length) return true;
  if (matchedTokens >= 2 && matchedTokens >= expectedTokens.length - 1) return true;
  
  return false;
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

  const matchedPolicy = policies.find(
    (policy) => normalizePolicyNumber(policy.policyNumber) === policyNumber,
  );

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
