import type { TrackableFnolField } from '../config/requiredFields.js';
import type { Claim } from '../types/claim.js';
import type { Policy } from '../types/policy.js';
import type {
  Contradiction,
  ConversationMessage,
  ConversationStep,
  FollowUpQuestion,
  PendingClarification,
  Severity,
} from './types.js';

export interface ConversationState {
  currentClaim: Claim;
  verifiedPolicy?: Policy;
  conversationHistory: ConversationMessage[];
  collectedFields: TrackableFnolField[];
  missingFields: TrackableFnolField[];
  retryCount: number;
  escalationRequired: boolean;
  severity?: Severity;
  currentConversationStep: ConversationStep;
  contradictions: Contradiction[];
  followUpQuestions: FollowUpQuestion[];
  pendingClarifications: PendingClarification[];
  lastUserMessage?: string;
  lastAssistantMessage?: string;
  verificationAttempts: number;
  empathyPhrasesUsed: string[];
  servicesRecommended?: boolean;
}
