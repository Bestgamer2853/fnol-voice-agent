# 09. Live Modifications Guide

> [!HOTSPOT]
> * **Probability:** 80% | **Est. Time:** 25m | **Difficulty:** Hard
> * **Likely Questions:**
>   - "How would you add SMS confirmation via Twilio?"
>   - "How would you support multi-language (Spanish) conversations?"
>   - "How would you add a new FNOL field like `weatherConditions`?"

---

## 1. Live Modification Decision Matrix

| Feature Request | Files Modified | Architectural Touchpoints | Effort |
| :--- | :--- | :--- | :--- |
| **Add Twilio SMS** | `notificationService.ts`, `claimLogger.ts`, `runtime.ts` | MultiClaimLogger Outbox array | Low (1 hr) |
| **Multi-Language (Spanish)** | `ConversationState.ts`, `extractClaimData.ts`, `ConversationManager.ts` | Dynamic prompt instructions & FSM state | Medium (2 hrs) |
| **Redis Session Cache** | `ConversationManager.ts`, `runtime.ts` | Replace in-memory Map with `ioredis` | Medium (2 hrs) |
| **Add New Claim Field** | `Claim.ts`, `requiredFields.ts`, `extractClaimData.ts`, `googleSheets.ts` | TS interface, FSM schema, Sheet row mapping | Low (30 mins) |

---

## 2. Scenario 1: "Add SMS Claim Confirmation via Twilio"

### Exact File Changes:

#### 1. `src/services/notificationService.ts`
Add a new Twilio SMS Service implementing `SmsService` interface:
```typescript
import twilio from 'twilio';

export interface SmsService {
  sendSms(to: string, message: string): Promise<void>;
}

export class TwilioSmsService implements SmsService {
  private client = twilio(process.env.TWILIO_SID, process.env.TWILIO_AUTH_TOKEN);

  async sendSms(to: string, message: string): Promise<void> {
    await this.client.messages.create({
      body: message,
      from: process.env.TWILIO_PHONE_NUMBER,
      to,
    });
  }
}
```

#### 2. `src/services/claimLogger.ts`
Wrap `TwilioSmsService` inside `MultiClaimLogger`:
```typescript
export class SmsClaimLogger implements ClaimLoggerService {
  constructor(private smsService: SmsService) {}

  async log(record: ClaimLogRecord): Promise<void> {
    if (record.claim.phoneNumber) {
      await this.smsService.sendSms(
        record.claim.phoneNumber,
        `Meridian Insurance: Your claim ${record.claimNumber} has been received.`
      );
    }
  }
}
```

#### 3. `src/runtime.ts`
Inject `SmsClaimLogger` into `MultiClaimLogger` array.

---

## 3. Scenario 2: "Support Multi-Language Conversations (English / Spanish)"

### Exact File Changes:

#### 1. `src/types/ConversationState.ts`
Add `language` to `ConversationState`:
```typescript
export interface ConversationState {
  language: 'en' | 'es';
  // ... existing state
}
```

#### 2. `src/services/extractClaimData.ts`
Inject language instructions into dynamic system prompt:
```typescript
const languageInstruction = input.state.language === 'es' 
  ? "IMPORTANT: Respond to the user in fluent SPANISH." 
  : "Respond to the user in ENGLISH.";

const systemPrompt = `${basePrompt}\n${languageInstruction}`;
```

#### 3. `src/conversation/ConversationManager.ts`
Update initial Greeting step to detect language preference from first user turn.

---

## 4. Scenario 3: "Add a New FNOL Field: `weatherConditions`"

### Exact File Changes:

#### 1. `src/types/Claim.ts`
Add `weatherConditions?: string | null` to `Claim` interface.

#### 2. `src/config/requiredFields.ts`
Add `'weatherConditions'` to `REQUIRED_FNOL_FIELDS` array.

#### 3. `src/services/extractClaimData.ts`
Update Gemini `responseJsonSchema` object:
```typescript
weatherConditions: { type: "STRING", nullable: true, description: "Weather during incident (e.g. Rain, Snow, Clear)" }
```

#### 4. `src/storage/googleSheets.ts`
Add `'Weather'` header to `HEADER_ROW` array and map `record.claim.weatherConditions` into row payload.

---

> [!RECAP]
> 1. To add Twilio SMS: implement `SmsService`, create `SmsClaimLogger`, and inject into `MultiClaimLogger` in `runtime.ts`.
> 2. To support Spanish: add `language` to `ConversationState` and inject dynamic language instructions into `extractClaimData.ts`.
> 3. To externalize state to Redis: replace `sessions` Map in `ConversationManager.ts` with `ioredis` get/set operations.
> 4. To add a new claim field: update `Claim.ts`, `requiredFields.ts`, Gemini JSON Schema, and `googleSheets.ts`.
> 5. Decoupled architecture ensured by Dependency Injection allows most features to be added in under 3 file edits.
