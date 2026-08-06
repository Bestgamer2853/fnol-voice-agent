import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createConversationManager } from '../src/conversation/ConversationManager.js';
import type { ConversationAction } from '../src/conversation/actions.js';
import { isRepeatedRetellUserTurn, shouldEndRetellCall } from '../src/transport/retell.js';

const state = createConversationManager({} as never).start();

describe('Retell termination guard', () => {
  it('does not hang up for a callback offer or an escalation', () => {
    const callbackAction: ConversationAction = {
      type: 'complete',
      message: 'An agent will call you back.',
      claim: {},
    };
    const callbackState = { ...state, currentConversationStep: 'callback_offer' as const };
    const escalationAction: ConversationAction = {
      type: 'escalate',
      message: 'Please contact emergency services.',
      reason: 'Injury reported.',
    };
    const escalationState = { ...state, currentConversationStep: 'escalation' as const };

    assert.equal(shouldEndRetellCall(callbackAction, callbackState), false);
    assert.equal(shouldEndRetellCall(escalationAction, escalationState), false);
  });

  it('only hangs up after a verified, complete claim receives a final acknowledgement', () => {
    const completeAction: ConversationAction = {
      type: 'complete',
      message: 'Goodbye.',
      claim: { claimReferenceNumber: 'CLM-20260805-0001' },
    };
    const completedState = {
      ...state,
      currentConversationStep: 'completed' as const,
      missingFields: [],
      verifiedPolicy: {
        policyNumber: 'MMI-10234',
        policyholderName: 'Arjun Rao',
        coverageType: 'Comprehensive' as const,
        towingIncluded: true,
        rentalCarIncluded: true,
        vehicle: {},
      },
    };

    assert.equal(shouldEndRetellCall(completeAction, completedState), true);
  });

  it('detects a repeated Retell transcript before it can advance the FSM twice', () => {
    assert.equal(isRepeatedRetellUserTurn({ ...state, lastUserMessage: 'No towing.' }, 'No towing.'), true);
    assert.equal(isRepeatedRetellUserTurn({ ...state, lastUserMessage: 'No towing.' }, 'I need a rental car.'), false);
  });
});
