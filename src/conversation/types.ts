import type { TrackableFnolField } from '../config/requiredFields.js';

export type MessageRole = 'user' | 'assistant' | 'system';

export type Severity = 'low' | 'medium' | 'high';

export type ConversationStep =
  | 'safety_check'
  | 'greeting'
  | 'verification'
  | 'collecting_fnol'
  | 'clarifying'
  | 'recommending_services'
  | 'reviewing_summary'
  | 'confirming'
  | 'escalation'
  | 'callback_offer'
  | 'completed';

export interface ConversationMessage {
  role: MessageRole;
  content: string;
  timestamp: string;
}

export interface Contradiction {
  field: TrackableFnolField;
  description: string;
  priorValue?: string;
  newValue?: string;
}

export interface FollowUpQuestion {
  field: TrackableFnolField;
  question: string;
}

export interface PendingClarification {
  field: TrackableFnolField;
  prompt: string;
}
