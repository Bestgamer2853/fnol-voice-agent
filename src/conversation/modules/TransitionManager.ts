import type { ConversationState } from '../ConversationState.js';

const ACKNOWLEDGEMENTS = [
  "Got it.",
  "I understand.",
  "Okay.",
  "I see.",
  "Thanks.",
  "Understood."
];

export class TransitionManager {
  public generateTransition(state: ConversationState): string {
    const isFirstQuestionInFnol = state.currentConversationStep === 'collecting_fnol' && state.collectedFields.length === 0;
    
    // Acknowledgement for normal turns
    let prefix = "";
    if (state.conversationHistory.length > 3 && state.currentConversationStep === 'collecting_fnol') {
       // Random acknowledgement 30% of the time to avoid being robotic
       if (Math.random() < 0.3) {
           prefix = ACKNOWLEDGEMENTS[Math.floor(Math.random() * ACKNOWLEDGEMENTS.length)] + " ";
       }
    }

    if (isFirstQuestionInFnol) {
      return "Now I'd like to ask a couple of questions about the incident. ";
    }
    
    // Check if we are transitioning to vehicle details
    const collectingVehicleDetails = state.missingFields.includes('insuredVehicle') && state.collectedFields.includes('incidentDescription');
    if (collectingVehicleDetails && Math.random() < 0.5) {
        return "Let's move on to the vehicle details. ";
    }
    
    return prefix;
  }
}
