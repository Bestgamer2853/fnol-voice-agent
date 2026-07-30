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
}

export interface GenerateResponseResult {
  assistantResponse: string;
  errorMessage?: string;
  toolCalls?: { id: string, name: string, args: any }[];
  finishReason?: string;
}

export interface LlmProvider {
  generateResponse(input: GenerateResponseInput): Promise<GenerateResponseResult>;
}
