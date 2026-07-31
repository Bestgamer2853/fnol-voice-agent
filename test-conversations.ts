import 'dotenv/config';
import { createRuntimeConversationManager } from './src/runtime.js';

const scenarios = [
  {
    name: 'Happy path',
    turns: [
      'Yes, everyone is safe.',
      'My name is Arjun Rao and my policy number is MMI-10234.',
      'It happened yesterday.',
      'At 3pm.',
      'On Main Street.',
      'I rear-ended someone.',
      'Just the other car.',
      'No one was hurt.',
      'No police report.',
      'Yes I have photos.',
      'Yes my car is drivable.',
      'The make is Toyota, model is Camry, registration is XYZ 123.',
      'Yes, confirm'
    ]
  },
  {
    name: 'Phonetic Policy & Natural Numbers',
    turns: [
      'Yeah we are safe.',
      'I am Priya Nair. My policy is mike mike india one zero eight seven one.',
      'It was today at two thirty in the afternoon.',
      'I crashed into a pole on First Avenue.',
      'No one else was involved, no injuries, no police, I took a picture.',
      'The car still drives fine.',
      'It is a Honda Civic, plate ABC 999.',
      'Looks good.'
    ]
  },
  {
    name: 'Emergency / Escalation',
    turns: [
      'No, my car is on fire and I need help!',
    ]
  },
  {
    name: 'Wrong policy',
    turns: [
      'Yes we are safe.',
      'I am Bob. Policy is BAD-999.', // Should trigger retry
      'Okay, wait, it is MMI-10234 and I am Arjun Rao.'
    ]
  },
  {
    name: 'Towing recommendation',
    turns: [
      'Yes, safe.',
      'Arjun Rao, MMI-10234.',
      'Yesterday at 3pm on Main Street.',
      'I crashed.',
      'No one else. No injuries. No police. No photos.',
      'My car is not drivable.',
      'Toyota Camry XYZ 123.',
      'Yes, please arrange towing.',
      'Yes, confirm'
    ]
  }
];

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function runTests() {
  const manager = createRuntimeConversationManager();
  console.log('Starting Automated Conversation Tests...');

  for (const scenario of scenarios) {
    console.log(`\n========================================`);
    console.log(`Running Scenario: ${scenario.name}`);
    console.log(`========================================`);
    
    let state = manager.start();
    console.log(`Agent: ${state.lastAssistantMessage}`);

    for (const turn of scenario.turns) {
      console.log(`\nUser: ${turn}`);
      const result = await manager.handleUserMessage(state, turn);
      state = result.state;
      console.log(`Agent: ${result.action.message}`);
      
      if (result.action.type === 'escalate' || result.action.type === 'complete') {
        console.log(`[Scenario ended early with ${result.action.type}]`);
        break;
      }
      
      await sleep(4000); // Respect Gemini Free Tier 15 RPM limit
    }
    
    console.log(`\n[Scenario ${scenario.name} Completed. Final Step: ${state.currentConversationStep}]`);
  }
}

runTests().catch(console.error);
