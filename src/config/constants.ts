/**
 * @file constants.ts
 * @description Centralized configuration and constants for the FNOL business rules.
 *
 * @responsibilities
 * - Define system-wide limits (e.g. `MAX_VERIFICATION_RETRIES`).
 * - Define heuristic keywords for severity classification.
 *
 * @architecture_position
 * Shared Configuration Layer. Used by the `ConversationManager` to drive
 * deterministic behavior without hardcoding strings in the business logic.
 */

export const MAX_VERIFICATION_RETRIES = 2;

export const COMPANY_NAME = 'Meridian Motor Insurance';

export const ESCALATION_KEYWORDS = [
  'injured',
  'injury',
  'hurt',
  'pain',
  'hospital',
  'ambulance',
  'neck',
  'stiff',
  'whiplash',
  'bleeding',
  'unconscious',
  'fatal',
  'death',
  'broken',
  'fracture',
  'emergency room',
  'severe',
  'critical',
] as const;

export type EscalationKeyword = (typeof ESCALATION_KEYWORDS)[number];

export const HIGH_SEVERITY_KEYWORDS = [
  'hospital',
  'ambulance',
  'unconscious',
  'fatal',
  'death',
  'critical',
  'severe injury',
  'life-threatening',
] as const;

export const MEDIUM_SEVERITY_KEYWORDS = [
  'injured',
  'injury',
  'hurt',
  'pain',
  'neck',
  'stiff',
  'whiplash',
  'bleeding',
  'broken',
  'fracture',
  'emergency room',
] as const;

export const LOW_SEVERITY_KEYWORDS = [
  'minor',
  'scratch',
  'scrape',
  'dent',
  'no injury',
  'not injured',
  'everyone is fine',
  'everyone is okay',
] as const;

export type HighSeverityKeyword = (typeof HIGH_SEVERITY_KEYWORDS)[number];
export type MediumSeverityKeyword = (typeof MEDIUM_SEVERITY_KEYWORDS)[number];
export type LowSeverityKeyword = (typeof LOW_SEVERITY_KEYWORDS)[number];
