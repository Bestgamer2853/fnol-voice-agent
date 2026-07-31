import type { LlmProvider, GenerateResponseInput, GenerateResponseResult } from './provider.js';

interface GeminiServiceOptions {
  apiKey?: string;
  model?: string;
  endpointBaseUrl?: string;
}

const DEFAULT_MODEL = 'gemini-3.6-flash';
const DEFAULT_ENDPOINT_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models';

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

const MAX_RETRIES = 1;
const RETRYABLE_STATUS_CODES = new Set([429, 503, 502, 500, 408]);

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class GeminiService implements LlmProvider {
  private readonly apiKey: string | undefined;
  private readonly model: string;
  private readonly endpointBaseUrl: string;

  constructor(options: GeminiServiceOptions = {}) {
    this.apiKey = options.apiKey ?? readEnvironmentValue('GEMINI_API_KEY');
      
    // Default to gemini-flash-latest if not provided
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

    const contents: any[] = [];
    
    contents.push({
      role: 'user',
      parts: [{ text: `Conversation context:\n${input.conversationContext}\n\nCurrent task:\n${input.userPrompt}` }]
    });

    if (input.toolContext) {
      for (const ctx of input.toolContext) {
        if (ctx.assistantMessage || ctx.toolCalls.length > 0) {
          const parts: any[] = [];
          if (ctx.assistantMessage) {
            parts.push({ text: ctx.assistantMessage });
          }
          for (const tc of ctx.toolCalls) {
            parts.push({
              functionCall: {
                name: tc.name,
                args: tc.args
              }
            });
          }
          contents.push({ role: 'model', parts });
        }

        if (ctx.toolResults.length > 0) {
          const parts: any[] = ctx.toolResults.map(res => ({
            functionResponse: {
              name: res.name,
              response: { result: res.result }
            }
          }));
          contents.push({ role: 'user', parts });
        }
      }
    }
    
    const requestBody: any = {
      systemInstruction: {
        parts: [{ text: input.systemPrompt }]
      },
      contents,
      generationConfig: {
        temperature: 0.4,
        maxOutputTokens: 4096,
      }
    };
    
    if (input.responseMimeType === 'application/json') {
      requestBody.generationConfig.responseMimeType = 'application/json';
    }
    
    if (input.tools && input.tools.length > 0) {
      requestBody.tools = input.tools; // Google native format is already what we had!
    }
    
    const requestBodyStr = JSON.stringify(requestBody);

    const url = `${this.endpointBaseUrl}/${this.model}:streamGenerateContent?key=${this.apiKey}&alt=sse`;

    let attempt = 0;
    const reqIdForLogs = Math.random().toString(36).substring(2, 10);
    while (attempt <= MAX_RETRIES) {
      attempt++;
      const startTime = Date.now();
      console.log(`[Diagnostic] [ReqID: ${reqIdForLogs}] [LLM Request] Attempt ${attempt}. Native URL: ${this.endpointBaseUrl}/${this.model}:streamGenerateContent, Method: POST`);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4500); // Evidence-based P95 (3733ms) + 15% safety margin
      const onParentAbort = () => { controller.abort(); };
      if (input.abortSignal) {
         input.abortSignal.addEventListener('abort', onParentAbort);
         if (input.abortSignal.aborted) controller.abort();
      }

      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: requestBodyStr,
          signal: controller.signal
        });
        clearTimeout(timeoutId);
        if (input.abortSignal) input.abortSignal.removeEventListener('abort', onParentAbort);

        const ttfbMs = Date.now() - startTime;
        console.log(`[Diagnostic] [ReqID: ${reqIdForLogs}] HTTP Status: ${response.status}, TTFB: ${ttfbMs}ms`);

        if (!response.ok) {
          const errorBody = await response.text();
          console.error(`[LLM Response Error] Attempt ${attempt}, Status: ${response.status}, Latency: ${ttfbMs}ms, Error: ${errorBody}`);

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
        let finishReason = '';
        let usageMetadata: any = undefined;
        const allToolCalls: any[] = [];
        
        let buffer = '';
        let ttftMs: number | undefined;
        
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (ttftMs === undefined) {
             ttftMs = Date.now() - startTime;
          }

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
                  if (data.usageMetadata) {
                    usageMetadata = {
                      promptTokenCount: data.usageMetadata.promptTokenCount,
                      candidatesTokenCount: data.usageMetadata.candidatesTokenCount,
                      totalTokenCount: data.usageMetadata.totalTokenCount
                    };
                  }
                  
                  if (data.candidates && data.candidates[0]) {
                    const candidate = data.candidates[0];
                    if (candidate.finishReason) {
                      finishReason = candidate.finishReason;
                    }
                    if (candidate.content && candidate.content.parts) {
                      for (const part of candidate.content.parts) {
                        if (part.text) {
                          fullAssistantResponse += part.text;
                          if (input.onContentChunk) {
                            input.onContentChunk(part.text);
                          }
                        }
                        if (part.functionCall) {
                           allToolCalls.push({
                              id: Math.random().toString(36).substring(2, 9),
                              name: part.functionCall.name,
                              args: part.functionCall.args
                           });
                        }
                      }
                    }
                  }
                } catch (e) {
                  // Ignore JSON parse errors for incomplete chunks
                }
              }
            }
            match = buffer.match(/\r?\n\r?\n/);
          }
        }

        const totalDuration = Date.now() - startTime;
        console.log(`[LLM Response Success] Latency: ${totalDuration}ms, ToolCalls: ${allToolCalls.length}`);
        
        if (!fullAssistantResponse && allToolCalls.length === 0) {
          return fallbackResponse('LLM returned no assistant text and no tool calls.');
        }

        const finalResponse: GenerateResponseResult = { 
          assistantResponse: fullAssistantResponse,
          finishReason,
          usageMetadata,
          retries: attempt - 1,
          ...(ttfbMs !== undefined ? { ttfbMs } : {}),
          ...(ttftMs !== undefined ? { ttftMs } : {}),
        };
        if (allToolCalls.length > 0) finalResponse.toolCalls = allToolCalls;
        return finalResponse;
      } catch (error) {
        clearTimeout(timeoutId);
        if (input.abortSignal) input.abortSignal.removeEventListener('abort', onParentAbort);
        if (input.abortSignal?.aborted) {
            throw new Error('AbortError: LLM generation was aborted.');
        }
        const duration = Date.now() - startTime;
        const message = error instanceof Error ? error.message : 'Unknown LLM error.';
        console.error(`[LLM Network Error] Attempt ${attempt}, Latency: ${duration}ms, Message: ${message}`);
        
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

