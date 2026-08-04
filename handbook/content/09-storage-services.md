# 09. Storage & Services (Persistence)

## 1. Business Motivation
**Why does this exist?**  
An insurance claim is meaningless if it isn't saved. If the system crashes at the exact moment the caller hangs up, but the data isn't persisted, the business just lost a customer and potentially created a liability nightmare. We must guarantee that data is saved, and we must notify stakeholders (via Email) immediately.

## 2. Software Engineering Concept
**The Outbox Pattern and Resiliency.**
- **The Problem:** Third-party APIs (Google Sheets, Resend) are slow and they fail randomly. If we block the user's voice waiting for Google Sheets, the AI feels dead. If Google Sheets is down, the data is lost.
- **The Solution (Outbox Pattern):** Write the data to a local, ultra-fast, ultra-reliable datastore FIRST (the outbox). Then, try to write it to the slow external API. If the external API fails, a background worker can read the local outbox and retry later.

## 3. Repository Implementation
- **File:** `src/services/claimLogger.ts` (Implements `MultiClaimLogger`)
- **File:** `src/storage/googleSheets.ts` (Google API client)
- **File:** `src/services/notificationService.ts` (Resend Email API)

## 4. Line-by-Line Walkthrough: The MultiClaimLogger

```typescript
// Inside src/services/claimLogger.ts

export class MultiClaimLogger implements ClaimLogger {
  constructor(private loggers: ClaimLogger[]) {}

  async logClaim(callId: string, data: Claim): Promise<void> {
    // We fire all loggers simultaneously (Local File AND Google Sheets)
    const results = await Promise.allSettled(
      this.loggers.map((logger) => logger.logClaim(callId, data))
    );

    // We check if any of them failed, but we DO NOT throw an error that would crash the app
    results.forEach((result, index) => {
      if (result.status === 'rejected') {
        console.error(`Logger at index ${index} failed:`, result.reason);
      }
    });
  }
}
```

**Why was it written this way?**  
`Promise.allSettled` is a Senior Engineer's best friend. Unlike `Promise.all` (which explodes if a single promise fails), `allSettled` allows the `LocalFileLogger` to succeed even if the `GoogleSheetsLogger` throws a 500 error. This is a rudimentary implementation of the Outbox pattern. 

## 5. Production Reasoning
**Why would a company build it this way?**  
Because Google APIs fail. Rate limits happen. By using `MultiClaimLogger`, the local JSON file on the Railway container acts as a primitive local database. 

## 6. Alternatives
**Alternative: Direct synchronous writing to PostgreSQL**
- *Why we didn't do it:* Setting up Postgres and an ORM is overkill for a prototype. Google Sheets acts as a highly visible "CRM" for stakeholders to see claims pop in real-time during a demo.

## 7. Tradeoffs
- **Pros:** Fast, simple, highly visible to business stakeholders.
- **Cons:** A local JSON file on an ephemeral Railway container is dangerous. If the container crashes and restarts before we backup the JSON, the data is gone forever. 

## 8. Interview Explanation
*"For persistence, I implemented a `MultiClaimLogger` using `Promise.allSettled`. This allows me to write the claim data to a local file system and Google Sheets concurrently. It acts as a lightweight Outbox pattern. Since it's fired asynchronously, it never blocks the WebSocket audio stream. If Google Sheets hits a rate limit, the `allSettled` mechanism ensures the local write still succeeds, preventing data loss without crashing the conversational loop."*

## 9. Likely Interviewer Questions
1. **"You mentioned writing to a local JSON file. What happens when your Railway container scales to 0 or redeploys?"**
2. **"If the Google Sheets API fails, how does the data in the local JSON file eventually get to Google Sheets?"**

## 10. Model Answers
1. *"The data is completely lost. Writing to local disk on an ephemeral container is a known prototype shortcut. For a production release, that 'local write' must be replaced by publishing an event to a durable message broker like Kafka, AWS SQS, or a highly available Redis stream."*
2. *"Right now, it doesn't. We just log the error. In a true Outbox pattern, I would need a CRON job or a background worker that periodically reads the local outbox, finds rows that haven't been synced, and retries the Google Sheets API with exponential backoff."*

## 11. Common Mistakes Candidates Make
- **Not knowing `Promise.allSettled`.** If you use `Promise.all` for dual-writes in an interview, they will fail you. You must understand how to handle partial failures gracefully.
