import { GoogleGenerativeAI, GenerativeModel } from '@google/generative-ai';
import { config } from '../../config';
import crypto from 'crypto';

interface CacheEntry {
  response: string;
  timestamp: number;
}

// Optional Langfuse tracing — loaded lazily so the server still starts without LANGFUSE_* env vars
let Langfuse: any = null;
let langfuseClient: any = null;

async function getLangfuse() {
  if (!config.langfuse.enabled) return null;
  if (langfuseClient) return langfuseClient;
  try {
    const mod = await import('langfuse');
    Langfuse = mod.Langfuse;
    langfuseClient = new Langfuse({
      secretKey: config.langfuse.secretKey,
      publicKey: config.langfuse.publicKey,
      baseUrl: config.langfuse.baseUrl,
      flushAt: 20,
      flushInterval: 10_000,
    });
    return langfuseClient;
  } catch {
    return null;
  }
}

export class GeminiClient {
  private model: GenerativeModel;
  private cache: Map<string, CacheEntry> = new Map();
  private readonly cacheTTL = 60 * 60 * 1000; // 60 minutes
  private readonly maxCacheSize = 200;

  constructor(apiKey?: string) {
    const genAI = new GoogleGenerativeAI(apiKey || config.gemini.apiKey);
    this.model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
  }

  async generateContent(
    prompt: string,
    options?: { useCache?: boolean; traceId?: string; traceName?: string; userId?: string }
  ): Promise<string> {
    const useCache = options?.useCache ?? true;
    const cacheKey = this.hashPrompt(prompt);

    if (useCache) {
      const cached = this.cache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
        return cached.response;
      }
    }

    const lf = await getLangfuse();
    let trace: any = null;
    let generation: any = null;
    const startTime = Date.now();

    if (lf) {
      trace = lf.trace({
        id: options?.traceId,
        name: options?.traceName || 'gemini-generate',
        userId: options?.userId,
        input: prompt.substring(0, 1000), // truncate for observability
      });
      generation = trace.generation({
        name: 'gemini-2.5-flash',
        model: 'gemini-2.5-flash',
        input: prompt,
        startTime: new Date(startTime),
      });
    }

    let response: string;
    try {
      response = await this.callWithRetry(prompt);

      if (generation) {
        generation.end({
          output: response.substring(0, 2000),
          endTime: new Date(),
          usage: { totalTokens: Math.ceil((prompt.length + response.length) / 4) },
        });
      }
    } catch (err) {
      if (generation) {
        generation.end({ level: 'ERROR', statusMessage: String(err) });
      }
      throw err;
    }

    if (useCache) {
      if (this.cache.size >= this.maxCacheSize) {
        const oldestKey = this.cache.keys().next().value;
        if (oldestKey) this.cache.delete(oldestKey);
      }
      this.cache.set(cacheKey, { response, timestamp: Date.now() });
    }

    return response;
  }

  /**
   * Stream response tokens via an async generator.
   * Usage: for await (const chunk of client.streamContent(prompt)) { ... }
   */
  async *streamContent(
    prompt: string,
    options?: { traceId?: string; traceName?: string; userId?: string }
  ): AsyncGenerator<string> {
    const lf = await getLangfuse();
    let trace: any = null;
    let generation: any = null;
    let fullResponse = '';

    if (lf) {
      trace = lf.trace({
        id: options?.traceId,
        name: options?.traceName || 'gemini-stream',
        userId: options?.userId,
        input: prompt.substring(0, 1000),
      });
      generation = trace.generation({
        name: 'gemini-2.5-flash-stream',
        model: 'gemini-2.5-flash',
        input: prompt,
        startTime: new Date(),
      });
    }

    try {
      const result = await this.model.generateContentStream(prompt);
      for await (const chunk of result.stream) {
        const text = chunk.text();
        fullResponse += text;
        yield text;
      }

      if (generation) {
        generation.end({
          output: fullResponse.substring(0, 2000),
          endTime: new Date(),
          usage: { totalTokens: Math.ceil((prompt.length + fullResponse.length) / 4) },
        });
      }
    } catch (err) {
      if (generation) {
        generation.end({ level: 'ERROR', statusMessage: String(err) });
      }
      throw err;
    }
  }

  private async callWithRetry(prompt: string, maxRetries = 3): Promise<string> {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const result = await this.model.generateContent(prompt);
        return result.response.text();
      } catch (err: any) {
        if (err?.status === 429 && attempt < maxRetries - 1) {
          const delay = Math.pow(2, attempt) * 1000 + Math.random() * 1000;
          await new Promise((r) => setTimeout(r, delay));
          continue;
        }
        throw err;
      }
    }
    throw new Error('Max retries exceeded');
  }

  private hashPrompt(prompt: string): string {
    return crypto.createHash('sha256').update(prompt).digest('hex').substring(0, 16);
  }
}
