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
  severity: Severity;
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

export class LocalJsonClaimLogger implements ClaimLoggerService {
  constructor(private readonly filePath = DEFAULT_CLAIMS_FILE_PATH) {}

  async log(record: ClaimLogRecord): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });

    const existingRecords = await readExistingRecords(this.filePath);
    const updatedRecords = [...existingRecords, record];

    await writeFile(
      this.filePath,
      `${JSON.stringify(updatedRecords, null, 2)}\n`,
      'utf8',
    );
  }
}

export function createLocalJsonClaimLogger(filePath?: string): ClaimLoggerService {
  return new LocalJsonClaimLogger(filePath);
}
