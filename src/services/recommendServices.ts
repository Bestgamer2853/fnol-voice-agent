/**
 * @file recommendServices.ts
 * @description Analyzes the extracted claim details and verifies against the user's policy to recommend relevant services.
 *
 * @responsibilities
 * - Evaluate claim conditions (e.g., is the vehicle drivable?).
 * - Cross-reference with policy entitlements (e.g., does the user have towing coverage?).
 * - Return a deterministic list of service recommendations.
 *
 * @architecture_position
 * Domain / Service Layer. It encapsulates business rules surrounding post-incident support.
 *
 * @interview_talking_points
 * - "Why is this not done by the LLM?"
 *   -> Giving the LLM the policy JSON and asking it to recommend services risks hallucination. 
 *      If an LLM hallucinates free towing for a customer without coverage, the company incurs a loss.
 *      By pulling this into a deterministic rule engine, we guarantee strict compliance.
 */

import type { Claim } from '../types/claim.js';
import type { Policy } from '../types/policy.js';

export interface RecommendServicesInput {
  claim: Claim;
  policy: Policy;
}

export interface RecommendServicesResult {
  recommendations: string[];
}

export interface RecommendServicesService {
  recommend(
    input: RecommendServicesInput,
  ): RecommendServicesResult | Promise<RecommendServicesResult>;
}

function addRecommendation(
  recommendations: string[],
  recommendation: string,
): void {
  if (!recommendations.includes(recommendation)) {
    recommendations.push(recommendation);
  }
}

function hasOtherParties(claim: Claim): boolean {
  return typeof claim.otherParties === 'string' && claim.otherParties.trim().length > 0;
}

/**
 * Deterministically recommends services based on the structured claim data and the user's policy.
 * This ensures that we do not hallucinate services that the user's policy does not cover
 * (e.g., offering free towing when they don't have roadside assistance).
 */
export function recommendServices(
  input: RecommendServicesInput,
): RecommendServicesResult {
  const { claim, policy } = input;
  const recommendations: string[] = [];

  if (claim.vehicleDrivable === false && policy.towingIncluded) {
    addRecommendation(recommendations, 'towing');
  }

  if (claim.vehicleDrivable === false && !policy.towingIncluded) {
    addRecommendation(recommendations, 'roadside assistance');
  }

  // Rental car is offered by default for all accident claims
  addRecommendation(recommendations, 'rental car');

  if (
    claim.injuriesReported === true ||
    claim.policeReportFiled === true ||
    hasOtherParties(claim)
  ) {
    addRecommendation(recommendations, 'adjuster callback');
  }

  if (
    policy.coverageType === 'Comprehensive' &&
    claim.photosAvailable === true
  ) {
    addRecommendation(recommendations, 'network repair garage');
  }

  return { recommendations };
}

export function createRecommendServicesService(): RecommendServicesService {
  return {
    recommend: recommendServices,
  };
}
