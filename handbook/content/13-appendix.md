# 13. Appendix & Computer Science Fundamentals

> [!HOTSPOT]
> * **Probability:** 10% | **Est. Time:** 20m | **Difficulty:** Easy
> * **Likely Questions:**
>   - How does the Node.js Event Loop work?
>   - What is the difference between REST, SSE, and WebSockets?
>   - How does the HTTP to WebSocket upgrade handshake function?

---

## 1. Node.js Event Loop Architecture

```
   ┌───────────────────────────┐
┌─►│          timers           │ (setTimeout, setInterval)
│  └─────────────┬─────────────┘
│  ┌─────────────┴─────────────┐
│  │     pending callbacks     │ (I/O callbacks)
│  └─────────────┬─────────────┘
│  ┌─────────────┴─────────────┐
│  │      idle, prepare        │
│  └─────────────┬─────────────┘
│  ┌─────────────┴─────────────┐
│  │          poll             │ (Incoming WebSockets & I/O)
│  └─────────────┬─────────────┘
│  ┌─────────────┴─────────────┐
│  │          check            │ (setImmediate)
│  └─────────────┬─────────────┘
│  ┌─────────────┴─────────────┐
└──│      close callbacks      │ (socket.on('close'))
   └───────────────────────────┘
```

* **Why Node is Single-Threaded:** Node executes JavaScript on a single thread. Asynchronous I/O operations (network requests to Gemini or Google Sheets) are offloaded to libuv and the underlying OS kernel.
* **Why Microtasks (Promises) Take Priority:** `Promise` callbacks run in the Microtask Queue immediately after the current operation finishes, before moving to the next Event Loop phase.

---

## 2. Network Protocols Comparison Matrix

| Protocol | Connection | Direction | Overhead | Typical Use Case |
| :--- | :--- | :--- | :--- | :--- |
| **REST (HTTP/1.1)** | Short-lived TCP | Request-Response | High (Headers per request) | Standard CRUD APIs |
| **Server-Sent Events (SSE)** | Long-lived HTTP | Monodirectional (Server -> Client) | Low | LLM text streaming (Gemini) |
| **WebSockets (WS)** | Long-lived TCP | Full-Duplex Bidirectional | Minimal (Frame header ~2-14 bytes) | Real-time voice audio & text (Retell) |

---

## 3. The HTTP to WebSocket Upgrade Handshake

1. Client dispatches HTTP GET with headers:
   ```http
   GET /chat HTTP/1.1
   Host: your-railway-app.railway.app
   Upgrade: websocket
   Connection: Upgrade
   Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==
   Sec-WebSocket-Version: 13
   ```
2. Server responds with HTTP `101 Switching Protocols`:
   ```http
   HTTP/1.1 101 Switching Protocols
   Upgrade: websocket
   Connection: Upgrade
   Sec-WebSocket-Accept: s3pPLMBiTxaQ9kYGzzhZRbK+xOo=
   ```
3. The underlying TCP socket remains open indefinitely for full-duplex binary/text framing.

---

> [!RECAP]
> 1. Node offloads I/O to libuv, allowing single-threaded JavaScript to handle thousands of concurrent WebSockets.
> 2. WebSockets provide full-duplex persistent streaming; REST is stateless request-response.
> 3. Server-Sent Events (SSE) stream text monodirectionally from Gemini to our backend.
> 4. WebSockets initiate via an HTTP `101 Switching Protocols` handshake over TCP port 3000.
> 5. Use this chapter for foundational CS trivia if asked by low-level system interviewers.
