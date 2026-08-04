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

async function runTest() {
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
      console.log('✅ CLAIM COMPLETION & DISCONNECT CONFIRMED FROM RAILWAY!');
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

  send(ws, { 
    interaction_type: 'call_details', 
    call: { 
      call_id: `test-ack-${Date.now()}`,
      metadata: {}
    } 
  });
  await sleep(3000);

  // Turn 1
  console.log('\n--- Turn 1: Safety Check ---');
  simulateUserTurn(ws, 'Yes, everyone is safe.');
  await sleep(5000);

  // Turn 2
  console.log('\n--- Turn 2: Policy Verification ---');
  simulateUserTurn(ws, 'My name is Arjun Rao and my policy number is MMI-10234.');
  await sleep(6000);

  // Turn 3
  console.log('\n--- Turn 3: Complete Details ---');
  simulateUserTurn(ws, 'My vehicle is Hyundai i20 TN-58-AB-1234. Incident happened yesterday July 31 at 3 PM on Main Street. I rear-ended Toyota Corolla DEF-456. No injuries, no police report, I have photos, car is drivable. No towing needed.');
  await sleep(8000);

  // Turn 4
  console.log('\n--- Turn 4: Confirm ---');
  simulateUserTurn(ws, 'Yes, confirm and submit.');
  await sleep(8000);

  // Turn 5
  console.log('\n--- Turn 5: Photos / Extra details ---');
  simulateUserTurn(ws, 'No extra photos, no other details.');
  await sleep(8000);

  // Turn 6
  console.log('\n--- Turn 6: Final Ack / Bye ---');
  simulateUserTurn(ws, "No thanks, that's everything. Goodbye!");
  await sleep(8000);

  ws.close();
  console.log('\n===== END TO END CLAIM TEST FINISHED =====');
  console.log(`Claim Completion Flag (end_call): ${claimCompleted}`);
  console.log(`Final Response: "${finalServerMessage}"\n`);

  if (!claimCompleted) {
    process.exit(1);
  }
}

runTest().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
