export interface ClaimNumberGenerator {
  generate(): string;
}

export interface SequentialClaimNumberGeneratorOptions {
  now?: () => Date;
  initialSequence?: number;
}

function formatDate(value: Date): string {
  return value.toISOString().slice(0, 10).replace(/-/g, '');
}

function formatSequence(value: number): string {
  return value.toString().padStart(4, '0');
}

export class SequentialClaimNumberGenerator implements ClaimNumberGenerator {
  private currentDate: string | undefined;
  private sequence: number;
  private readonly now: () => Date;

  constructor(options: SequentialClaimNumberGeneratorOptions = {}) {
    this.now = options.now ?? (() => new Date());
    this.sequence = options.initialSequence ?? 0;
    this.currentDate =
      this.sequence > 0 ? formatDate(this.now()) : undefined;
  }

  generate(): string {
    const datePart = formatDate(this.now());

    if (this.currentDate !== datePart) {
      this.currentDate = datePart;
      this.sequence = 0;
    }

    this.sequence += 1;

    return `CLM-${datePart}-${formatSequence(this.sequence)}`;
  }
}

export function createClaimNumberGenerator(
  options: SequentialClaimNumberGeneratorOptions = {},
): ClaimNumberGenerator {
  return new SequentialClaimNumberGenerator(options);
}
