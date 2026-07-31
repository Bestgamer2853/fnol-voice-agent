export interface GenerateResponseInput {
  systemPrompt: string;
  conversationContext: string;
  userPrompt: string;
  responseMimeType?: 'application/json' | 'text/plain';
  tools?: any[];
  toolConfig?: any;
  onContentChunk?: ((chunk: string) => void) | undefined;
  toolContext?: {
      assistantMessage: string;
      toolCalls: { id: string, name: string, args: any }[];
      toolResults: { id: string, name: string, result: string }[];
  }[];
  abortSignal?: AbortSignal;
}

export interface GenerateResponseResult {
  assistantResponse?: string;
  toolCalls?: Array<{
    id: string;
    name: string;
    args: unknown;
  }>;
  finishReason?: string;
  errorMessage?: string;
  usageMetadata?: UsageMetadata;
  retries?: number;
}

export interface UsageMetadata {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
  totalTokenCount?: number;
}

export interface LlmProvider {
  generateResponse(input: GenerateResponseInput): Promise<GenerateResponseResult>;
}
