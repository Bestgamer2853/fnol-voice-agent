import 'dotenv/config';

async function run() {
  const geminiKey = process.env.GEMINI_API_KEY!;
  const payload = {
    model: "gemini-3.6-flash",
    messages: [
      { role: 'system', content: 'You are a helpful assistant. Output a valid JSON.' },
      { role: 'user', content: 'Output exactly this JSON: {"status": "ok"}' }
    ],
    temperature: 0.0,
    stream: true,
    response_format: { type: 'json_object' }
  };

  const response = await fetch('https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${geminiKey}`
    },
    body: JSON.stringify(payload)
  });

  const reader = response.body!.getReader();
  const decoder = new TextDecoder('utf-8');
  let chunkCount = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunkStr = decoder.decode(value, { stream: true });
    console.log(`[Chunk ${++chunkCount}] Raw string (JSON stringified):`);
    console.log(JSON.stringify(chunkStr));
  }
}
run().catch(console.error);
