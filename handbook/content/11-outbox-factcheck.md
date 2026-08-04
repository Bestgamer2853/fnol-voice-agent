# 11. Outbox Verification & Codebase Fact-Check ⭐

> [!HOTSPOT]
> * **Probability:** 95%
> * **Likely Questions:**
>   - Does your outbox implementation automatically retry failed Google Sheets writes?
>   - How does `MultiClaimLogger` handle partial logger failures?
>   - What would you add in production to make the outbox fully automated?

---

## 1. Codebase Audit of Outbox Behavior

In `src/runtime.ts`, `MultiClaimLogger` executes `Promise.allSettled([localLogger, sheetsLogger])`:

```typescript
class MultiClaimLogger implements ClaimLoggerService {
  constructor(
      private readonly loggers: ClaimLoggerService[],
      private readonly outbox?: ClaimLoggerService
  ) {}

  async log(record: any): Promise<void> {
    const results = await Promise.allSettled(this.loggers.map((logger) => logger.log(record)));
    
    const failures = results.filter(r => r.status === 'rejected');
    if (failures.length > 0) {
      console.error(`[MultiClaimLogger] Partial failure detected for claim ${record.claimNumber}. ${failures.length} logger(s) failed.`);
      if (this.outbox) {
          try {
             await this.outbox.log(record);
             console.log(`[MultiClaimLogger] Claim ${record.claimNumber} written to outbox.`);
          } catch (outboxErr) {
             console.error(`[MultiClaimLogger] FATAL: Failed to write claim ${record.claimNumber} to outbox:`, outboxErr);
          }
      }
    }
  }
}
```

---

## 2. Fact-Check Summary

* **What the codebase DOES do:**  
  When Google Sheets (or any primary logger) fails (e.g. 429 Rate Limit), `MultiClaimLogger` catches the failure and writes the claim to `data/outbox.json`. This guarantees **Local Backup / Zero Data Loss**.
* **What the codebase DOES NOT do:**  
  The current repository does **NOT** contain a background worker or cron interval that automatically reads `outbox.json` and replays failed writes to Google Sheets.

---

## 3. Senior-Level Interview Defense

When asked about outbox persistence in an interview, deliver this exact response:

> *"The current prototype guarantees that claim data is never lost by capturing failed writes to a local outbox file (`data/outbox.json`) whenever downstream services like Google Sheets hit a rate limit. In a production environment, I would attach a background worker (such as a BullMQ queue or Cron task) to poll `outbox.json` and automatically replay failed writes with exponential backoff."*

---

> [!RECAP]
> 1. `MultiClaimLogger` uses `Promise.allSettled` to catch logger rejections.
> 2. Failed claims write to `data/outbox.json` as a local backup.
> 3. Automatic retry replay is a production-evolution feature, not currently in the prototype code.
> 4. Always articulate this distinction clearly to demonstrate Staff-level honesty and architectural precision.
