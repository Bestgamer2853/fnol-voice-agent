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
      "I'm having a temporary connection issue with my AI service. Please give me a moment.",
    errorMessage,
  };
}

const MAX_RETRIES = 4;
const RETRYABLE_STATUS_CODES = new Set([429, 503]);

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

    const requestBodyStr = JSON.stringify({
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
    });

    const url = `${this.endpointBaseUrl}/models/${this.model}:streamGenerateContent?alt=sse`;

    let attempt = 0;
    while (attempt <= MAX_RETRIES) {
      attempt++;
      const startTime = Date.now();
      
      console.log(`[Gemini Request] Attempt ${attempt}. URL: ${url}, Prompt Length: ${requestBodyStr.length}, Tools: ${input.tools?.length || 0}`);

      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': this.apiKey,
          },
          body: requestBodyStr,
        });

        const latency = Date.now() - startTime;

        if (!response.ok) {
          const errorBody = await response.text();
          console.error(`[Gemini Response Error] Attempt ${attempt}, Status: ${response.status}, Latency: ${latency}ms, Quota/Error: ${errorBody}`);

          if (attempt <= MAX_RETRIES && RETRYABLE_STATUS_CODES.has(response.status)) {
            const backoff = Math.pow(2, attempt - 1) * 1000;
            console.log(`[Gemini Retry] Retrying in ${Math.round(backoff)}ms...`);
            await sleep(backoff);
            continue;
          }
          
          return fallbackResponse(`Gemini request failed with status ${response.status}: ${errorBody}`);
        }

        if (!response.body) {
           return fallbackResponse('No response body stream.');
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder('utf-8');
        let fullAssistantResponse = '';
        let allToolCalls: any[] = [];
        let totalTokens = 0;

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
                  const data = JSON.parse(dataStr) as any;
                  if (data.usageMetadata) {
                     totalTokens = data.usageMetadata.totalTokenCount || 0;
                  }
                  
                  const { text, toolCalls } = extractAssistantResponse(data as GeminiGenerateContentResponse);
                  
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

        console.log(`[Gemini Response Success] Latency: ${latency}ms, Tokens: ${totalTokens || 'unknown'}, ToolCalls: ${allToolCalls.length}`);

        if (!fullAssistantResponse && allToolCalls.length === 0) {
          return fallbackResponse('Gemini returned no assistant text and no tool calls.');
        }

        const finalResponse: GenerateAssistantResponseResult = { assistantResponse: fullAssistantResponse };
        if (allToolCalls.length > 0) finalResponse.toolCalls = allToolCalls;
        return finalResponse;
      } catch (error) {
        const latency = Date.now() - startTime;
        const message = error instanceof Error ? error.message : 'Unknown Gemini error.';
        console.error(`[Gemini Network Error] Attempt ${attempt}, Latency: ${latency}ms, Message: ${message}`);
        
        if (attempt <= MAX_RETRIES) {
          const backoff = Math.pow(2, attempt - 1) * 1000;
          console.log(`[Gemini Retry] Retrying in ${Math.round(backoff)}ms...`);
          await sleep(backoff);
          continue;
        }

        return fallbackResponse(message);
      }
    }
    
    return fallbackResponse("Max retries exceeded.");
  }
}

export function createGeminiService(
  options: GeminiServiceOptions = {},
): GeminiClient {
  return new GeminiService(options);
}
