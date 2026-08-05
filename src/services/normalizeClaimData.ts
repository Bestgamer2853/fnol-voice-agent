import type { Claim } from '../types/claim.js';

const WORD_TO_DIGIT: Record<string, string> = {
  zero: '0',
  one: '1',
  two: '2',
  three: '3',
  four: '4',
  five: '5',
  six: '6',
  seven: '7',
  eight: '8',
  nine: '9',
  oh: '0',
};

const PHONETIC_ALPHABET: Record<string, string> = {
  alpha: 'A', bravo: 'B', charlie: 'C', delta: 'D', echo: 'E',
  foxtrot: 'F', golf: 'G', hotel: 'H', india: 'I', juliet: 'J',
  kilo: 'K', lima: 'L', mike: 'M', november: 'N', oscar: 'O',
  papa: 'P', quebec: 'Q', romeo: 'R', sierra: 'S', tango: 'T',
  uniform: 'U', victor: 'V', whiskey: 'W', xray: 'X', yankee: 'Y', zulu: 'Z'
};

/**
 * normalizePolicyNumber tackles the notorious challenge of Voice AI translating
 * alphanumeric strings. ASRs often output "M M I one zero two" instead of "MMI-102".
 * This deterministic filter cleans it back to standard DB format.
 */
export function normalizePolicyNumber(raw: string): string {
  let normalized = raw.toLowerCase();
  
  for (const [word, digit] of Object.entries(WORD_TO_DIGIT)) {
    const regex = new RegExp(`\\b${word}\\b`, 'g');
    normalized = normalized.replace(regex, digit);
  }

  for (const [word, letter] of Object.entries(PHONETIC_ALPHABET)) {
    const regex = new RegExp(`\\b${word}\\b`, 'g');
    normalized = normalized.replace(regex, letter.toLowerCase());
  }

  normalized = normalized.replace(/\b(em em eye|m m i)\b/g, 'mmi');

  // Look for a policy prefix (2 to 5 letters) and numbers (4 to 8 digits) anywhere in the normalized string
  const match = /([a-z]{2,5})\s*[-_]?\s*(\d{4,8})/i.exec(normalized);
  if (match && match[1] && match[2]) {
    return `${match[1].toUpperCase()}-${match[2]}`;
  }

  const cleaned = raw.replace(/[^a-z0-9]/gi, '').toUpperCase();
  const cleanedMatch = /([A-Z]{2,5})(\d{4,8})/.exec(cleaned);
  if (cleanedMatch && cleanedMatch[1] && cleanedMatch[2]) {
    return `${cleanedMatch[1]}-${cleanedMatch[2]}`;
  }

  return raw.trim().toUpperCase();
}

function normalizeDate(raw: string): string {
  const normalized = raw.toLowerCase().trim();
  const today = new Date();
  
  if (normalized === 'today') {
    return today.toISOString().split('T')[0] || raw;
  }
  if (normalized === 'yesterday') {
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    return yesterday.toISOString().split('T')[0] || raw;
  }
  
  return raw;
}

export function normalizeClaimPatch(patch: Partial<Claim>): Partial<Claim> {
  const normalizedPatch: Partial<Claim> = { ...patch };

  if (normalizedPatch.policyNumber) {
    normalizedPatch.policyNumber = normalizePolicyNumber(normalizedPatch.policyNumber);
  }

  if (normalizedPatch.dateOfIncident) {
    normalizedPatch.dateOfIncident = normalizeDate(normalizedPatch.dateOfIncident);
  }

  return normalizedPatch;
}
