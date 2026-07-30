import type { ConversationState } from '../ConversationState.js';

export class FollowUpGenerator {
  public generateFollowUp(state: ConversationState): string | null {
    const claim = state.currentClaim;
    
    if (claim.injuriesReported && !claim.injuryDetails && state.missingFields.includes('injuryDetails')) {
      return "You mentioned injuries. Can you provide more details about who was injured and how severe they are?";
    }
    
    if (claim.policeReportFiled && !claim.policeReportReference && state.missingFields.includes('policeReportReference')) {
      return "Since a police report was filed, do you happen to have the FIR or report reference number?";
    }
    
    if (claim.otherParties === 'Other party involved' && state.missingFields.includes('otherParties')) { // Based on ExtractClaimData returning this string as a flag
      return "You mentioned another vehicle or party was involved. Could you provide their vehicle registration or contact details?";
    }

    if (claim.incidentDescription && /\b(airbag|air bags)\b/i.test(claim.incidentDescription) && claim.vehicleDrivable === undefined) {
      return "Since the airbags deployed, is the vehicle still drivable?";
    }
    
    if (state.verifiedPolicy?.towingIncluded && claim.vehicleDrivable === false && !state.currentClaim.recommendedServices?.includes('Towing')) {
      // Handled normally by recommend services, but we can proactively ask here or just let the normal flow handle it.
      // We will let normal flow handle services.
    }

    return null;
  }
}
