import { createExtractClaimDataService } from './src/services/extractClaimData.js';
import { createGeminiService } from './src/services/geminiClient.js';
import dotenv from 'dotenv';
dotenv.config();

async function run() {
  const geminiClient = createGeminiService();
  const service = createExtractClaimDataService({ geminiClient });

  const state = {
    currentClaim: {},
    conversationHistory: [],
    collectedFields: [],
    missingFields: [],
    retryCount: 0,
    escalationRequired: false,
    currentConversationStep: 'safety_check' as any,
    contradictions: [],
    followUpQuestions: [],
    pendingClarifications: [],
    empathyPhrasesUsed: [],
  };

  console.log('Sending to Gemini...');
  const result = await service.extract({
    userMessage: "We're all okay but my car is damaged.",
    state,
    onContentChunk: (chunk) => console.log('Chunk:', chunk)
  });

  console.log('Result:', JSON.stringify(result, null, 2));
}

run().catch(console.error);
