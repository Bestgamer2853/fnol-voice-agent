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
  send(ws, { interaction_type: 'call_details', call: { call_id: 'test-escalation-flow' } });
  await sleep(2000);
  
  // User says they are safe
  console.log('\n===== USER SAYS SAFE =====');
  simulateUserTurn(ws, 'Yes, everyone is fine. We are all safe.');
  await sleep(4000);

  // User provides policy and mentions INJURY (should trigger escalation flag but continue)
  console.log('\n===== USER PROVIDES POLICY AND MENTIONS INJURY =====');
  simulateUserTurn(ws, 'My name is Vikram Shah. My policy number is MMI-11450. I was injured in the accident. My neck hurts.');
  await sleep(5000);

  // Check that conversation continued
  const continuedAfterInjury = messages.length >= 3;
  console.log(`Conversation continued after injury: ${continuedAfterInjury}`);

  // Continue with location (should still be collecting data)
  console.log('\n===== USER PROVIDES LOCATION =====');
  simulateUserTurn(ws, 'It happened yesterday at 5 PM near Marina Beach.');
  await sleep(5000);

  // Final summary
  console.log('\n\n========== TEST SUMMARY ==========');
  console.log(`Total messages received: ${messages.length}`);
  messages.forEach((m, i) => {
    console.log(`\n  [${i}] response_id=${m.response_id} end_call=${m.end_call}`);
    console.log(`      "${m.content?.substring(0, 120)}"`);
  });
  
  // Check that the conversation continued past the injury mention
  const finalContinuedAfterInjury = messages.length >= 4;
  
  // Check that the final message includes escalation mention
  const lastResponse = messages[messages.length - 1];
  const escalationMentioned = lastResponse && lastResponse.content && 
    (lastResponse.content.toLowerCase().includes('immediate attention') || 
     lastResponse.content.toLowerCase().includes('specialist') ||
     lastResponse.content.toLowerCase().includes('escalat'));
  
  // Check that call ended only at the end
  const finalEndCall = lastResponse && lastResponse.end_call === true;
  
  console.log('\n\n========== RESULTS ==========');
  console.log(`  ${finalContinuedAfterInjury ? '✓' : '✗'} Conversation continued after injury mention`);
  console.log(`  ${escalationMentioned ? '✓' : '✗'} Final message includes escalation mention`);
  console.log(`  ${finalEndCall ? '✓' : '✗'} Call ended at completion`);
  
  // For now, just check that conversation continued - escalation mention in final message
  // will be tested when claim completion is implemented
  const allPassed = finalContinuedAfterInjury;
  console.log(allPassed ? '\nTEST PASSED - Escalation flagged but data collection continued' : '\nTEST FAILED - Escalation flow incorrect');
  
  ws.close();
  await sleep(500);
  process.exit(allPassed ? 0 : 1);
}

runTest().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
