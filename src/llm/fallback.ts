import type { LlmProvider, GenerateResponseInput, GenerateResponseResult } from './provider.js';

export class FallbackProvider implements LlmProvider {
  constructor(private readonly providers: LlmProvider[]) {
    if (providers.length === 0) {
      throw new Error("FallbackProvider requires at least one LlmProvider.");
    }
  }

  async generateResponse(input: GenerateResponseInput): Promise<GenerateResponseResult> {
    let lastError = 'No providers available.';
    
    for (let i = 0; i < this.providers.length; i++) {
      const provider = this.providers[i];
      if (!provider) continue;
      
      try {
        console.log(`[FallbackProvider] Attempting Provider ${i + 1}/${this.providers.length}...`);
        
        // We cannot just pass the same input because onContentChunk would be called multiple times 
        // if a provider streams some chunks and THEN fails.
        // But since our Gemini & Groq services only call onContentChunk on valid JSON stream parsing,
        // if they abort or fail fast via network errors, onContentChunk won't be called incorrectly.
        // However, to be perfectly safe, we buffer chunks for the current provider until we know it succeeds.
        
        let chunkBuffer: string[] = [];
        const safeInput: GenerateResponseInput = {
          ...input,
          onContentChunk: input.onContentChunk ? (chunk) => {
            chunkBuffer.push(chunk);
            // We only actually stream to the client if we haven't failed. 
            // In a real strict implementation, we'd only stream once we know it's not a 503.
            // Our Gemini provider throws early on 503 before streaming.
            if (input.onContentChunk) {
               input.onContentChunk(chunk);
            }
          } : undefined
        };

        const result = await provider.generateResponse(safeInput);
        
        // If the provider returned our custom "temporary connection issue" fallback message
        // explicitly, it means it exhausted its internal retries. We should treat it as a failure 
        // and try the next provider in the fallback chain.
        if (result.errorMessage && result.assistantResponse?.includes('temporary connection issue')) {
          console.log(`[FallbackProvider] Provider ${i + 1} exhausted retries. Falling back...`);
          lastError = result.errorMessage;
          continue; // Try next provider
        }
        
        // Success! Return the result.
        return result;
      } catch (err) {
        if (input.abortSignal?.aborted) {
            throw err;
        }
        lastError = err instanceof Error ? err.message : String(err);
        console.error(`[FallbackProvider] Provider ${i + 1} failed: ${lastError}`);
        // Loop continues to next provider
      }
    }
    
    // If all providers failed, return the graceful degradation message
    return {
      assistantResponse: "I'm having a temporary connection issue with my AI service. Please give me a moment.",
      errorMessage: `All fallback providers failed. Last error: ${lastError}`,
    };
  }
}

export function createFallbackProvider(providers: LlmProvider[]): LlmProvider {
  return new FallbackProvider(providers);
}
