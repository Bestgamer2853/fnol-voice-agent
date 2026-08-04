import { createGeminiService } from '../src/llm/gemini.js';
import 'dotenv/config';

async function run() {
  const llm = createGeminiService();
  const systemPrompt = [
    'You are an expert conversational AI agent for FNOL motor insurance claims.',
    'You act purely as the linguistic translation layer. The ConversationManager (FSM) owns the logic.',
    '',
    'RULES:',
    '1. Follow the FSM_INSTRUCTION strictly. Generate a natural spoken response answering the instruction.',
    '2. EMPATHY: Show empathy exactly once when distress or injury is first detected. Never apologize repetitively. Keep transitions tight ("Got it", "Understood").',
    '3. INFER IMPLICIT DATA: If the user says they went to a hospital, infer injuriesReported=true. If their car was towed, infer vehicleDrivable=false.',
    '4. DO NOT generate fields that are not present in the JSON_SCHEMA. Only extract what you are explicitly asked for.',
    '5. CONFIDENCE: Give a confidence score (0.0 to 1.0) on how clearly the user answered the missing fields. If it was mumbled or unrelated, score it low.',
    '',
    'JSON OUTPUT REQUIRED:',
    'You must strictly output a valid JSON object matching the JSON_SCHEMA provided in the context.',
  ].join('\n');

  const conversationContext = [
    'FSM_INSTRUCTION: Acknowledge any new info briefly and naturally, then ask the user to provide their policy number.',
    'JSON_SCHEMA:',
    '{',
    '  "extractedData": {',
    '    "confidence": "number (0.0 to 1.0)",',
    '    "policyNumber": "string or boolean or null"',
    '  },',
    '  "responseToUser": "Your spoken conversational response here."',
    '}',
    'RECENT_HISTORY:',
    'ASSISTANT: Hello, thank you for calling... are you and everyone else currently safe?',
  ].join('\n');

  const userPrompt = [
    'Output a JSON object containing both the extracted data and the conversational response.',
    '',
    'User message: Yeah. We\'re all safe.',
  ].join('\n');

  console.log("Sending request to LLM...");
  const result = await llm.generateResponse({
    systemPrompt,
    conversationContext,
    userPrompt,
    responseMimeType: 'application/json'
  });
  
  console.log("=== Isolated Request Results ===");
  console.log(`HTTP Status: 200 (assume 200 if no errorMessage, otherwise check logs)`);
  console.log(`ErrorMessage: ${result.errorMessage || 'None'}`);
  console.log(`Finish Reason: ${result.finishReason}`);
  console.log(`Usage: ${JSON.stringify(result.usageMetadata)}`);
  console.log(`Raw assistantResponse:\n${result.assistantResponse}`);
  console.log(`Ends with '}': ${(result.assistantResponse || '').trim().endsWith('}')}`);
}

run().catch(console.error);
