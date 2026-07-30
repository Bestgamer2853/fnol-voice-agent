import type { ConversationState } from '../ConversationState.js';

function formatBoolean(val: boolean | undefined): string {
    if (val === undefined) return 'unknown';
    return val ? 'yes' : 'no';
}

export class SummaryGenerator {
  public generatePreSubmissionSummary(state: ConversationState): string {
    const claim = state.currentClaim;
    const vehicle = claim.insuredVehicle ? `${claim.insuredVehicle.make || ''} ${claim.insuredVehicle.model || ''}`.trim() : 'the vehicle';
    
    return `Let me quickly summarize everything I've recorded. The incident occurred on ${claim.dateOfIncident || 'an unknown date'} at ${claim.timeOfIncident || 'an unknown time'} near ${claim.locationOfIncident || 'an unknown location'}. It involved ${vehicle}. Injuries reported: ${formatBoolean(claim.injuriesReported)}. Vehicle drivable: ${formatBoolean(claim.vehicleDrivable)}. Other parties involved: ${claim.otherParties ? 'yes' : 'no'}. Does everything sound correct?`;
  }
}
