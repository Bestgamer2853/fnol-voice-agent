export interface GenerateAssistantResponseInput {
  systemPrompt: string;
  conversationContext: string;
  userPrompt: string;
  responseMimeType?: 'application/json' | 'text/plain';
  tools?: any[];
  toolConfig?: any;
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
        `${this.endpointBaseUrl}/models/${this.model}:generateContent`,
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

      const body = (await response.json()) as GeminiGenerateContentResponse;

      if (!response.ok) {
        return fallbackResponse(
          body.error?.message ?? `Gemini request failed with status ${response.status}.`,
        );
      }

      const { text: assistantResponse, toolCalls } = extractAssistantResponse(body);

      if (!assistantResponse && !toolCalls) {
        return fallbackResponse('Gemini returned no assistant text and no tool calls.');
      }

      const finalResponse: GenerateAssistantResponseResult = { assistantResponse: assistantResponse ?? '' };
      if (toolCalls) finalResponse.toolCalls = toolCalls;
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
