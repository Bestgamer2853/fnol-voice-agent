import 'dotenv/config';

async function fetchStream(name: string, url: string, apiKey: string, model: string) {
  console.log(`\n\n=== [${name}] Request ===`);
  console.log(`URL: ${url}`);
  console.log(`Model: ${model}`);
  
  const payload = {
    model: model,
    messages: [
      { role: 'system', content: 'You are a helpful assistant. Output a valid JSON.' },
      { role: 'user', content: 'Output exactly this JSON: {"status": "ok"}' }
    ],
    temperature: 0.0,
    stream: true,
    response_format: { type: 'json_object' }
  };
  
  console.log(`Payload: ${JSON.stringify(payload)}`);

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify(payload)
  });

  console.log(`\n=== [${name}] Response Headers ===`);
  console.log(`Status: ${response.status} ${response.statusText}`);
  
  if (!response.ok) {
    console.log(`Error: ${await response.text()}`);
    return;
  }

  const reader = response.body!.getReader();
  const decoder = new TextDecoder('utf-8');
  let fullAssistantResponse = '';
  
  console.log(`\n=== [${name}] Stream Chunks ===`);
  let chunkCount = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunkStr = decoder.decode(value, { stream: true });
    console.log(`[Chunk ${++chunkCount}]:\n${chunkStr}`);
  }
}

async function run() {
  const groqKey = process.env.GROQ_API_KEY!;
  const geminiKey = process.env.GEMINI_API_KEY!;

  await fetchStream(
    'Groq', 
    'https://api.groq.com/openai/v1/chat/completions', 
    groqKey, 
    'llama-3.3-70b-versatile'
  );
  
  await fetchStream(
    'Gemini', 
    'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', 
    geminiKey, 
    'gemini-1.5-flash-latest'
  );
}

run().catch(console.error);
