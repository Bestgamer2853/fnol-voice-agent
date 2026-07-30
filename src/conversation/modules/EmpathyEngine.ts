import type { ConversationState } from '../ConversationState.js';

const EMPATHY_PHRASES = [
  "I'm glad everyone is okay.",
  "That sounds stressful.",
  "I appreciate you walking me through that.",
  "Thanks for explaining.",
  "Let's get this sorted.",
  "I understand how frustrating that can be.",
  "I'm sorry you had to go through that.",
  "Thank you for sharing that with me."
];

export class EmpathyEngine {
  public generateEmpathy(state: ConversationState, userMessage: string): { phrase: string | null; updatedPhrasesUsed: string[] } {
    const isDistressing = /\b(stress|scared|hurt|injury|crashed|upset|worried|terrible|horrible|pain)\b/i.test(userMessage);
    const isNeutralUpdate = /\b(happened at|was driving|parked|my car)\b/i.test(userMessage);

    if (!isDistressing && !isNeutralUpdate && state.conversationHistory.length > 2) {
      return { phrase: null, updatedPhrasesUsed: state.empathyPhrasesUsed };
    }

    // Only inject empathy every few turns if not explicitly distressing
    if (!isDistressing && state.conversationHistory.length % 3 !== 0) {
      return { phrase: null, updatedPhrasesUsed: state.empathyPhrasesUsed };
    }

    const availablePhrases = EMPATHY_PHRASES.filter(p => !state.empathyPhrasesUsed.includes(p));
    
    // Reset if we used them all
    const candidates = availablePhrases.length > 0 ? availablePhrases : EMPATHY_PHRASES;
    
    const phrase = candidates[Math.floor(Math.random() * candidates.length)] as string;
    const updatedPhrasesUsed = availablePhrases.length > 0 
      ? [...state.empathyPhrasesUsed, phrase] 
      : [phrase]; // reset history

    return { phrase, updatedPhrasesUsed };
  }
}
