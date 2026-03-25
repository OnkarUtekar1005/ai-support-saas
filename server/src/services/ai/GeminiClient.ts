import { GoogleGenerativeAI, GenerativeModel } from '@google/generative-ai';
import { config } from '../../config';
import crypto from 'crypto';

interface CacheEntry {
  response: string;
  timestamp: number;
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

  async generateContent(prompt: string, useCache = true): Promise<string> {
    const cacheKey = this.hashPrompt(prompt);

    // Check cache
    if (useCache) {
      const cached = this.cache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
        return cached.response;
      }
    }

    // Call API with retry
    const response = await this.callWithRetry(prompt);

    // Cache the response
    if (useCache) {
      if (this.cache.size >= this.maxCacheSize) {
        const oldestKey = this.cache.keys().next().value;
        if (oldestKey) this.cache.delete(oldestKey);
      }
      this.cache.set(cacheKey, { response, timestamp: Date.now() });
    }

    return response;
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
