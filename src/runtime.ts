import { readFileSync } from 'node:fs';

import {
  createConversationManager,
  type ConversationManager,
  type ConversationManagerDependencies,
} from './conversation/ConversationManager.js';

import {
  DEFAULT_CLAIMS_FILE_PATH,
  createLocalJsonClaimLogger,
  NotificationClaimLogger,
  type ClaimLoggerService,
} from './services/claimLogger.js';
import { createNotificationService } from './services/notificationService.js';
import { createExtractClaimDataService } from './services/extractClaimData.js';
import { createGenerateSummaryService } from './services/generateSummary.js';
import { createGeminiService } from './llm/gemini.js';
import { createGroqService } from './llm/groq.js';
import { createFallbackProvider } from './llm/fallback.js';
import type { LlmProvider, GenerateResponseInput, GenerateResponseResult } from './llm/provider.js';
import { createRecommendServicesService } from './services/recommendServices.js';
import { createVerifyPolicyService } from './services/verifyPolicy.js';
import { createClaimNumberGenerator } from './utils/claimNumber.js';

function currentClaimDatePart(): string {
  return new Date().toISOString().slice(0, 10).replace(/-/g, '');
}

function readInitialClaimSequence(filePath: string): number {
  try {
    const parsed: unknown = JSON.parse(readFileSync(filePath, 'utf8'));

    if (!Array.isArray(parsed)) {
      return 0;
    }

    const sequenceValues = parsed
      .map((item: unknown) => {
        if (typeof item !== 'object' || item === null) {
          return 0;
        }

        const claimNumber = (item as { claimNumber?: unknown }).claimNumber;

        if (typeof claimNumber !== 'string') {
          return 0;
        }

        const match = /^CLM-(\d{8})-(\d{4})$/.exec(claimNumber);

        if (!match || match[1] !== currentClaimDatePart()) {
          return 0;
        }

        return Number(match[2]);
      })
      .filter((value) => Number.isFinite(value));

    return Math.max(0, ...sequenceValues);
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return 0;
    }

    throw error;
  }
}

import { GoogleSheetsClaimLogger } from './storage/googleSheets.js';

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

export function createRuntimeDependencies(): ConversationManagerDependencies {
  const geminiProvider = createGeminiService();
  const providers: LlmProvider[] = [geminiProvider];
  
  if (process.env.GROQ_API_KEY && process.env.GROQ_API_KEY.trim().length > 0) {
    providers.push(createGroqService());
  }

  const llmProvider = createFallbackProvider(providers);

  const localLogger = createLocalJsonClaimLogger(DEFAULT_CLAIMS_FILE_PATH);
  const outboxLogger = createLocalJsonClaimLogger(DEFAULT_CLAIMS_FILE_PATH.replace('claims.json', 'outbox.json'));
  const sheetsLogger = new GoogleSheetsClaimLogger('1bRu1nK9IL8a7DCSXSQ-jXHczpfcPNJ3PJoWw-zjzcJw');
  const multiLogger = new MultiClaimLogger([localLogger, sheetsLogger], outboxLogger);

  const notificationService = createNotificationService();
  const claimLogger = new NotificationClaimLogger(multiLogger, notificationService);

  return {
    verifyPolicy: createVerifyPolicyService(),
    extractClaimData: createExtractClaimDataService({ llmProvider }),
    recommendServices: createRecommendServicesService(),
    generateSummary: createGenerateSummaryService({ llmProvider }),
    claimLogger,

    llmProvider,
    claimNumberGenerator: createClaimNumberGenerator({
      initialSequence: readInitialClaimSequence(DEFAULT_CLAIMS_FILE_PATH),
    }),
  };
}

export function createRuntimeConversationManager(): ConversationManager {
  return createConversationManager(createRuntimeDependencies());
}
