# Remaining Risks

## Known Pitfalls & Backlog Review
1. **Retell WebSocket Reliability**: 
   - We still lack a heartbeat/ping mechanism directly for the Retell WebSocket. If Retell drops silently, `ws.on('close')` fires, but we don't attempt to immediately reconnect from the Node.js server.
2. **Google Sheets Persistence**:
   - `googleSheets.ts` performs network IO in the background. If GCP goes down or rate limits, the `Promise.resolve(...).catch()` logs the error but does not have a queue/retry mechanism (e.g. SQS/RabbitMQ). This means claim data could still be lost if the node app shuts down before the promise resolves.
3. **Data Quality with LLM**:
   - The LLM relies on `responseMimeType: 'application/json'` rather than a strictly validated function calling schema using `responseSchema`. If Gemini starts ignoring the prompt-based schema string, the `extractClaimData.ts` parse logic might fail.
4. **Security & PII**:
   - This prototype handles raw PII (Names, policies) without data masking in local logs. Production use requires stripping PII from `server.ts` `console.log` statements.
