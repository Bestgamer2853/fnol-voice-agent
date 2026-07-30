export interface GenerateAssistantResponseInput {
  systemPrompt: string;
  conversationContext: string;
  userPrompt: string;
  responseMimeType?: 'application/json' | 'text/plain';
  tools?: any[];
  toolConfig?: any;
  onContentChunk?: ((chunk: string) => void) | undefined;
}

export interface GenerateAssistantResponseResult {
  assistantResponse: string;
  errorMessage?: string;
  toolCalls?: any[];
}

export interface GeminiClient {
  generateAssistantResponse(
    input: GenerateAssistantResponseInput,
  ): Promise<GenerateAssistantResponseResult>;
}

interface GeminiServiceOptions {
  apiKey?: string;
  model?: string;
  endpointBaseUrl?: string;
}

interface GeminiPart {
  text?: string;
  functionCall?: any;
}

interface GeminiContent {
  parts?: GeminiPart[];
}

interface GeminiCandidate {
  content?: GeminiContent;
}

interface GeminiGenerateContentResponse {
  candidates?: GeminiCandidate[];
  error?: {
    message?: string;
  };
}

const DEFAULT_MODEL = 'gemini-3.5-flash';
const DEFAULT_ENDPOINT_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';

function readEnvironmentValue(name: string): string | undefined {
  const value = process.env[name];
  return value && value.trim().length > 0 ? value : undefined;
}

function fallbackResponse(errorMessage: string): GenerateAssistantResponseResult {
  return {
    assistantResponse:
      'I can continue helping with the claim, but AI response generation is temporarily unavailable.',
    errorMessage,
  };
}

function extractAssistantResponse(
  response: GeminiGenerateContentResponse,
): { text?: string; toolCalls?: any[] } {
  const parts = response.candidates?.[0]?.content?.parts ?? [];
  const text = parts
    .map((part) => part.text)
    .filter((partText): partText is string => Boolean(partText))
    .join('')
    .trim();

  const toolCalls = parts
    .filter((part) => part.functionCall)
    .map((part) => part.functionCall);

  const finalToolCalls = toolCalls.length > 0 ? toolCalls : undefined;

  const result: { text?: string; toolCalls?: any[] } = {};
  if (text) result.text = text;
  if (finalToolCalls) result.toolCalls = finalToolCalls;
  return result;
}

export class GeminiService implements GeminiClient {
  private readonly apiKey: string | undefined;
  private readonly model: string;
  private readonly endpointBaseUrl: string;

  constructor(options: GeminiServiceOptions = {}) {
    this.apiKey = options.apiKey ?? readEnvironmentValue('GEMINI_API_KEY');
    this.model = options.model ?? readEnvironmentValue('GEMINI_MODEL') ?? DEFAULT_MODEL;
    this.endpointBaseUrl =
      options.endpointBaseUrl ??
      readEnvironmentValue('GEMINI_ENDPOINT_BASE_URL') ??
      DEFAULT_ENDPOINT_BASE_URL;
  }

  async generateAssistantResponse(
    input: GenerateAssistantResponseInput,
  ): Promise<GenerateAssistantResponseResult> {
    if (!this.apiKey) {
      return fallbackResponse('GEMINI_API_KEY is not configured.');
    }

    try {
      const response = await fetch(
        `${this.endpointBaseUrl}/models/${this.model}:streamGenerateContent?alt=sse`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': this.apiKey,
          },
          body: JSON.stringify({
            systemInstruction: {
              parts: [{ text: input.systemPrompt }],
            },
            contents: [
              {
                role: 'user',
                parts: [
                  {
                    text: [
                      'Conversation context:',
                      input.conversationContext,
                      '',
                      'Current task:',
                      input.userPrompt,
                    ].join('\n'),
                  },
                ],
              },
            ],
            generationConfig: {
              temperature: 0.4,
              maxOutputTokens: 250,
              responseMimeType: input.responseMimeType,
            },
            tools: input.tools,
            toolConfig: input.toolConfig,
          }),
        },
      );

      if (!response.ok) {
        const errorBody = await response.text();
        return fallbackResponse(`Gemini request failed with status ${response.status}: ${errorBody}`);
      }

      if (!response.body) {
         return fallbackResponse('No response body stream.');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let fullAssistantResponse = '';
      let allToolCalls: any[] = [];

      let buffer = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        
        let boundary = buffer.indexOf('\n\n');
        while (boundary !== -1) {
          const chunk = buffer.slice(0, boundary).trim();
          buffer = buffer.slice(boundary + 2);
          
          if (chunk.startsWith('data: ')) {
            const dataStr = chunk.slice(6);
            if (dataStr !== '[DONE]') {
              try {
                const data = JSON.parse(dataStr) as GeminiGenerateContentResponse;
                const { text, toolCalls } = extractAssistantResponse(data);
                
                if (text) {
                  fullAssistantResponse += text;
                  if (input.onContentChunk) {
                    input.onContentChunk(text);
                  }
                }

                if (toolCalls && toolCalls.length > 0) {
                  allToolCalls = allToolCalls.concat(toolCalls);
                }
              } catch (e) {
                console.error('Failed to parse SSE chunk', e);
              }
            }
          }
          boundary = buffer.indexOf('\n\n');
        }
      }

      if (!fullAssistantResponse && allToolCalls.length === 0) {
        return fallbackResponse('Gemini returned no assistant text and no tool calls.');
      }

      const finalResponse: GenerateAssistantResponseResult = { assistantResponse: fullAssistantResponse };
      if (allToolCalls.length > 0) finalResponse.toolCalls = allToolCalls;
      return finalResponse;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown Gemini error.';
      return fallbackResponse(message);
    }
  }
}

export function createGeminiService(
  options: GeminiServiceOptions = {},
): GeminiClient {
  return new GeminiService(options);
}
