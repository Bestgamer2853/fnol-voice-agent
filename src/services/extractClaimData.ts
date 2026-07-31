import type { ConversationState } from '../conversation/ConversationState.js';
import type { ConversationStep } from '../conversation/types.js';
import type { Claim } from '../types/claim.js';
import type { Vehicle } from '../types/common.js';
import type { LlmProvider } from '../llm/provider.js';

export interface ExtractClaimDataInput {
  userMessage: string;
  state: ConversationState;
  onContentChunk?: ((chunk: string) => void) | undefined;
  toolContext?: {
      assistantMessage: string;
      toolCalls: { id: string, name: string, args: any }[];
      toolResults: { id: string, name: string, result: string }[];
  }[];
  abortSignal?: AbortSignal;
}

export interface ExtractClaimDataResult {
  responseToUser: string;
  toolCalls?: any[] | undefined;
  finishReason?: string;
  conversationAnalysis: string;
  debugMetrics: {
    rawExtractedSlots: unknown;
    geminiPrompt: string;
    geminiResponse: string;
    usageMetadata?: unknown;
    retries?: number;
    ttfbMs?: number;
    ttftMs?: number;
  };
}

export interface ExtractClaimDataService {
  extract(input: ExtractClaimDataInput): Promise<ExtractClaimDataResult>;
}

interface ExtractClaimDataServiceOptions {
  llmProvider: LlmProvider;
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

function readStringArray(
  record: Record<string, unknown>,
  key: string,
): string[] | undefined {
  const value = record[key];
  if (Array.isArray(value)) {
    return value.filter(item => typeof item === 'string') as string[];
  }
  return undefined;
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

  const recommendedServices = readStringArray(record, 'recommendedServices');
  if (recommendedServices && recommendedServices.length > 0) {
    claimPatch.recommendedServices = recommendedServices;
  }

  return claimPatch;
}

function buildExtractionContext(state: ConversationState, fsmInstruction: string, schemaInstruction: string): string {
  const recentHistory = state.conversationHistory.slice(-3);
  const historyStr = recentHistory
    .map((msg) => `${msg.role === 'user' ? 'U' : 'A'}: ${msg.content}`)
    .join('\n');

  const knownFieldsStr = Object.entries(state.currentClaim)
     .filter(([k, v]) => v !== undefined && v !== null && k !== 'insuredVehicle')
     .map(([k, v]) => `${k}:${v}`)
     .join(', ');
  const vehicleStr = state.currentClaim.insuredVehicle ? `insuredVehicle:${JSON.stringify(state.currentClaim.insuredVehicle)}` : '';
  const stateContext = [knownFieldsStr, vehicleStr].filter(Boolean).join(', ');

  return `STATE: ${stateContext || 'None'}\nFSM: ${fsmInstruction}\nSCHEMA: ${schemaInstruction}\nHISTORY:\n${historyStr}`;
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
      retries: 0,
    }
  };
}

export class GeminiExtractClaimDataService implements ExtractClaimDataService {
  constructor(private readonly options: ExtractClaimDataServiceOptions) {}

  async extract(input: ExtractClaimDataInput): Promise<ExtractClaimDataResult> {
    const dateStr = new Date().toISOString().split('T')[0];
    
    const systemPrompt = `FNOL Insurance Agent. Date: ${dateStr}.
RULES:
1. Follow FSM_INSTRUCTION.
2. Be natural & empathetic. Do not ask user for ISO/HH:MM formats.
3. Output valid JSON.`;
    
    let schemaObj: any = {
      responseToUser: "Spoken response",
      extractedData: {}
    };
    
    let fsmInstruction = "Respond naturally and acknowledge their input.";
    if (input.state.pendingClarifications && input.state.pendingClarifications.length > 0) {
        fsmInstruction = `Ask clarification: ${input.state.pendingClarifications[0]?.prompt || ''}`;
    } else if (input.state.missingFields && input.state.missingFields.length > 0) {
        const nextField = input.state.missingFields[0] || 'details';
        fsmInstruction = `Steer conversation to collect ${nextField.replace(/([A-Z])/g, ' $1').toLowerCase()}.`;
        
        if (!input.state.verifiedPolicy) {
            schemaObj.extractedData.policyNumber = "string|null";
            schemaObj.extractedData.callerName = "string|null";
        }

        for (const field of input.state.missingFields.slice(0, 3)) {
            if (field === 'dateOfIncident') {
                 schemaObj.extractedData[field] = "YYYY-MM-DD|null";
            } else if (field === 'timeOfIncident') {
                 schemaObj.extractedData[field] = "HH:MM|null";
            } else {
                 schemaObj.extractedData[field] = "string|boolean|null";
            }
        }
        if (input.state.missingFields.includes('insuredVehicle')) {
             schemaObj.extractedData.insuredVehicle = { make: "str", model: "str", registration: "str" };
        }
    } else if (input.state.currentConversationStep === 'recommending_services') {
        const recommendedServices = input.state.currentClaim.recommendedServices?.join(' and ') || 'towing';
        fsmInstruction = `Recommend ${recommendedServices} and ask if needed.`;
        schemaObj.extractedData.recommendedServices = ["string"];
    } else if (input.state.currentConversationStep === 'completed') {
        fsmInstruction = "Summarize claim verbally; adjuster contacts within 24h.";
    }

    const conversationContext = buildExtractionContext(input.state, fsmInstruction, JSON.stringify(schemaObj));
    const userPrompt = `User message: ${input.userMessage}`;

    const result = await this.options.llmProvider.generateResponse({
      systemPrompt,
      conversationContext,
      userPrompt,
      responseMimeType: 'application/json',
      ...(input.abortSignal ? { abortSignal: input.abortSignal } : {}),
    });

    if (result.errorMessage) {
      console.error('[Gemini Extract Error]', JSON.stringify({ error: result.errorMessage, context: 'extractClaimData' }, null, 2));
      return getFallbackResult(input.userMessage, input.state);
    }

    let parsedResponse: any = {};
    const rawResponse = result.assistantResponse || '{}';
    console.log(`[Diagnostic] Before JSON parse. Length: ${rawResponse.length}, Ends with }: ${rawResponse.trim().endsWith('}')}`);
    try {
        parsedResponse = JSON.parse(rawResponse);
    } catch (e) {
        console.error(`[Diagnostic] JSON.parse exact error:`, e);
        try {
            parsedResponse = extractJsonObject(rawResponse) || {};
        } catch(e2) {
            console.error(`[Diagnostic] extractJsonObject also failed:`, e2);
            parsedResponse = {};
        }
    }

    const finalResult: ExtractClaimDataResult = {
      responseToUser: parsedResponse.responseToUser || "I'm sorry, could you please repeat that?",
      finishReason: result.finishReason || '',
      conversationAnalysis: '',
      debugMetrics: {
        rawExtractedSlots: parsedResponse.extractedData || {},
        geminiPrompt: '[REDACTED]',
        geminiResponse: '[REDACTED]',
        usageMetadata: result.usageMetadata,
        retries: result.retries || 0,
        ...(result.ttfbMs !== undefined ? { ttfbMs: result.ttfbMs } : {}),
        ...(result.ttftMs !== undefined ? { ttftMs: result.ttftMs } : {}),
      },
    };

    return finalResult;
  }
}

export function createExtractClaimDataService(
  options: ExtractClaimDataServiceOptions,
): ExtractClaimDataService {
  return new GeminiExtractClaimDataService(options);
}
