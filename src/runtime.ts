import { readFileSync } from 'node:fs';

import {
  createConversationManager,
  type ConversationManager,
  type ConversationManagerDependencies,
} from './conversation/ConversationManager.js';

import {
  DEFAULT_CLAIMS_FILE_PATH,
  createLocalJsonClaimLogger,
  type ClaimLoggerService,
} from './services/claimLogger.js';
import { createDetectContradictionsService } from './services/detectContradictions.js';
import { createDetectSeverityService } from './services/detectSeverity.js';
import { createExtractClaimDataService } from './services/extractClaimData.js';
import { createGenerateSummaryService } from './services/generateSummary.js';
import { createGeminiService } from './services/geminiClient.js';
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
  constructor(private readonly loggers: ClaimLoggerService[]) {}

  async log(record: any): Promise<void> {
    await Promise.all(this.loggers.map((logger) => logger.log(record)));
  }
}

export function createRuntimeDependencies(): ConversationManagerDependencies {
  const geminiClient = createGeminiService();
  const localLogger = createLocalJsonClaimLogger(DEFAULT_CLAIMS_FILE_PATH);
  const sheetsLogger = new GoogleSheetsClaimLogger('1bRu1nK9IL8a7DCSXSQ-jXHczpfcPNJ3PJoWw-zjzcJw');
  const claimLogger = new MultiClaimLogger([localLogger, sheetsLogger]);

  return {
    verifyPolicy: createVerifyPolicyService(),
    detectSeverity: createDetectSeverityService(),
    detectContradictions: createDetectContradictionsService(),
    extractClaimData: createExtractClaimDataService({ geminiClient }),
    recommendServices: createRecommendServicesService(),
    generateSummary: createGenerateSummaryService({ geminiClient }),
    claimLogger,

    geminiClient,
    claimNumberGenerator: createClaimNumberGenerator({
      initialSequence: readInitialClaimSequence(DEFAULT_CLAIMS_FILE_PATH),
    }),
  };
}

export function createRuntimeConversationManager(): ConversationManager {
  return createConversationManager(createRuntimeDependencies());
}
