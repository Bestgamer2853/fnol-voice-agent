import type { ConversationState } from '../conversation/ConversationState.js';
import type { ConversationStep } from '../conversation/types.js';
import type { Claim } from '../types/claim.js';
import type { Vehicle } from '../types/common.js';
import type { GeminiClient } from './geminiClient.js';

export interface ExtractClaimDataInput {
  userMessage: string;
  state: ConversationState;
  onContentChunk?: ((chunk: string) => void) | undefined;
}

export interface ExtractClaimDataResult {
  responseToUser: string;
  toolCalls?: any[] | undefined;
  conversationAnalysis: string;
  debugMetrics: {
    rawExtractedSlots: unknown;
    geminiPrompt: string;
    geminiResponse: string;
  };
}

export interface ExtractClaimDataService {
  extract(input: ExtractClaimDataInput): Promise<ExtractClaimDataResult>;
}

interface ExtractClaimDataServiceOptions {
  geminiClient: GeminiClient;
}

type ExtractableTextField =
  | 'policyNumber'
  | 'callerName'
  | 'dateOfIncident'
  | 'timeOfIncident'
  | 'locationOfIncident'
  | 'incidentDescription'
  | 'otherParties'
  | 'injuryDetails'
  | 'policeReportReference';

type ExtractableBooleanField =
  | 'injuriesReported'
  | 'policeReportFiled'
  | 'photosAvailable'
  | 'vehicleDrivable';

const TEXT_FIELDS = [
  'policyNumber',
  'callerName',
  'dateOfIncident',
  'timeOfIncident',
  'locationOfIncident',
  'incidentDescription',
  'otherParties',
  'injuryDetails',
  'policeReportReference',
] as const satisfies readonly ExtractableTextField[];

const BOOLEAN_FIELDS = [
  'injuriesReported',
  'policeReportFiled',
  'photosAvailable',
  'vehicleDrivable',
] as const satisfies readonly ExtractableBooleanField[];

const VEHICLE_FIELDS = ['make', 'model', 'registration'] as const satisfies readonly (keyof Vehicle)[];
const POLICY_NUMBER_PATTERN = /\b[A-Z]{2,5}-\d{4,8}\b/i;
const ISO_DATE_PATTERN = /\b\d{4}-\d{2}-\d{2}\b/;
const TIME_PATTERN = /\b(?:[01]?\d|2[0-3]):[0-5]\d\s*(?:am|pm)?\b/i;

function extractJsonObject(value: string): unknown {
  const trimmed = value.trim();
  const fencedMatch = /```(?:json)?\s*([\s\S]*?)\s*```/i.exec(trimmed);
  const candidate = fencedMatch?.[1] ?? trimmed;
  const startIndex = candidate.indexOf('{');
  const endIndex = candidate.lastIndexOf('}');

  if (startIndex === -1 || endIndex === -1 || endIndex <= startIndex) {
    return {};
  }

  try {
    return JSON.parse(candidate.slice(startIndex, endIndex + 1)) as unknown;
  } catch {
    return {};
  }
}

function readString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];

  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : undefined;
}

function readBoolean(
  record: Record<string, unknown>,
  key: string,
): boolean | undefined {
  const value = record[key];

  return typeof value === 'boolean' ? value : undefined;
}

function sanitizeExtractedClaimPatch(value: unknown): Partial<Claim> {
  if (typeof value !== 'object' || value === null) {
    return {};
  }

  const record = value as Record<string, unknown>;
  const claimPatch: Partial<Claim> = {};

  for (const field of TEXT_FIELDS) {
    const extractedValue = readString(record, field);

    if (extractedValue) {
      claimPatch[field] = extractedValue;
    }
  }

  for (const field of BOOLEAN_FIELDS) {
    const extractedValue = readBoolean(record, field);

    if (extractedValue !== undefined) {
      claimPatch[field] = extractedValue;
    }
  }

  const vehicle = record.insuredVehicle;

  if (typeof vehicle === 'object' && vehicle !== null) {
    const vehicleRecord = vehicle as Record<string, unknown>;
    const vehiclePatch: Vehicle = {};

    for (const field of VEHICLE_FIELDS) {
      const extractedValue = readString(vehicleRecord, field);

      if (extractedValue) {
        vehiclePatch[field] = extractedValue;
      }
    }

    if (Object.keys(vehiclePatch).length > 0) {
      claimPatch.insuredVehicle = vehiclePatch;
    }
  }

  return claimPatch;
}

function buildExtractionContext(state: ConversationState): string {
  const historyStr = state.conversationHistory
    .map((msg) => `${msg.role.toUpperCase()}: ${msg.content}`)
    .join('\n');

  return [
    `conversationStep: ${state.currentConversationStep}`,
    `missingFields: ${state.missingFields.join(', ') || 'none'}`,
    `knownPolicyNumber: ${state.currentClaim.policyNumber ?? 'unknown'}`,
    `knownCallerName: ${state.currentClaim.callerName ?? 'unknown'}`,
    `knownDateOfIncident: ${state.currentClaim.dateOfIncident ?? 'unknown'}`,
    `knownTimeOfIncident: ${state.currentClaim.timeOfIncident ?? 'unknown'}`,
    `knownLocationOfIncident: ${state.currentClaim.locationOfIncident ?? 'unknown'}`,
    `knownVehicleDrivable: ${String(state.currentClaim.vehicleDrivable ?? 'unknown')}`,
    `knownInjuriesReported: ${String(state.currentClaim.injuriesReported ?? 'unknown')}`,
    `knownPoliceReportFiled: ${String(state.currentClaim.policeReportFiled ?? 'unknown')}`,
    `knownPhotosAvailable: ${String(state.currentClaim.photosAvailable ?? 'unknown')}`,
    `\nCONVERSATION HISTORY:\n${historyStr}`,
  ].join('\n');
}

function sentenceCaseName(value: string): string {
  return value
    .trim()
    .replace(/[.!,;:]$/g, '')
    .split(/\s+/)
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(' ');
}

function extractCallerName(message: string): string | undefined {
  const patterns = [
    /\bmy name is\s+([A-Z][A-Za-z.'-]*(?:\s+[A-Z][A-Za-z.'-]*){0,3})/i,
    /\bi am\s+([A-Z][A-Za-z.'-]*(?:\s+[A-Z][A-Za-z.'-]*){0,3})/i,
    /\bthis is\s+([A-Z][A-Za-z.'-]*(?:\s+[A-Z][A-Za-z.'-]*){0,3})/i,
  ];

  for (const pattern of patterns) {
    const match = pattern.exec(message);

    if (match?.[1]) {
      return sentenceCaseName(match[1]);
    }
  }

  return undefined;
}

function extractLocation(message: string): string | undefined {
  const match = /\b(?:near|at|on|in)\s+([A-Z][A-Za-z0-9\s,.'-]*?(?:Road|Street|Avenue|Highway|Junction|Bengaluru|Bangalore|Chennai|Mumbai|Delhi|Pune|Hyderabad|Kolkata|Gurugram|Noida)\b(?:,\s*[A-Z][A-Za-z\s.'-]+)?)/i.exec(message);

  return match?.[1]?.trim().replace(/[.!,;:]$/g, '');
}

function extractIncidentDescription(message: string): string | undefined {
  const normalized = message.trim();

  if (
    /\b(accident|collision|collided|crash|crashed|hit|damage|damaged|bumper|rolled over|rollover|rear[- ]?ended)\b/i.test(
      normalized,
    )
  ) {
    return normalized;
  }

  return undefined;
}

function extractTimeOfIncident(message: string): string | undefined {
  const explicitTime = /\b(?:at|around|about)\s+((?:[01]?\d|2[0-3])(?::[0-5]\d)?\s*(?:am|pm)?)\b/i.exec(message)?.[1];

  if (explicitTime) {
    return explicitTime.trim();
  }

  const clockTime = TIME_PATTERN.exec(message)?.[0];

  if (clockTime) {
    return clockTime.trim();
  }

  const dayPart = /\b(morning|afternoon|evening|night|noon|midnight)\b/i.exec(message)?.[1];

  return dayPart?.toLowerCase();
}

function extractFallbackClaimPatch(message: string): Partial<Claim> {
  const patch: Partial<Claim> = {};
  const policyNumber = POLICY_NUMBER_PATTERN.exec(message)?.[0]?.toUpperCase();
  const callerName = extractCallerName(message);
  const dateOfIncident = ISO_DATE_PATTERN.exec(message)?.[0];
  const timeOfIncident = extractTimeOfIncident(message);
  const locationOfIncident = extractLocation(message);
  const incidentDescription = extractIncidentDescription(message);

  if (policyNumber) {
    patch.policyNumber = policyNumber;
  }

  if (callerName) {
    patch.callerName = callerName;
  }

  if (dateOfIncident) {
    patch.dateOfIncident = dateOfIncident;
  }

  if (timeOfIncident) {
    patch.timeOfIncident = timeOfIncident;
  }

  if (locationOfIncident) {
    patch.locationOfIncident = locationOfIncident;
  }

  if (incidentDescription) {
    patch.incidentDescription = incidentDescription;
  }

  if (/\b(no one|nobody|no injuries|not injured|without injuries)\b/i.test(message)) {
    patch.injuriesReported = false;
  } else if (/\b(injur|hurt|ambulance|hospital|medical)\b/i.test(message)) {
    patch.injuriesReported = true;
  }

  if (/\b(no police report|police report was not|no report was filed)\b/i.test(message)) {
    patch.policeReportFiled = false;
  } else if (/\b(police report|police came|reported to police|fir)\b/i.test(message)) {
    patch.policeReportFiled = true;
  }

  if (/\b(no photos|no pictures|without photos)\b/i.test(message)) {
    patch.photosAvailable = false;
  } else if (/\b(photos|pictures|images)\b/i.test(message)) {
    patch.photosAvailable = true;
  }

  if (/\b(not drivable|not driveable|isn't drivable|cannot be driven|can't drive|towed)\b/i.test(message)) {
    patch.vehicleDrivable = false;
  } else if (/\b(drivable|driveable|can drive|still drives)\b/i.test(message)) {
    patch.vehicleDrivable = true;
  }

  if (/\b(other car|other driver|third party|another vehicle|one other)\b/i.test(message)) {
    patch.otherParties = 'Other party involved';
  }

  return sanitizeExtractedClaimPatch(patch);
}

function getFallbackResult(message: string, state: ConversationState): ExtractClaimDataResult {
  const nextQuestion = "I'm having a temporary connection issue with my AI service. Please give me a moment.";
  
  return {
    responseToUser: nextQuestion,
    conversationAnalysis: 'Fallback triggered due to LLM error (likely 429 Rate Limit) or empty response',
    debugMetrics: {
      rawExtractedSlots: {},
      geminiPrompt: '',
      geminiResponse: '',
    }
  };
}

const responseCache = new Map<string, ExtractClaimDataResult>();

function getCacheKey(input: ExtractClaimDataInput): string {
  return `${input.userMessage.trim()}|${input.state.conversationHistory.length}`;
}

export class GeminiExtractClaimDataService implements ExtractClaimDataService {
  constructor(private readonly options: ExtractClaimDataServiceOptions) {}

  async extract(input: ExtractClaimDataInput): Promise<ExtractClaimDataResult> {
    const cacheKey = getCacheKey(input);
    const cached = responseCache.get(cacheKey);
    if (cached) {
      console.log(`[Gemini Cache Hit] Reusing previous response for: ${cacheKey}`);
      return cached;
    }
    const systemPrompt = [
      'You are an expert conversational AI agent for FNOL motor insurance claims.',
      'You must drive the entire conversation natively, handling safety checks, empathy, policy verification, and data extraction.',
      '',
      'CONVERSATIONAL FLOW:',
      '1. Ensure the user is safe. If not, call the escalate_claim tool.',
      '2. Collect the user\'s policy number and caller name. Once you have both, call the verify_policy tool.',
      '3. Once the policy is verified, collect the remaining claim details (date, time, location, description, vehicles, police reports).',
      '4. When you learn new information, call the save_claim_data tool.',
      '5. When all missing fields are collected, verbally summarize the claim naturally in one conversational sentence, ask the user if it sounds correct, and if they confirm, call the complete_claim tool.',
      '',
      'CONVERSATIONAL EXCELLENCE RULES:',
      '1. EMPATHY: When a user reports an accident, injury, or distress, respond with natural empathy before asking the next question. Example: "I\'m so sorry to hear about the accident, the most important thing is that you\'re safe."',
      '2. SMOOTH TRANSITIONS: Always acknowledge the user\'s previous answer briefly before asking the next question. Vary your phrasing; do not sound like a robotic checklist. Example: "Got it. Let\'s move on to the vehicle details."',
      '3. CONTRADICTIONS: If the user contradicts previously provided information, explicitly ask them to clarify the discrepancy in natural language rather than silently overwriting it.',
      '4. ROBUSTNESS: Robustly normalize ASR imperfections (e.g. "em em eye one zero" -> "MMI-10").',
      '5. CONCISENESS: Keep your responses conversational, natural, and speak like a human. Do NOT ask more than one question per turn.',
      '6. CONTEXT AWARENESS: Read any [System Note] injected into the history and address it naturally (e.g., if a policy fails verification, gently ask them to double-check).',
    ].join('\n');
    const conversationContext = buildExtractionContext(input.state);
    const userPrompt = [
      'Analyze the user message and the conversation history.',
      'Generate the appropriate conversational response and call tools if necessary.',
      '',
      `User message: ${input.userMessage}`,
    ].join('\n');

    const tools = [
      {
        functionDeclarations: [
          {
            name: 'save_claim_data',
            description: 'Save extracted fields to the claim. Call this when you learn new information from the user.',
            parameters: {
              type: 'OBJECT',
              properties: {
                policyNumber: { type: 'STRING' },
                callerName: { type: 'STRING' },
                dateOfIncident: { type: 'STRING' },
                timeOfIncident: { type: 'STRING' },
                locationOfIncident: { type: 'STRING' },
                incidentDescription: { type: 'STRING' },
                otherParties: { type: 'STRING' },
                injuryDetails: { type: 'STRING' },
                policeReportReference: { type: 'STRING' },
                injuriesReported: { type: 'BOOLEAN' },
                policeReportFiled: { type: 'BOOLEAN' },
                photosAvailable: { type: 'BOOLEAN' },
                vehicleDrivable: { type: 'BOOLEAN' },
              }
            }
          },
          {
            name: 'escalate_claim',
            description: 'Flag the claim as urgent and escalate if there is a severe injury or emergency.',
            parameters: {
              type: 'OBJECT',
              properties: {
                reason: { type: 'STRING' }
              }
            }
          },
          {
            name: 'verify_policy',
            description: 'Verify the policy number and caller name against the database. If you are missing the policy number or name, politely ask the user for them in plain English. Do not use variable names like policyNumber in your text response.',
            parameters: {
              type: 'OBJECT',
              properties: {
                policyNumber: { type: 'STRING' },
                callerName: { type: 'STRING' }
              },
              required: ['policyNumber', 'callerName']
            }
          },
          {
            name: 'complete_claim',
            description: 'Complete the claim process once all fields are collected and verified.',
            parameters: {
              type: 'OBJECT',
              properties: {
                summary: { type: 'STRING', description: 'A summary of the claim details to read to the user before ending the call.' }
              },
              required: ['summary']
            }
          }
        ]
      }
    ];

    const result = await this.options.geminiClient.generateAssistantResponse({
      systemPrompt,
      conversationContext,
      userPrompt,
      tools,
      onContentChunk: input.onContentChunk,
    });

    if (result.errorMessage) {
      console.error('[Gemini Extract Error]', JSON.stringify({ error: result.errorMessage, context: 'extractClaimData' }, null, 2));
      return getFallbackResult(input.userMessage, input.state);
    }

    const finalResult: ExtractClaimDataResult = {
      responseToUser: result.assistantResponse || 'Could you tell me more about that?',
      toolCalls: result.toolCalls,
      conversationAnalysis: '',
      debugMetrics: {
        rawExtractedSlots: result.toolCalls,
        geminiPrompt: systemPrompt + '\n' + conversationContext + '\n' + userPrompt,
        geminiResponse: result.assistantResponse,
      }
    };

    responseCache.set(cacheKey, finalResult);
    return finalResult;
  }
}

export function createExtractClaimDataService(
  options: ExtractClaimDataServiceOptions,
): ExtractClaimDataService {
  return new GeminiExtractClaimDataService(options);
}
