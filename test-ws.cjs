const WebSocket = require('ws');

const WS_URL = process.argv[2] || 'ws://localhost:3000';
let responseIdCounter = 0;
const transcript = [];

function send(ws, obj) {
  const str = JSON.stringify(obj);
  console.log(`\n>>> SENDING: interaction_type=${obj.interaction_type}, response_id=${obj.response_id}`);
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
    transcript: [...transcript],
  });
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runTest() {
  console.log(`Connecting to ${WS_URL}...`);
  const ws = new WebSocket(WS_URL);
  
  const messages = [];
  
  ws.on('message', (data) => {
    const parsed = JSON.parse(data.toString());
    console.log(`\n<<< RECEIVED (response_id=${parsed.response_id}):`);
    console.log(`    "${parsed.content}"`);
    console.log(`    end_call=${parsed.end_call}`);
    messages.push(parsed);
    
    if (parsed.content) {
      buildTranscript('agent', parsed.content);
    }
  });

  ws.on('error', (err) => {
    console.error('WebSocket error:', err.message);
    process.exit(1);
  });

  await new Promise((resolve) => ws.on('open', resolve));
  console.log('\n===== CONNECTED =====\n');

  // TEST 1: Greeting
  console.log('\n===== TEST 1: GREETING =====');
  send(ws, { interaction_type: 'call_details', call: { call_id: 'test-full' } });
  await sleep(2000);
  
  const greeting = messages[0];
  const greetingOk = greeting && greeting.content.includes('safe');
  console.log(greetingOk ? 'PASS: Greeting asks about safety' : 'FAIL: No safety question in greeting');

  // TEST 2: Safety check
  console.log('\n===== TEST 2: SAFETY CHECK =====');
  simulateUserTurn(ws, 'Yes, everyone is fine. We are all safe.');
  await sleep(4000);

  const safetyResp = messages[1];
  const safetyOk = safetyResp && safetyResp.content.includes('policy');
  console.log(safetyOk ? 'PASS: Moved to policy verification' : 'FAIL: Did not advance to verification');

  // TEST 3: Policy verification with REAL policy
  console.log('\n===== TEST 3: POLICY VERIFICATION =====');
  simulateUserTurn(ws, 'My policy number is MMI-10234 and my name is Arjun Rao.');
  await sleep(5000);

  const verifyResp = messages[2];
  const verifyOk = verifyResp && !verifyResp.content.includes('policyNumber and callerName') && !verifyResp.content.includes('No policy found');
  console.log(verifyOk ? 'PASS: Policy verified, advanced to FNOL collection' : 'FAIL: Policy verification failed');

  // TEST 4: Mixed initiative — user provides lots of info at once
  console.log('\n===== TEST 4: MIXED INITIATIVE =====');
  simulateUserTurn(ws, 'I was rear ended yesterday at 5 PM near Marina Beach Chennai. Nobody was injured. The car won\'t start.');
  await sleep(5000);

  const mixedResp = messages[3];
  console.log(mixedResp ? 'PASS: Response received after mixed initiative' : 'FAIL: No response');

  // TEST 5: Contradiction handling
  console.log('\n===== TEST 5: CONTRADICTION =====');
  simulateUserTurn(ws, 'Actually, it was not a rear end collision. A truck hit my side door.');
  await sleep(5000);

  const contraResp = messages[4];
  const contraOk = contraResp && !contraResp.content.toLowerCase().includes('accuse');
  console.log(contraOk ? 'PASS: Non-accusatory contradiction handling' : 'FAIL: Accusatory response');

  // TEST 6: Continue providing missing fields
  console.log('\n===== TEST 6: CONTINUE PROVIDING DETAILS =====');
  simulateUserTurn(ws, 'No police report was filed. I don\'t have photos yet.');
  await sleep(5000);

  const continueResp = messages[5];
  console.log(continueResp ? 'PASS: Conversation continues' : 'FAIL: No response');

  // Final summary
  console.log('\n\n========== FULL TEST SUMMARY ==========');
  console.log(`Total messages received: ${messages.length}`);
  messages.forEach((m, i) => {
    console.log(`\n  [${i}] response_id=${m.response_id} end_call=${m.end_call}`);
    console.log(`      "${m.content?.substring(0, 120)}"`);
  });
  
  const results = [
    { name: 'Greeting speaks first with safety', pass: greetingOk },
    { name: 'Safety check advances to verification', pass: safetyOk },
    { name: 'Policy verifies with real data', pass: verifyOk },
    { name: 'Mixed initiative response', pass: !!mixedResp },
    { name: 'Contradiction non-accusatory', pass: contraOk },
    { name: 'Conversation continues', pass: !!continueResp },
  ];
  
  console.log('\n\n========== RESULTS ==========');
  let allPass = true;
  results.forEach(r => {
    const icon = r.pass ? '✓' : '✗';
    console.log(`  ${icon} ${r.name}`);
    if (!r.pass) allPass = false;
  });
  console.log(allPass ? '\nALL TESTS PASSED' : '\nSOME TESTS FAILED');
  
  ws.close();
  // Give time for close handler
  await sleep(500);
  process.exit(allPass ? 0 : 1);
}

runTest().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
