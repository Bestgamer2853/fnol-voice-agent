import type { LlmProvider, GenerateResponseInput, GenerateResponseResult } from './provider.js';

interface GeminiServiceOptions {
  apiKey?: string;
  model?: string;
  endpointBaseUrl?: string;
}

const DEFAULT_MODEL = 'gemini-flash-latest';
const DEFAULT_ENDPOINT_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/openai';

function readEnvironmentValue(name: string): string | undefined {
  const value = process.env[name];
  return value && value.trim().length > 0 ? value : undefined;
}

function fallbackResponse(errorMessage: string): GenerateResponseResult {
  return {
    assistantResponse:
      "I'm having a temporary connection issue with my AI service. Please give me a moment.",
    errorMessage,
  };
}

const MAX_RETRIES = 2;
const RETRYABLE_STATUS_CODES = new Set([429, 503, 408]);

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

export class GeminiService implements LlmProvider {
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

  async generateResponse(
    input: GenerateResponseInput,
  ): Promise<GenerateResponseResult> {
    if (!this.apiKey) {
      return fallbackResponse('API Key is not configured.');
    }

    const openaiTools = translateTools(input.tools);
    
    const messages: any[] = [
      { role: 'system', content: input.systemPrompt },
      { role: 'user', content: `Conversation context:\n${input.conversationContext}\n\nCurrent task:\n${input.userPrompt}` }
    ];

    if (input.toolContext) {
      for (const ctx of input.toolContext) {
        messages.push({
          role: 'assistant',
          content: ctx.assistantMessage || null,
          tool_calls: ctx.toolCalls.map(tc => ({
            id: tc.id,
            type: 'function',
            function: {
              name: tc.name,
              arguments: JSON.stringify(tc.args)
            }
          }))
        });

        for (const res of ctx.toolResults) {
          messages.push({
            role: 'tool',
            tool_call_id: res.id,
            name: res.name,
            content: res.result
          });
        }
      }
    }
    
    const requestBodyStr = JSON.stringify({
      model: this.model,
      messages,
      temperature: 0.4,
      max_tokens: 4096,
      stream: true,
      tools: openaiTools,
      response_format: input.responseMimeType === 'application/json' ? { type: 'json_object' } : undefined
    });

    const url = `${this.endpointBaseUrl}/chat/completions`;

    let attempt = 0;
    const reqIdForLogs = Math.random().toString(36).substring(2, 10);
    while (attempt <= MAX_RETRIES) {
      attempt++;
      const startTime = Date.now();
      console.log(`[Diagnostic] [ReqID: ${reqIdForLogs}] [LLM Request] Attempt ${attempt}. URL: ${url}, Model: ${this.model}, Method: POST`);
      console.log(`[Diagnostic] [ReqID: ${reqIdForLogs}] requestBody: ${requestBodyStr}`);
      console.log(`[Diagnostic] [ReqID: ${reqIdForLogs}] exact messages[] array:\n${JSON.stringify(messages, null, 2)}`);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.apiKey}`,
          },
          body: requestBodyStr,
          signal: controller.signal
        });
        clearTimeout(timeoutId);

        const latency = Date.now() - startTime;
        console.log(`[Diagnostic] [ReqID: ${reqIdForLogs}] HTTP Status: ${response.status}`);
        console.log(`[Diagnostic] [ReqID: ${reqIdForLogs}] Response Headers:`);
        response.headers.forEach((v, k) => console.log(`  ${k}: ${v}`));

        if (!response.ok) {
          const errorBody = await response.text();
          console.error(`[LLM Response Error] Attempt ${attempt}, Status: ${response.status}, Latency: ${latency}ms, Error: ${errorBody}`);

          if (attempt <= MAX_RETRIES && RETRYABLE_STATUS_CODES.has(response.status)) {
            const baseBackoff = Math.pow(2, attempt - 1) * 300;
            const jitter = Math.random() * 200;
            const backoff = baseBackoff + jitter;
            console.log(`[LLM Retry] Status ${response.status}. Retrying in ${Math.round(backoff)}ms...`);
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
        const activeToolCalls = new Map<number, {id: string, name: string, arguments: string}>();
        let finishReason = '';
        let usageMetadata: any = undefined;
        
        let buffer = '';
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          
          let match = buffer.match(/\r?\n\r?\n/);
          while (match && match.index !== undefined) {
            const boundary = match.index;
            const boundaryLen = match[0].length;
            const chunk = buffer.slice(0, boundary).trim();
            buffer = buffer.slice(boundary + boundaryLen);
            
            if (chunk.startsWith('data: ')) {
              const dataStr = chunk.slice(6);
              if (dataStr !== '[DONE]') {
                try {
                  const data = JSON.parse(dataStr);
                  if (data.usage) {
                    usageMetadata = data.usage;
                  }
                  
                  if (data.choices && data.choices[0]) {
                    const choice = data.choices[0];
                    if (choice.delta) {
                      const delta = choice.delta;
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
                             activeToolCalls.set(idx, { id: tc.id || '', name: tc.function?.name || '', arguments: '' });
                          }
                          if (tc.function?.arguments) {
                             activeToolCalls.get(idx)!.arguments += tc.function.arguments;
                          }
                        }
                      }
                    }
                    if (choice.finish_reason) {
                      finishReason = choice.finish_reason;
                    }
                  }
                } catch (e) {
                  console.error('Failed to parse SSE chunk', e);
                }
              }
            }
            match = buffer.match(/\r?\n\r?\n/);
          }
        }

        const allToolCalls: any[] = [];
        for (const [idx, tc] of activeToolCalls.entries()) {
          try {
            allToolCalls.push({
              id: tc.id,
              name: tc.name,
              args: JSON.parse(tc.arguments)
            });
          } catch (e) {
            console.error(`Failed to parse arguments for tool ${tc.name}: ${tc.arguments}`, e);
          }
        }

        console.log(`[LLM Response Success] Latency: ${latency}ms, ToolCalls: ${allToolCalls.length}`);
        console.log(`[Diagnostic] [ReqID: ${reqIdForLogs}] [LLM Response] fullAssistantResponse: "${fullAssistantResponse}"`);
        console.log(`[Diagnostic] [ReqID: ${reqIdForLogs}] [LLM Response] finishReason: "${finishReason}"`);
        console.log(`[Diagnostic] [ReqID: ${reqIdForLogs}] [LLM Response] usageMetadata: ${JSON.stringify(usageMetadata)}`);
        if (allToolCalls.length > 0) {
          console.log(`[LLM Response] tool_calls:\n${JSON.stringify(allToolCalls, null, 2)}`);
        }

        if (!fullAssistantResponse && allToolCalls.length === 0) {
          return fallbackResponse('LLM returned no assistant text and no tool calls.');
        }

        const finalResponse: GenerateResponseResult = { 
          assistantResponse: fullAssistantResponse,
          finishReason,
          usageMetadata,
          retries: attempt - 1,
        };
        if (allToolCalls.length > 0) finalResponse.toolCalls = allToolCalls;
        return finalResponse;
      } catch (error) {
        const latency = Date.now() - startTime;
        const message = error instanceof Error ? error.message : 'Unknown LLM error.';
        console.error(`[LLM Network Error] Attempt ${attempt}, Latency: ${latency}ms, Message: ${message}`);
        
        if (attempt <= MAX_RETRIES) {
          const baseBackoff = Math.pow(2, attempt - 1) * 300;
          const jitter = Math.random() * 200;
          const backoff = baseBackoff + jitter;
          console.log(`[LLM Retry] Network Error. Retrying in ${Math.round(backoff)}ms...`);
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
): LlmProvider {
  return new GeminiService(options);
}
