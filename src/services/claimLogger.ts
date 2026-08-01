import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { ConversationMessage, Severity } from '../conversation/types.js';
import type { Claim } from '../types/claim.js';
import type { Policy } from '../types/policy.js';

export interface ClaimLogRecord {
  claimNumber: string;
  summary: string;
  timestamp: string;
  claim: Claim;
  verifiedPolicy?: Policy;
  conversationHistory: ConversationMessage[];
  severity?: Severity;
  escalationRequired: boolean;
}

export interface ClaimLoggerService {
  log(record: ClaimLogRecord): void | Promise<void>;
}

const moduleDirectory = dirname(fileURLToPath(import.meta.url));
export const DEFAULT_CLAIMS_FILE_PATH = join(
  moduleDirectory,
  '../../data/claims.json',
);

function isClaimLogRecordArray(value: unknown): value is ClaimLogRecord[] {
  return Array.isArray(value);
}

async function readExistingRecords(filePath: string): Promise<ClaimLogRecord[]> {
  try {
    const contents = await readFile(filePath, 'utf8');
    const parsed: unknown = JSON.parse(contents);

    return isClaimLogRecordArray(parsed) ? parsed : [];
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return [];
    }

    throw error;
  }
}

class Mutex {
  private promise = Promise.resolve();
  async runExclusive<T>(fn: () => Promise<T>): Promise<T> {
      let release: () => void;
      const nextPromise = new Promise<void>(resolve => release = resolve);
      const prevPromise = this.promise;
      this.promise = prevPromise.then(() => nextPromise, () => nextPromise);
      await prevPromise.catch(() => {});
      try {
          return await fn();
      } finally {
          release!();
      }
  }
}

export class LocalJsonClaimLogger implements ClaimLoggerService {
  private mutex = new Mutex();

  constructor(private readonly filePath = DEFAULT_CLAIMS_FILE_PATH) {}

  async log(record: ClaimLogRecord): Promise<void> {
    await this.mutex.runExclusive(async () => {
      await mkdir(dirname(this.filePath), { recursive: true });

      const existingRecords = await readExistingRecords(this.filePath);
      const index = existingRecords.findIndex(r => r.claimNumber === record.claimNumber);
      
      if (index >= 0) {
        existingRecords[index] = record;
      } else {
        existingRecords.push(record);
      }

      await writeFile(
        this.filePath,
        `${JSON.stringify(existingRecords, null, 2)}\n`,
        'utf8',
      );
    });
  }
}

export function createLocalJsonClaimLogger(filePath?: string): ClaimLoggerService {
  return new LocalJsonClaimLogger(filePath);
}

export class NotificationClaimLogger implements ClaimLoggerService {
  constructor(
    private readonly innerLogger: ClaimLoggerService,
    private readonly notificationService: import('./notificationService.js').NotificationService,
  ) {}

  async log(record: ClaimLogRecord): Promise<void> {
    await this.innerLogger.log(record);
    try {
      await this.notificationService.sendClaimConfirmation(record);
    } catch (error) {
      console.error(`[NotificationClaimLogger] Graceful recovery from notification error for claim ${record.claimNumber}:`, error);
    }
  }
}

