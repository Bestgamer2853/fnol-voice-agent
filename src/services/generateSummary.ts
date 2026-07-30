import type { ConversationState } from '../conversation/ConversationState.js';
import type { Severity } from '../conversation/types.js';
import type { Claim } from '../types/claim.js';
import type { Policy } from '../types/policy.js';
import type { GeminiClient } from './geminiClient.js';

export interface GenerateSummaryInput {
  claim: Claim;
  verifiedPolicy: Policy;
  state: ConversationState;
}

export interface GenerateSummaryResult {
  summary: string;
  severity: Severity;
  llmSummary?: string;
}

export interface GenerateSummaryService {
  generate(
    input: GenerateSummaryInput,
  ): GenerateSummaryResult | Promise<GenerateSummaryResult>;
}

interface GenerateSummaryServiceOptions {
  geminiClient?: GeminiClient;
}

function formatBoolean(value: boolean | undefined): string {
  if (value === undefined) {
    return 'unknown';
  }

  return value ? 'yes' : 'no';
}

function formatVehicle(claim: Claim, policy: Policy): string {
  const vehicle = claim.insuredVehicle ?? policy.vehicle;

  return [
    vehicle.make ?? 'unknown make',
    vehicle.model ?? 'unknown model',
    vehicle.registration ? `(${vehicle.registration})` : '(unknown registration)',
  ].join(' ');
}

function formatServices(services: readonly string[] | undefined): string {
  return services && services.length > 0 ? services.join(', ') : 'none';
}

function buildDeterministicSummary(input: GenerateSummaryInput): string {
  const { claim, verifiedPolicy, state } = input;

  return [
    `Claim ${claim.claimReferenceNumber ?? 'not assigned'} for ${verifiedPolicy.policyholderName} under policy ${verifiedPolicy.policyNumber}.`,
    `Incident occurred on ${claim.dateOfIncident ?? 'unknown date'} at ${claim.timeOfIncident ?? 'unknown time'} near ${claim.locationOfIncident ?? 'unknown location'}.`,
    `Vehicle: ${formatVehicle(claim, verifiedPolicy)}.`,
    `Description: ${claim.incidentDescription ?? 'No incident description provided.'}`,
    `Injuries reported: ${formatBoolean(claim.injuriesReported)}${claim.injuryDetails ? ` (${claim.injuryDetails})` : ''}.`,
    `Police report filed: ${formatBoolean(claim.policeReportFiled)}${claim.policeReportReference ? ` (${claim.policeReportReference})` : ''}.`,
    `Photos available: ${formatBoolean(claim.photosAvailable)}. Vehicle drivable: ${formatBoolean(claim.vehicleDrivable)}.`,
    `Other parties: ${claim.otherParties ?? 'none reported'}.`,
    `Severity: ${state.severity ?? 'low'}. Escalation required: ${formatBoolean(state.escalationRequired)}.`,
    `Recommended services: ${formatServices(claim.recommendedServices)}.`,
  ].join('\n');
}

async function buildLlmSummary(
  input: GenerateSummaryInput,
  geminiClient: GeminiClient,
  deterministicSummary: string,
): Promise<string | undefined> {
  const result = await geminiClient.generateAssistantResponse({
    systemPrompt: [
      'You write concise internal insurance claim summaries.',
      'Use only the supplied deterministic claim summary.',
      'Do not invent facts, coverage, liability, or next steps.',
      'Return one short paragraph.',
    ].join('\n'),
    conversationContext: deterministicSummary,
    userPrompt: 'Rewrite the deterministic claim summary as a concise internal FNOL summary.',
  });

  if (result.errorMessage) {
    return undefined;
  }

  return result.assistantResponse;
}

export function generateSummary(input: GenerateSummaryInput): GenerateSummaryResult {
  return {
    summary: buildDeterministicSummary(input),
    severity: input.state.severity ?? 'low',
  };
}

export function createGenerateSummaryService(
  options: GenerateSummaryServiceOptions = {},
): GenerateSummaryService {
  return {
    async generate(input: GenerateSummaryInput): Promise<GenerateSummaryResult> {
      // Disabled LLM rewrite step to enforce Gemini free tier limits
      return generateSummary(input);
    },
  };
}
