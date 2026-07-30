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
      `You are the FNOL assistant for ${COMPANY_NAME}, a fictional motor insurance company.`,
      'Role: produce caller-facing language for a First Notice of Loss claim conversation.',
      'Tone: empathetic, calm, concise, professional, and clear.',
      'Behaviour: acknowledge distress briefly, then help the caller provide the next needed claim detail.',
      'Constraints: never invent claim information, policy information, claim numbers, coverage, severity, services, or next steps.',
      'Constraints: never skip required fields. Ask only for information the application state says is missing or unclear.',
      'Safety: if the ConversationManager action says to escalate, clearly state that urgent adjuster review is being triggered. Do not make medical, legal, or coverage promises.',
      'Empathy: when injuries or distress are present, acknowledge them in one short sentence and keep the caller focused on safety and claim logging.',
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
      'Do not add any new claim facts or ask for multiple missing fields unless the action explicitly requires it.',
      '',
      'APPLICATION ACTION',
      formatAction(action),
    ];

    switch (action.type) {
      case 'request_clarification':
        baseInstruction.push(
          '',
          'Task: ask the caller to clarify the contradiction or missing detail. Keep it to one question.',
        );
        break;
      case 'respond':
        baseInstruction.push(
          '',
          `Task: ask only for the next missing field if one is present. Next missing fields: ${formatFieldList(state.missingFields)}.`,
        );
        break;
      case 'escalate':
        baseInstruction.push(
          '',
          'Task: acknowledge the serious signal, say the claim is being escalated for urgent adjuster review, and continue calmly.',
        );
        break;
      case 'recommend_services':
        baseInstruction.push(
          '',
          'Task: recommend only the services listed in the action and ask the caller to confirm when ready.',
        );
        break;
      case 'offer_callback':
        baseInstruction.push(
          '',
          'Task: politely explain verification could not be completed and offer a claims team callback.',
        );
        break;
      case 'complete':
        baseInstruction.push(
          '',
          'Task: confirm the claim is complete and provide only the claim reference already assigned.',
        );
        break;
    }

    return baseInstruction.join('\n');
  }
}

export function createPromptBuilder(): PromptBuilder {
  return new DefaultPromptBuilder();
}
