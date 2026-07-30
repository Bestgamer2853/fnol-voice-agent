const WebSocket = require('ws');

const WS_URL = process.argv[2] || 'wss://fnol-voice-agent-production.up.railway.app/';
let responseIdCounter = 0;
const transcript = [];

function send(ws, obj) {
  const str = JSON.stringify(obj);
  console.log(`\n>>> SERVER -> RETELL`);
  console.log(str);
  ws.send(str);
}

function buildTranscript(role, content) {
  transcript.push({ role, content });
  return [...transcript];
}

function simulateUserTurn(ws, userMessage) {
  buildTranscript('user', userMessage);
  responseIdCounter++;
  
  // Note: Using Retell's exact protocol
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
  console.log(`Connecting to ${WS_URL}...`);
  const ws = new WebSocket(WS_URL);
  
  ws.on('message', (data) => {
    const parsed = JSON.parse(data.toString());
    console.log(`\n<<< RETELL -> SERVER`);
    console.log(JSON.stringify(parsed, null, 2));
    
    // We append the agent's responses to our transcript for the next turn
    if (parsed.content) {
      buildTranscript('agent', parsed.content);
    }
  });

  ws.on('error', (err) => {
    console.error('WebSocket error:', err.message);
    process.exit(1);
  });

  await new Promise((resolve) => ws.on('open', resolve));
  console.log('\n===== CONNECTED TO RAILWAY =====\n');

  // TASK 1 & 3: Send call_details (EXACT Retell packet)
  console.log('\n[EVENT 1] Sending call_details...');
  send(ws, { 
    interaction_type: 'call_details', 
    call: { 
      call_id: 'test-railway-123',
      metadata: {}
    } 
  });
  await sleep(3000); // wait for greeting
  
  // TASK 2: Send ping just to mimic keep-alive
  console.log('\n[EVENT 2] Sending ping...');
  send(ws, { interaction_type: 'ping', timestamp: Date.now() });
  await sleep(2000);

  // Send update_only
  console.log('\n[EVENT 3] Sending update_only...');
  buildTranscript('user', 'Wait...'); // partial utterance
  send(ws, {
    interaction_type: 'update_only',
    transcript: [...transcript]
  });
  await sleep(2000);

  // User completes utterance
  console.log('\n[EVENT 4] Sending response_required...');
  // Overwrite the last partial with the full utterance
  transcript.pop(); 
  simulateUserTurn(ws, 'Yes, everyone is safe.');
  await sleep(5000);

  console.log('\n[EVENT 5] Sending another response_required (Policy info)...');
  simulateUserTurn(ws, 'My policy is MMI-10234 and I am Arjun Rao.');
  await sleep(6000);
  
  console.log('\n[EVENT 6] Sending another response_required (Missing info)...');
  simulateUserTurn(ws, 'I crashed.');
  await sleep(6000);
  
  ws.close();
  console.log('\n===== TEST COMPLETE =====\n');
  process.exit(0);
}

runTest().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
