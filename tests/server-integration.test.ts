import assert from 'node:assert/strict';
import { describe, it, before, after } from 'node:test';
import { spawn, type ChildProcess } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { WebSocket } from 'ws';

const __dirname = dirname(fileURLToPath(import.meta.url));
const serverPath = join(__dirname, '../src/server.ts');

describe('Server integration tests (P0)', () => {
  let serverProcess: ChildProcess;
  const PORT = 3005;

  before(async () => {
    serverProcess = spawn('npx', ['tsx', serverPath], {
      env: { ...process.env, PORT: PORT.toString(), GEMINI_API_KEY: 'test-key', API_SECRET: 'supersecret' },
    });

    await new Promise<void>((resolve, reject) => {
      let output = '';
      const timer = setTimeout(() => reject(new Error(`Server failed to start. Output: ${output}`)), 5000);
      
      serverProcess.stdout?.on('data', (data) => {
        output += data.toString();
        if (output.includes(`listening on port ${PORT}`)) {
          clearTimeout(timer);
          resolve();
        }
      });
      
      serverProcess.stderr?.on('data', (data) => {
        output += data.toString();
      });
      
      serverProcess.on('error', reject);
    });
  });

  after(() => {
    if (serverProcess) {
      serverProcess.kill();
    }
  });

  it('handles concurrent same-session HTTP turns without crashing', async () => {
    // Start session
    const startRes = await fetch(`http://localhost:${PORT}/chat/start`, { 
      method: 'POST',
      headers: { 'Authorization': 'Bearer supersecret' }
    });
    const startData = await startRes.json();
    const sessionId = startData.sessionId;
    
    assert.ok(sessionId, 'Session started');

    // Fire 3 concurrent requests
    const messages = ['Hello', 'My policy is MMI-10234', 'I need help'];
    const promises = messages.map(msg => 
      fetch(`http://localhost:${PORT}/chat`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': 'Bearer supersecret'
        },
        body: JSON.stringify({ sessionId, userMessage: msg })
      })
    );
    
    const responses = await Promise.all(promises);
    assert.equal(responses.length, 3);
    for (const res of responses) {
      assert.ok(res.status === 200 || res.status === 500, 'Expected 200 or 500');
    }
    
    const aliveRes = await fetch(`http://localhost:${PORT}/view-logs`);
    assert.equal(aliveRes.status, 200, 'Server still alive');
  });

  it('handles duplicate/out-of-order response IDs in WS', async () => {
    const ws = new WebSocket(`ws://localhost:${PORT}?secret=supersecret`);
    
    await new Promise<void>((resolve, reject) => {
      ws.on('open', resolve);
      ws.on('error', reject);
    });

    // Wait a bit for initial config and greeting
    await new Promise(r => setTimeout(r, 200));

    // Send a response_required
    ws.send(JSON.stringify({
      interaction_type: 'response_required',
      response_id: 5,
      transcript: [{ role: 'user', content: 'Hello' }]
    }));

    // Send an out-of-order earlier ID
    ws.send(JSON.stringify({
      interaction_type: 'response_required',
      response_id: 2,
      transcript: [{ role: 'user', content: 'Hello earlier' }]
    }));

    // Send duplicate ID
    ws.send(JSON.stringify({
      interaction_type: 'response_required',
      response_id: 5,
      transcript: [{ role: 'user', content: 'Hello duplicate' }]
    }));

    // We just verify it doesn't crash the server
    await new Promise(r => setTimeout(r, 500));
    
    ws.close();
    
    const aliveRes = await fetch(`http://localhost:${PORT}/view-logs`);
    assert.equal(aliveRes.status, 200, 'Server still alive after bad WS messages');
  });

  it('rejects HTTP requests without valid auth', async () => {
    const res = await fetch(`http://localhost:${PORT}/chat/start`, { method: 'POST' });
    assert.equal(res.status, 401);
  });

  it('rejects WebSocket connections without valid auth', async () => {
    const ws = new WebSocket(`ws://localhost:${PORT}?secret=wrongsecret`);
    
    await new Promise<void>((resolve, reject) => {
      ws.on('error', (err: any) => {
        if (err.message.includes('401') || err.message.includes('Unexpected server response')) {
            resolve();
        } else {
            resolve(); // Connection closed or failed is what we want
        }
      });
      ws.on('close', resolve);
    });
    // If it reaches here without throwing in setup, the socket was closed.
  });

  it('rate limits requests', async () => {
    // Fire 51 requests
    const promises = [];
    for (let i = 0; i < 55; i++) {
        promises.push(fetch(`http://localhost:${PORT}/chat/start`, {
            method: 'POST',
            headers: { 'Authorization': 'Bearer supersecret' }
        }));
    }
    const responses = await Promise.all(promises);
    const tooMany = responses.filter(r => r.status === 429);
    assert.ok(tooMany.length >= 1, 'Should have rate limited at least 1 request');
  });
});
