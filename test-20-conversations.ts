import 'dotenv/config';
import { createRuntimeConversationManager } from './src/runtime.js';

const scenarios = [
  {
    name: '1. Cooperative caller',
    turns: [
      'Yes, everyone is safe.',
      'My name is Arjun Rao and my policy number is MMI-10234.',
      'It happened yesterday.',
      'At 3pm.',
      'On Main Street.',
      'I rear-ended someone.',
      'No injuries.',
      'No police report.',
      'Yes I have photos.',
      'Yes my car is drivable.',
      'Toyota Camry XYZ 123.',
      'Yes, confirm'
    ]
  },
  {
    name: '2. Impatient caller',
    turns: [
      'Yeah safe. Hurry up.',
      'Arjun Rao MMI-10234.',
      'Today 2pm.',
      'High Street. Hit a pole.',
      'No injuries, no police, yes photos, drivable, Toyota Camry XYZ 123.',
      'Confirm.'
    ]
  },
  {
    name: '3. Caller interrupts / rapid info',
    turns: [
      'Yes safe.',
      'Priya Nair MMI-10871 today at noon on 5th avenue.',
      'Crashed into a guardrail. No injuries, car fine, no police, photos taken, Honda Civic ABC 999.',
      'Confirm.'
    ]
  },
  {
    name: '4. Caller changes previous answer',
    turns: [
      'Yes safe.',
      'Arjun Rao, MMI-10234.',
      'It was yesterday at 3pm.',
      'Actually wait, it was at 4pm, not 3pm.',
      'Main Street. Bumped another car.',
      'No injuries, no police, drivable, Toyota Camry XYZ 123, photos taken.',
      'Confirm.'
    ]
  },
  {
    name: '5. Multiple incidents mentioned',
    turns: [
      'Yes safe.',
      'Arjun Rao, MMI-10234.',
      'I had an accident today at 1pm, and I also had one last month.',
      'I am reporting the one today on Main Street.',
      'Sideswiped a truck. No injuries, no police, drivable, Toyota Camry XYZ 123, photos taken.',
      'Confirm.'
    ]
  },
  {
    name: '6. Ambiguous dates',
    turns: [
      'Yes safe.',
      'Priya Nair, MMI-10871.',
      'It happened a couple of days ago in the afternoon.',
      'On First Avenue.',
      'Hit a tree. No injuries, no police, drivable, Honda Civic ABC 999, photos taken.',
      'Confirm.'
    ]
  },
  {
    name: '7. Noisy wording / filler words',
    turns: [
      'Umm, so like, yeah, we are all okay and safe.',
      'Like, my name is Arjun Rao and policy is MMI-10234, ya know?',
      'Uhh yesterday afternoon around like 3 or 4.',
      'On Main Street near the gas station.',
      'I accidentally bumped into a parked car.',
      'No one hurt, no police, car drives fine, Toyota Camry XYZ 123, got photos.',
      'Yeah confirm it.'
    ]
  },
  {
    name: '8. Corrections',
    turns: [
      'Yes safe.',
      'My policy is MMI-99999.',
      'Wait sorry, I misspoke. My policy is MMI-10234 and name is Arjun Rao.',
      'Yesterday 3pm Main Street.',
      'Hit a pole. No injuries, no police, drivable, Toyota Camry XYZ 123, photos taken.',
      'Confirm.'
    ]
  },
  {
    name: '9. Escalation request / severe injury',
    turns: [
      'No! My passenger is bleeding and we need an ambulance!',
    ]
  },
  {
    name: '10. Callback request / no policy',
    turns: [
      'Yes safe.',
      'I dont have my policy number with me right now.',
      'I really dont know it, can someone call me back?'
    ]
  },
  {
    name: '11. Invalid policy number (2 retries -> callback)',
    turns: [
      'Yes safe.',
      'John Doe, policy INVALID-1.',
      'John Doe, policy INVALID-2.'
    ]
  },
  {
    name: '12. Missing policy number / lost card',
    turns: [
      'Yes safe.',
      'I am Arjun Rao but I lost my policy card.',
      'Can you look me up without it?'
    ]
  },
  {
    name: '13. Emotional caller',
    turns: [
      'Oh my god, I am so shaken up! Yes we are safe thank goodness.',
      'I am Priya Nair, policy MMI-10871.',
      'It just happened an hour ago on 1st Ave.',
      'A car swerved into my lane and scraped my side!',
      'No injuries, no police, car is drivable, Honda Civic ABC 999, took photos.',
      'Please confirm.'
    ]
  },
  {
    name: '14. Complex vehicle details',
    turns: [
      'Yes safe.',
      'Arjun Rao, MMI-10234.',
      'Yesterday 2pm Main Street.',
      'Scratch on bumper.',
      'No injuries, no police, photos taken, drivable.',
      'It is a 2022 Toyota Camry Hybrid, silver, plate number XYZ 123.',
      'Confirm.'
    ]
  },
  {
    name: '15. Third party involved',
    turns: [
      'Yes safe.',
      'Priya Nair, MMI-10871.',
      'Today 10am First Ave.',
      'I backed into a delivery van owned by FedEx.',
      'FedEx driver was present, no injuries, no police, drivable, Honda Civic ABC 999, photos taken.',
      'Confirm.'
    ]
  },
  {
    name: '16. Police report filed',
    turns: [
      'Yes safe.',
      'Arjun Rao, MMI-10234.',
      'Yesterday 3pm Main Street.',
      'Major collision at intersection.',
      'No injuries.',
      'Yes police came and filed report REF-998877.',
      'Photos taken, car drivable, Toyota Camry XYZ 123.',
      'Confirm.'
    ]
  },
  {
    name: '17. Drivability false / Towing needed',
    turns: [
      'Yes safe.',
      'Priya Nair, MMI-10871.',
      'Today 8am 5th Ave.',
      'Hit a median, front axle broke.',
      'No injuries, no police, photos taken.',
      'No, the car is NOT drivable at all, wheel fell off.',
      'Honda Civic ABC 999.',
      'Yes please send a tow truck!',
      'Confirm.'
    ]
  },
  {
    name: '18. Photos available true',
    turns: [
      'Yes safe.',
      'Arjun Rao, MMI-10234.',
      'Yesterday 3pm Main Street.',
      'Minor bump.',
      'No injuries, no police.',
      'Yes I took 15 high-res photos of both cars.',
      'Car drivable, Toyota Camry XYZ 123.',
      'Confirm.'
    ]
  },
  {
    name: '19. Service recommendation acceptance',
    turns: [
      'Yes safe.',
      'Priya Nair, MMI-10871.',
      'Today 8am 5th Ave.',
      'Engine stopped after collision.',
      'No injuries, no police, photos taken, not drivable, Honda Civic ABC 999.',
      'Yes I need towing service please.',
      'Confirm.'
    ]
  },
  {
    name: '20. Late disclosure of injury',
    turns: [
      'Yes safe.',
      'Arjun Rao, MMI-10234.',
      'Yesterday 3pm Main Street.',
      'Minor fender bender.',
      'Actually, my neck is starting to hurt really badly now.',
    ]
  }
];

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function run20Conversations() {
  const manager = createRuntimeConversationManager();
  console.log('Starting Production Review: 20 Realistic FNOL Conversations...\n');

  let passedScenarios = 0;
  let failedScenarios = 0;
  const failures: any[] = [];

  for (const scenario of scenarios) {
    console.log(`==================================================`);
    console.log(`SCENARIO: ${scenario.name}`);
    console.log(`==================================================`);
    
    let state = manager.start();
    let turnCount = 0;
    let scenarioFailed = false;
    let failureReason = '';

    for (const turn of scenario.turns) {
      turnCount++;
      const startTime = Date.now();
      try {
        const result = await manager.handleUserMessage(state, turn);
        const duration = Date.now() - startTime;
        state = result.state;
        
        console.log(`Turn ${turnCount} | User: "${turn}"`);
        console.log(`Turn ${turnCount} | Agent: "${result.action.message}" (${duration}ms)`);

        if (result.action.type === 'escalate') {
          console.log(`[Result: Escalated successfully]`);
          break;
        }
        if (result.action.type === 'offer_callback') {
          console.log(`[Result: Callback offered successfully]`);
          break;
        }
        if (result.action.type === 'complete') {
          console.log(`[Result: Completed successfully]`);
          break;
        }
      } catch (err: any) {
        scenarioFailed = true;
        failureReason = err?.message || String(err);
        console.error(`[CRASH / ERROR in ${scenario.name}]:`, failureReason);
        break;
      }
      
      await sleep(3500); // Sleep to respect Gemini rate limits
    }

    if (scenarioFailed) {
      failedScenarios++;
      failures.push({ name: scenario.name, reason: failureReason });
    } else {
      passedScenarios++;
    }
    console.log(`[End Scenario: ${scenario.name} | Step: ${state.currentConversationStep}]\n`);
  }

  console.log(`==================================================`);
  console.log(`SUMMARY: ${passedScenarios}/20 Passed, ${failedScenarios}/20 Failed`);
  console.log(`==================================================`);
}

run20Conversations().catch(console.error);
