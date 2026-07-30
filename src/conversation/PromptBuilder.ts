import { COMPANY_NAME } from '../config/constants.js';
import type { TrackableFnolField } from '../config/requiredFields.js';
import type { Claim } from '../types/claim.js';
import type { Policy } from '../types/policy.js';
import type { ConversationAction } from './actions.js';
import type { ConversationState } from './ConversationState.js';

export interface PromptBuilder {
  buildSystemPrompt(
    state: ConversationState,
    action?: ConversationAction,
  ): string;
  buildConversationContext(state: ConversationState): string;
  buildUserPrompt(
    state: ConversationState,
    action: ConversationAction,
  ): string;
}

function formatList(values: readonly string[]): string {
  return values.length > 0 ? values.join(', ') : 'none';
}

function formatBoolean(value: boolean | undefined): string {
  if (value === undefined) {
    return 'unknown';
  }

  return value ? 'yes' : 'no';
}

function formatFieldList(fields: readonly TrackableFnolField[]): string {
  return fields.length > 0 ? fields.join(', ') : 'none';
}

function formatPolicy(policy: Policy | undefined): string {
  if (!policy) {
    return 'not verified';
  }

  return [
    `policyNumber: ${policy.policyNumber}`,
    `policyholderName: ${policy.policyholderName}`,
    `vehicle: ${policy.vehicle.make ?? 'unknown'} ${policy.vehicle.model ?? 'unknown'} ${policy.vehicle.registration ?? 'unknown'}`,
    `coverageType: ${policy.coverageType}`,
    `towingIncluded: ${formatBoolean(policy.towingIncluded)}`,
  ].join('\n');
}

function formatClaim(claim: Claim): string {
  return [
    `claimReferenceNumber: ${claim.claimReferenceNumber ?? 'not assigned'}`,
    `policyNumber: ${claim.policyNumber ?? 'missing'}`,
    `callerName: ${claim.callerName ?? 'missing'}`,
    `dateOfIncident: ${claim.dateOfIncident ?? 'missing'}`,
    `timeOfIncident: ${claim.timeOfIncident ?? 'missing'}`,
    `locationOfIncident: ${claim.locationOfIncident ?? 'missing'}`,
    `incidentDescription: ${claim.incidentDescription ?? 'missing'}`,
    `insuredVehicle: ${claim.insuredVehicle?.make ?? 'missing'} ${claim.insuredVehicle?.model ?? 'missing'} ${claim.insuredVehicle?.registration ?? 'missing'}`,
    `otherParties: ${claim.otherParties ?? 'not provided'}`,
    `injuriesReported: ${formatBoolean(claim.injuriesReported)}`,
    `injuryDetails: ${claim.injuryDetails ?? 'not provided'}`,
    `policeReportFiled: ${formatBoolean(claim.policeReportFiled)}`,
    `policeReportReference: ${claim.policeReportReference ?? 'not provided'}`,
    `photosAvailable: ${formatBoolean(claim.photosAvailable)}`,
    `vehicleDrivable: ${formatBoolean(claim.vehicleDrivable)}`,
    `recommendedServices: ${formatList(claim.recommendedServices ?? [])}`,
    `severityClassification: ${claim.severityClassification ?? 'not set'}`,
  ].join('\n');
}

function formatAction(action: ConversationAction): string {
  switch (action.type) {
    case 'respond':
    case 'request_clarification':
    case 'offer_callback':
      return `${action.type}: ${action.message}`;
    case 'escalate':
      return `${action.type}: ${action.message}\nreason: ${action.reason}`;
    case 'recommend_services':
      return `${action.type}: ${action.message}\nservices: ${formatList(action.services)}`;
    case 'complete':
      return `${action.type}: ${action.message}\nclaimReferenceNumber: ${action.claim.claimReferenceNumber ?? 'not assigned'}`;
  }
}

export class DefaultPromptBuilder implements PromptBuilder {
  buildSystemPrompt(
    _state: ConversationState,
    _action?: ConversationAction,
  ): string {
    return [
      `You are an elite FNOL claims representative for ${COMPANY_NAME}, a motor insurance company.`,
      'Role: produce caller-facing language for a First Notice of Loss claim conversation.',
      'Tone: highly empathetic, calm, concise, professional, and clear. Sound like an experienced human.',
      'Behaviour: take the instructions in the APPLICATION ACTION and refine them to sound perfectly natural.',
      'Constraints: NEVER ask more than one (1) question per turn. Max 1 question per turn.',
      'Constraints: keep responses extremely concise. Target 15-25 words per response.',
      'Constraints: never invent claim information, policy information, claim numbers, coverage, severity, services, or next steps.',
      'Constraints: never skip required fields. Ask only for information the application state says is missing or unclear.',
      'Output: return only the assistant message. Do not include JSON, labels, analysis, or hidden reasoning.',
    ].join('\n');
  }

  buildConversationContext(state: ConversationState): string {
    return [
      'APPLICATION STATE',
      `conversationStep: ${state.currentConversationStep}`,
      `retryCount: ${state.retryCount}`,
      `severity: ${state.severity ?? 'not set'}`,
      `escalationRequired: ${formatBoolean(state.escalationRequired)}`,
      '',
      'VERIFIED POLICY',
      formatPolicy(state.verifiedPolicy),
      '',
      'CLAIM',
      formatClaim(state.currentClaim),
      '',
      'FIELD TRACKING',
      `collectedFields: ${formatFieldList(state.collectedFields)}`,
      `missingFields: ${formatFieldList(state.missingFields)}`,
      '',
      'PENDING CLARIFICATIONS',
      state.pendingClarifications.length > 0
        ? state.pendingClarifications
            .map((item) => `${item.field}: ${item.prompt}`)
            .join('\n')
        : 'none',
      '',
      'DETECTED CONTRADICTIONS',
      state.contradictions.length > 0
        ? state.contradictions
            .map((item) => `${item.field}: ${item.description}`)
            .join('\n')
        : 'none',
      '',
      'RECOMMENDATIONS',
      formatList(state.currentClaim.recommendedServices ?? []),
      '',
      'RECENT CONVERSATION',
      state.conversationHistory
        .slice(-6)
        .map((message) => `${message.role}: ${message.content}`)
        .join('\n'),
    ].join('\n');
  }

  buildUserPrompt(
    state: ConversationState,
    action: ConversationAction,
  ): string {
    const baseInstruction = [
      'Write the next assistant response for the caller.',
      'Use the application action below as the source of truth.',
      'Refine the action message into a natural, conversational response.',
      'Ensure it is empathetic and flows well, keeping strictly under 25 words.',
      'NEVER ask more than one question.',
      '',
      'APPLICATION ACTION',
      formatAction(action),
    ];

    return baseInstruction.join('\n');
  }
}

export function createPromptBuilder(): PromptBuilder {
  return new DefaultPromptBuilder();
}
