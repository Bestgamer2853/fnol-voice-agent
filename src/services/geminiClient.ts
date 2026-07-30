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

const DEFAULT_MODEL = 'llama-3.3-70b-versatile';
const DEFAULT_ENDPOINT_BASE_URL = 'https://api.groq.com/openai/v1';

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

function translateSchema(schema: any): any {
  if (!schema) return schema;
  if (Array.isArray(schema)) return schema.map(translateSchema);
  if (typeof schema === 'object') {
    const newObj: any = {};
    for (const [k, v] of Object.entries(schema)) {
      if (k === 'type' && typeof v === 'string') {
        newObj[k] = v.toLowerCase();
      } else {
        newObj[k] = translateSchema(v);
      }
    }
    return newObj;
  }
  return schema;
}

function translateTools(geminiTools?: any[]): any[] | undefined {
  if (!geminiTools || geminiTools.length === 0) return undefined;
  
  const openaiTools: any[] = [];
  for (const group of geminiTools) {
    if (group.functionDeclarations) {
      for (const func of group.functionDeclarations) {
        openaiTools.push({
          type: "function",
          function: {
            name: func.name,
            description: func.description,
            parameters: translateSchema(func.parameters)
          }
        });
      }
    }
  }
  return openaiTools.length > 0 ? openaiTools : undefined;
}

export class GeminiService implements GeminiClient {
  private readonly apiKey: string | undefined;
  private readonly model: string;
  private readonly endpointBaseUrl: string;

  constructor(options: GeminiServiceOptions = {}) {
    this.apiKey = options.apiKey ?? readEnvironmentValue('GROQ_API_KEY') ?? readEnvironmentValue('GEMINI_API_KEY');
    this.model = options.model ?? readEnvironmentValue('GROQ_MODEL') ?? DEFAULT_MODEL;
    this.endpointBaseUrl =
      options.endpointBaseUrl ??
      readEnvironmentValue('GROQ_ENDPOINT_BASE_URL') ??
      DEFAULT_ENDPOINT_BASE_URL;
  }

  async generateAssistantResponse(
    input: GenerateAssistantResponseInput,
  ): Promise<GenerateAssistantResponseResult> {
    if (!this.apiKey) {
      return fallbackResponse('API Key is not configured.');
    }

    const openaiTools = translateTools(input.tools);
    
    // Convert to OpenAI format
    const requestBodyStr = JSON.stringify({
      model: this.model,
      messages: [
        { role: 'system', content: input.systemPrompt },
        { role: 'user', content: `Conversation context:\n${input.conversationContext}\n\nCurrent task:\n${input.userPrompt}` }
      ],
      temperature: 0.4,
      max_tokens: 250,
      stream: true,
      tools: openaiTools,
      response_format: input.responseMimeType === 'application/json' ? { type: 'json_object' } : undefined
    });

    const url = `${this.endpointBaseUrl}/chat/completions`;

    let attempt = 0;
    while (attempt <= MAX_RETRIES) {
      attempt++;
      const startTime = Date.now();
      
      console.log(`[LLM Request] Attempt ${attempt}. URL: ${url}, Model: ${this.model}, Tools: ${openaiTools?.length || 0}`);

      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.apiKey}`,
          },
          body: requestBodyStr,
        });

        const latency = Date.now() - startTime;

        if (!response.ok) {
          const errorBody = await response.text();
          console.error(`[LLM Response Error] Attempt ${attempt}, Status: ${response.status}, Latency: ${latency}ms, Error: ${errorBody}`);

          if (attempt <= MAX_RETRIES && RETRYABLE_STATUS_CODES.has(response.status)) {
            const backoff = Math.pow(2, attempt - 1) * 1000;
            console.log(`[LLM Retry] Retrying in ${Math.round(backoff)}ms...`);
            await sleep(backoff);
            continue;
          }
          
          return fallbackResponse(`LLM request failed with status ${response.status}: ${errorBody}`);
        }

        if (!response.body) {
           return fallbackResponse('No response body stream.');
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder('utf-8');
        let fullAssistantResponse = '';
        const activeToolCalls = new Map<number, {name: string, arguments: string}>();
        
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
                  const data = JSON.parse(dataStr);
                  
                  if (data.choices && data.choices[0] && data.choices[0].delta) {
                    const delta = data.choices[0].delta;
                    
                    if (delta.content) {
                      fullAssistantResponse += delta.content;
                      if (input.onContentChunk) {
                        input.onContentChunk(delta.content);
                      }
                    }
                    
                    if (delta.tool_calls) {
                      for (const tc of delta.tool_calls) {
                        const idx = tc.index;
                        if (!activeToolCalls.has(idx)) {
                           activeToolCalls.set(idx, { name: tc.function?.name || '', arguments: '' });
                        }
                        if (tc.function?.arguments) {
                           activeToolCalls.get(idx)!.arguments += tc.function.arguments;
                        }
                      }
                    }
                  }
                } catch (e) {
                  console.error('Failed to parse SSE chunk', e);
                }
              }
            }
            boundary = buffer.indexOf('\n\n');
          }
        }

        const allToolCalls: any[] = [];
        for (const [idx, tc] of activeToolCalls.entries()) {
          try {
            allToolCalls.push({
              name: tc.name,
              args: JSON.parse(tc.arguments)
            });
          } catch (e) {
            console.error(`Failed to parse arguments for tool ${tc.name}: ${tc.arguments}`, e);
          }
        }

        console.log(`[LLM Response Success] Latency: ${latency}ms, ToolCalls: ${allToolCalls.length}`);

        if (!fullAssistantResponse && allToolCalls.length === 0) {
          return fallbackResponse('LLM returned no assistant text and no tool calls.');
        }

        const finalResponse: GenerateAssistantResponseResult = { assistantResponse: fullAssistantResponse };
        if (allToolCalls.length > 0) finalResponse.toolCalls = allToolCalls;
        return finalResponse;
      } catch (error) {
        const latency = Date.now() - startTime;
        const message = error instanceof Error ? error.message : 'Unknown LLM error.';
        console.error(`[LLM Network Error] Attempt ${attempt}, Latency: ${latency}ms, Message: ${message}`);
        
        if (attempt <= MAX_RETRIES) {
          const backoff = Math.pow(2, attempt - 1) * 1000;
          console.log(`[LLM Retry] Retrying in ${Math.round(backoff)}ms...`);
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
