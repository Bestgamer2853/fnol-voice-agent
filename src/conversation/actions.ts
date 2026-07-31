import type { Claim } from '../types/claim.js';
import type { ConversationState } from './ConversationState.js';

export type ConversationAction =
  | { type: 'respond'; message: string }
  | { type: 'request_clarification'; message: string }
  | { type: 'escalate'; message: string; reason: string }
  | { type: 'offer_callback'; message: string }
  | { type: 'recommend_services'; message: string; services: string[] }
  | { type: 'complete'; message: string; claim: Claim };

export interface ConversationTurnResult {
  state: ConversationState;
  action: ConversationAction;
  debugMetrics?: {
    rawExtractedSlots: unknown;
    geminiPrompt: string;
    geminiResponse: string;
    usageMetadata?: unknown;
    retries?: number;
    ttfbMs?: number;
    ttftMs?: number;
  };
}

export interface ConversationManager {
  start(): ConversationState;
  handleUserMessage(
    state: ConversationState,
    message: string,
    onContentChunk?: (chunk: string) => void,
    abortSignal?: AbortSignal,
  ): Promise<ConversationTurnResult>;
}
