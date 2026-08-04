const WebSocket = require('ws');

const WS_URL = process.argv[2] || 'wss://fnol-voice-agent-production.up.railway.app/';
let responseIdCounter = 0;
const transcript = [];

function send(ws, obj) {
  const str = JSON.stringify(obj);
  console.log(`\n>>> CLIENT -> RAILWAY SERVER (${obj.interaction_type || obj.response_type})`);
  ws.send(str);
}

function buildTranscript(role, content) {
  transcript.push({ role, content });
  return [...transcript];
}

function simulateUserTurn(ws, userMessage) {
  buildTranscript('user', userMessage);
  responseIdCounter++;
  
  send(ws, {
    interaction_type: 'response_required',
    response_id: responseIdCounter,
    transcript: [...transcript]
  });
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runFullClaim() {
  console.log(`Connecting to Railway WebSocket: ${WS_URL}...`);
  const ws = new WebSocket(WS_URL);

  let claimCompleted = false;
  let finalServerMessage = '';

  ws.on('message', (data) => {
    const parsed = JSON.parse(data.toString());
    console.log(`\n<<< RAILWAY SERVER RESPONSE:`);
    console.log(JSON.stringify(parsed, null, 2));

    if (parsed.content) {
      buildTranscript('agent', parsed.content);
      finalServerMessage = parsed.content;
    }

    if (parsed.end_call) {
      console.log('\n========================================');
      console.log('✅ CLAIM COMPLETION & CALL DISCONNECT DETECTED FROM RAILWAY!');
      console.log('========================================');
      claimCompleted = true;
    }
  });

  ws.on('error', (err) => {
    console.error('WebSocket error:', err.message);
    process.exit(1);
  });

  await new Promise((resolve) => ws.on('open', resolve));
  console.log('\n===== CONNECTED TO RAILWAY BACKEND =====\n');

  // Step 1: Initial call_details packet
  send(ws, { 
    interaction_type: 'call_details', 
    call: { 
      call_id: `test-e2e-smtp-${Date.now()}`,
      metadata: {}
    } 
  });
  await sleep(3000);

  // Step 2: Safety Check Answer
  console.log('\n--- Turn 1: Safety Check ---');
  simulateUserTurn(ws, 'Yes, everyone is safe.');
  await sleep(5000);

  // Step 3: Verification
  console.log('\n--- Turn 2: Policy Verification ---');
  simulateUserTurn(ws, 'My name is Arjun Rao and my policy number is MMI-10234.');
  await sleep(6000);

  // Step 4: Incident Details Dump
  console.log('\n--- Turn 3: Incident Details Dump ---');
  simulateUserTurn(ws, 'It happened yesterday at 3 PM on Main Street. I rear-ended a silver sedan. No injuries, no police report, I took photos, the car is drivable, vehicle is Hyundai i20 registration TN-58-AB-1234.');
  await sleep(8000);

  // Step 5: Answer any missing detail
  console.log('\n--- Turn 4: Other parties & Towing ---');
  simulateUserTurn(ws, 'The other vehicle was a Toyota Corolla plate DEF-456. No towing needed.');
  await sleep(8000);

  // Step 6: Confirmation
  console.log('\n--- Turn 5: Confirm details ---');
  simulateUserTurn(ws, 'Yes, that is correct, please log the claim.');
  await sleep(8000);

  // Step 7: Final Goodbye / Disconnect Ack
  console.log('\n--- Turn 6: Final Ack & Goodbye ---');
  simulateUserTurn(ws, "No, that is everything. Thank you, goodbye!");
  await sleep(8000);

  ws.close();
  console.log('\n===== END TO END CLAIM TEST FINISHED =====');
  console.log(`Claim Completion Flag (end_call): ${claimCompleted}`);
  console.log(`Final Response: "${finalServerMessage}"\n`);

  if (!claimCompleted) {
    process.exit(1);
  }
}

runFullClaim().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
