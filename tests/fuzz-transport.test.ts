import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { shouldEndRetellCall, shouldSkipRetellUserTurn } from '../src/transport/retell.js';
import type { ConversationState } from '../src/conversation/ConversationState.js';
import type { ConversationAction } from '../src/conversation/actions.js';

describe('Fuzzing & Transport Edge Cases', () => {
  it('handles null, undefined, and malformed state objects in shouldEndRetellCall gracefully', () => {
    // @ts-expect-error testing invalid transport state inputs
    assert.strictEqual(shouldEndRetellCall(null, null), false);
    // @ts-expect-error testing invalid action input
    assert.strictEqual(shouldEndRetellCall({}, {} as ConversationState), false);
    
    const fakeState = {
      currentConversationStep: 'completed',
      verifiedPolicy: { policyNumber: '123' },
      missingFields: [],
    } as unknown as ConversationState;

    const incompleteAction = { type: 'complete' } as unknown as ConversationAction;
    assert.strictEqual(shouldEndRetellCall(incompleteAction, fakeState), false);

    const validAction = {
      type: 'complete',
      claim: { claimReferenceNumber: 'CLM-123456' },
    } as unknown as ConversationAction;
    assert.strictEqual(shouldEndRetellCall(validAction, fakeState), true);
  });

  it('handles repeated user turns and empty strings in shouldSkipRetellUserTurn', () => {
    const state = {
      lastUserMessage: 'I crashed my car',
    } as unknown as ConversationState;

    assert.strictEqual(shouldSkipRetellUserTurn(state, 'I crashed my car'), true);
    assert.strictEqual(shouldSkipRetellUserTurn(state, 'Different message'), false);
    assert.strictEqual(shouldSkipRetellUserTurn(state, ''), false);
  });

  it('verifies call never ends randomly or prematurely', () => {
    const nonCompletedState = {
      currentConversationStep: 'collecting_details',
      verifiedPolicy: { policyNumber: '123' },
      missingFields: ['location'],
    } as unknown as ConversationState;

    const action = {
      type: 'complete',
      claim: { claimReferenceNumber: 'CLM-123456' },
    } as unknown as ConversationAction;

    // Action says complete, but state is not finished -> should NOT end call
    assert.strictEqual(shouldEndRetellCall(action, nonCompletedState), false);
  });
});
