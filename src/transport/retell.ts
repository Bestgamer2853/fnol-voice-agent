import type { ConversationAction } from '../conversation/actions.js';
import type { ConversationState } from '../conversation/ConversationState.js';

/**
 * Retell treats `end_call` as an immediate hang-up. A conversational action alone
 * is not sufficient evidence that a claim is safely complete: callback offers and
 * urgent escalation are intentionally non-completion dispositions.
 */
export function shouldEndRetellCall(
  action: ConversationAction,
  state: ConversationState,
): boolean {
  if (!action || !state) return false;
  return (
    action.type === 'complete' &&
    state.currentConversationStep === 'completed' &&
    state.verifiedPolicy !== undefined &&
    Array.isArray(state.missingFields) &&
    state.missingFields.length === 0 &&
    'claim' in action &&
    typeof action.claim?.claimReferenceNumber === 'string'
  );
}

/**
 * Retell can emit the same finalized user transcript on both response_required
 * and reminder_required. Replaying it would advance the FSM twice.
 */
export function shouldSkipRetellUserTurn(
  state: ConversationState,
  userMessage: string,
): boolean {
  return state.lastUserMessage === userMessage;
}

export const isRepeatedRetellUserTurn = shouldSkipRetellUserTurn;
