# 08. Voice & Telephony (Retell AI)

## 1. Business Motivation
**Why does this exist?**  
Voice AI is distinct from text AI. A user talking on the phone has completely different expectations than a user typing into ChatGPT. They expect immediate acknowledgment, they will interrupt the AI mid-sentence (barge-in), and they will speak with background noise (sirens, crying). Handling raw telephony protocols (WebRTC) and Speech-to-Text (STT) is incredibly difficult, so we offload it to a specialized vendor: Retell AI.

## 2. Software Engineering Concept
**The Audio Pipeline, Barge-in, and VAD.**
- **STT (Speech-to-Text):** Converting raw audio bytes into strings.
- **TTS (Text-to-Speech):** Converting strings into realistic human audio.
- **VAD (Voice Activity Detection):** The algorithm that figures out when the user has stopped speaking.
- **Barge-in:** When the user interrupts the AI, the AI must instantly stop talking and listen.

## 3. Repository Implementation
- **File:** `src/server.ts` (Handles the Custom LLM WebSocket connection).
- **File:** `src/transport/browserSocket.ts` (Legacy/Debugging UI).
- **Vendor:** Retell AI.

Our system implements the **Retell Custom LLM** architecture. Retell handles the SIP trunking, WebRTC, STT, TTS, and VAD. Retell opens a WebSocket to *our* Node.js server. 

## 4. Line-by-Line Walkthrough: The Retell Protocol

When Retell talks to our WebSocket, it sends exactly formatted JSON events. We must respond with exactly formatted JSON events.

```typescript
// Inside server.ts -> ws.on('message')

const data = JSON.parse(message);

if (data.event === 'update') {
    // Retell is sending us the transcript of what the user just said.
    // data.transcript is an array of messages: { role: 'user', content: 'hello' }
    
    // We send this to our Brain
    const llmResponse = await conversationManager.handleTurn(callId, data.transcript);
    
    // We send the response back to Retell
    ws.send(JSON.stringify({
        event: 'response',
        response_id: data.response_id, // MUST match the ID Retell gave us!
        content: llmResponse // e.g. "Are you safe?"
    }));
}
```

**Why was it written this way?**  
This is a strict vendor protocol. Retell uses `response_id` to track latency and manage barge-ins. If the user interrupts the AI while it is speaking `response_id: 123`, Retell will cancel `123` and send us a new `update` event with a new `response_id`. 

## 5. Production Reasoning
**Why would a company build it this way?**  
Building WebRTC, STT, TTS, and VAD in-house takes years and millions of dollars. It requires massive GPU clusters for low-latency inference. By using Retell, we pay a few cents per minute and get state-of-the-art voice pipelines, allowing our engineers to focus 100% on the insurance business logic.

## 6. Alternatives
**Alternative: Twilio Media Streams + Deepgram STT + ElevenLabs TTS + OpenAI.**
- *Why we didn't use it:* This is the "build it yourself" route. It requires piping raw UDP audio packets, managing a jitter buffer, syncing the LLM stream with the TTS stream, and writing your own VAD logic for barge-in. It is highly error-prone and requires a massive engineering team.

## 7. Tradeoffs
- **Pros:** Fast time-to-market. Flawless barge-in handling out of the box.
- **Cons:** Vendor lock-in. If Retell goes down, our service goes down. High per-minute cost compared to bare-metal. 

## 8. Interview Explanation
*"For the telephony layer, I made a strategic decision to avoid building a raw WebRTC/SIP pipeline. Handling jitter buffers, VAD, and STT/TTS synchronization is an infrastructure problem, not a business problem. I partnered with Retell AI to handle the raw audio layer. Retell connects to my Node server via a Custom LLM WebSocket protocol. When VAD detects the end of an utterance, Retell sends me the JSON transcript, I run my FSM and LLM logic, and I send the text response back for Retell to synthesize. This guarantees enterprise-grade audio latency while keeping my architecture strictly focused on FNOL rules."*

## 9. Likely Interviewer Questions
1. **"How does your system handle barge-in (interruptions)?"**
2. **"What is the theoretical minimum latency from the user stopping speaking to hearing the AI respond?"**

## 10. Model Answers
1. *"Barge-in is managed by Retell's VAD. When the user interrupts, Retell immediately stops the TTS audio stream on the client side, truncates the transcript, and sends a new `update` event over the WebSocket to my Node server. My server simply treats it as a new conversational turn, discarding any in-flight processing for the interrupted turn."*
2. *"Theoretical minimum latency is the sum of STT (100ms) + Network (50ms) + TTFT of Gemini (400ms) + TTS generation (150ms). We are looking at roughly 700-800 milliseconds glass-to-glass latency, which feels like a natural human pause."*

## 11. Common Mistakes Candidates Make
- **Saying "My server processes the audio."** Your server NEVER sees audio bytes. It only sees JSON text. If you say you process audio, the interviewer knows you don't understand the architecture.
