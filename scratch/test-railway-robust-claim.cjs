const WebSocket = require('ws');
const http = require('http');
const https = require('https');

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

async function waitForServerResponse(ws, userMessage) {
  buildTranscript('user', userMessage);
  responseIdCounter++;
  
  const turnId = responseIdCounter;
  console.log(`\n--- Sending User Turn ${turnId}: "${userMessage}" ---`);

  const responsePromise = new Promise((resolve) => {
    const handler = (data) => {
      try {
        const parsed = JSON.parse(data.toString());
        if (parsed.response_type === 'response' && parsed.response_id === turnId && parsed.content_complete) {
          ws.off('message', handler);
          resolve(parsed);
        }
      } catch (e) {}
    };
    ws.on('message', handler);
  });

  send(ws, {
    interaction_type: 'response_required',
    response_id: turnId,
    transcript: [...transcript]
  });

  const res = await responsePromise;
  console.log(`<<< SERVER TURN ${turnId} RESPONSE COMPLETE: "${res.content}"`);
  return res;
}

async function runLiveTest() {
  console.log(`Connecting to Railway Backend: ${WS_URL}...`);
  const ws = new WebSocket(WS_URL);

  let claimCompleted = false;

  ws.on('message', (data) => {
    const parsed = JSON.parse(data.toString());
    if (parsed.content) {
      buildTranscript('agent', parsed.content);
    }
    if (parsed.end_call) {
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
      call_id: `test-live-nodemail-${Date.now()}`,
      metadata: {}
    } 
  });
  await new Promise(r => setTimeout(r, 2000));

  // Turn 1: Safety
  await waitForServerResponse(ws, 'Yes, everyone is safe.');

  // Turn 2: Policy & Name
  await waitForServerResponse(ws, 'My name is Arjun Rao and my policy number is MMI-10234.');

  // Turn 3: Complete details dump
  await waitForServerResponse(ws, 'My vehicle is a Hyundai i20 registration TN-58-AB-1234. It happened yesterday July 31 at 3 PM on Main Street. I rear-ended Toyota Corolla DEF-456. No injuries, no police report, I took photos, car is drivable. No towing needed.');

  // Turn 4: Confirmation
  await waitForServerResponse(ws, 'Yes, please confirm and submit.');

  // Turn 5: Extra photos / drivability
  await waitForServerResponse(ws, 'Yes, car is drivable, I have photos, no extra details.');

  // Turn 6: Goodbye
  const finalTurn = await waitForServerResponse(ws, "No thanks, that's everything. Goodbye!");

  ws.close();
  console.log('\n========================================');
  console.log('✅ ALL TURNS COMPLETED SEQUENTIALLY!');
  console.log(`Final Response: "${finalTurn.content}"`);
  console.log('========================================\n');
}

runLiveTest().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
