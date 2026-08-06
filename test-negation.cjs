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

  // Start call
  console.log('\n===== START CALL =====');
  send(ws, { interaction_type: 'call_details', call: { call_id: 'test-negation' } });
  await sleep(2000);
  
  // User says they are safe
  console.log('\n===== USER SAYS SAFE =====');
  simulateUserTurn(ws, 'Yes, everyone is fine. We are all safe.');
  await sleep(4000);

  // User provides policy and mentions "crashed" but says "Nobody's injured"
  console.log('\n===== USER PROVIDES POLICY AND SAYS "NOBODY\'S INJURED" =====');
  simulateUserTurn(ws, 'My name is Priya Nair. And my policy number is MMI-10871. I just crashed my car into a tree. Nobody\'s injured. I don\'t have photos.');
  await sleep(5000);

  // Test "no one is hurt" pattern
  console.log('\n===== TEST "NO ONE IS HURT" PATTERN =====');
  const finalResponse = messages[messages.length - 1];
  const noEscalationAfterNobody = finalResponse && finalResponse.end_call === false;
  console.log(noEscalationAfterNobody ? 'PASS: No escalation with "Nobody\'s injured"' : 'FAIL: Escalation triggered');

  // Continue with another test - "no one is hurt"
  simulateUserTurn(ws, 'No one is hurt either. Everyone is fine.');
  await sleep(5000);

  // Final summary
  console.log('\n\n========== TEST SUMMARY ==========');
  console.log(`Total messages received: ${messages.length}`);
  messages.forEach((m, i) => {
    console.log(`\n  [${i}] response_id=${m.response_id} end_call=${m.end_call}`);
    console.log(`      "${m.content?.substring(0, 120)}"`);
  });
  
  // Check if the last response had end_call=false (should NOT escalate)
  const lastResponse = messages[messages.length - 1];
  const noEscalation = lastResponse && lastResponse.end_call === false;
  
  console.log('\n\n========== RESULTS ==========');
  console.log(`  ${noEscalationAfterNobody ? '✓' : '✗'} No escalation with "Nobody\'s injured"`);
  console.log(`  ${noEscalation ? '✓' : '✗'} No escalation with "no one is hurt"`);
  const allPassed = noEscalationAfterNobody && noEscalation;
  console.log(allPassed ? '\nTEST PASSED - No escalation with negated injury keywords' : '\nTEST FAILED - Incorrect escalation despite negation');
  
  ws.close();
  await sleep(500);
  process.exit(allPassed ? 0 : 1);
}

runTest().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
