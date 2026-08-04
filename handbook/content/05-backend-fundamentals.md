# 05. Backend Fundamentals (Node.js & WebSockets)

## 1. Business Motivation
**Why does this exist?**  
Voice AI cannot exist on a standard REST API. A standard HTTP request says "Here is data, wait, okay here is the response, close connection." Voice requires constant, bidirectional, sub-second streaming (audio chunking, barge-in interruptions, instant TTS). You must use WebSockets. And Node.js is uniquely optimized for this kind of I/O-heavy concurrent streaming.

## 2. Software Engineering Concept
**WebSockets (WS) vs. REST.**
- **REST:** Stateless. Client opens connection, requests, gets response, closes connection. High overhead per request.
- **WebSocket:** Stateful. Client opens a persistent TCP connection. Both client and server can push data to each other instantly without HTTP header overhead.

**The Node.js Event Loop:**
Node.js is single-threaded but uses asynchronous I/O. It handles 10,000 WebSocket connections on a single thread by delegating the network waiting to the OS.

## 3. Repository Implementation
- **File:** `src/server.ts`
- **Library:** `ws` (The fastest, most popular WebSocket library for Node).
- **Library:** `express` (Handles the standard HTTP routes for health checks and static files).

## 4. Line-by-Line Walkthrough: The Server Entrypoint

Let's look at `src/server.ts`, where Express and WebSockets merge on the same port.

```typescript
// 1. Create a standard Express HTTP server
const app = express();
const httpServer = http.createServer(app);

// 2. Attach a WebSocket server to the SAME port
const wss = new WebSocketServer({ server: httpServer, path: '/chat' });

// 3. Listen for incoming Retell AI connections
wss.on('connection', (ws: WebSocket, req: http.IncomingMessage) => {
    // A new call has started!
    const callId = "call_" + Math.random().toString(36).substr(2, 9);
    
    // Pass the socket to our Brain
    conversationManager.handleConnection(ws, callId);
});

// 4. Start listening on port 3000
httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
```

**Why was it written this way?**  
By attaching the `WebSocketServer` directly to the `httpServer`, we only need to expose one port (3000) on Railway. The `/chat` path is hijacked by the `ws` library for the WS upgrade handshake, while everything else remains standard Express REST routing.

## 5. Production Reasoning
**Why would a company build it this way?**  
It vastly simplifies deployment. You don't need a separate microservice just for WebSockets. A single Railway container can handle the health checks (`/`), the static UI (`/public`), and the high-performance voice stream (`/chat`).

## 6. Alternatives
**Alternative: Socket.io**
- *Why we didn't use it:* Socket.io adds a heavy custom protocol on top of WebSockets (for fallbacks and rooms). Retell AI strictly requires a raw standard WebSocket connection. Socket.io would fail the handshake.

## 7. Tradeoffs
- **Pros:** Raw `ws` is extremely lightweight, fast, and standard-compliant.
- **Cons:** Raw `ws` does not have built-in reconnection logic, broadcasting, or room management. We have to handle dropped connections manually.

## 8. Interview Explanation
*"For the transport layer, I chose to attach a raw `ws` WebSocket server directly onto my Express HTTP server. Since Retell AI requires a standard WebSocket protocol to stream Custom LLM events, heavier abstractions like Socket.io wouldn't work. This design allows me to serve my static frontend, handle REST health checks, and manage high-throughput persistent voice streams all within a single unified Node.js event loop."*

## 9. Likely Interviewer Questions
1. **"Node.js is single-threaded. What happens if your `ConversationManager` does some heavy CPU-bound math during a WebSocket turn?"**
2. **"How does the WebSocket server authenticate incoming connections from Retell?"**

## 10. Model Answers
1. *"Because Node is single-threaded, CPU-bound work blocks the Event Loop, meaning all other active phone calls would experience lag. Fortunately, our workload is almost entirely I/O bound (waiting on Gemini, waiting on Google Sheets). The only CPU work is basic JSON parsing. If we added heavy CPU work, we would need to use Node `Worker Threads`."*
2. *"Currently, the `/chat` endpoint is unauthenticated, which is a known technical debt item. In a production environment, I would enforce HMAC signature verification on the WebSocket upgrade request to guarantee the connection is actually coming from Retell's servers."*

## 11. Common Mistakes Candidates Make
- **Saying Node.js is multi-threaded.** It is not. It uses a single-threaded event loop. Do not fail this basic trivia.
- **Confusing WebSockets with WebRTC.** Retell handles the WebRTC audio streaming to the browser. Your server only handles WebSockets (JSON text) talking to Retell. You are NOT streaming raw audio bytes.
