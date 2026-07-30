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
