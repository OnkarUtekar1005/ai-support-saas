import { GoogleGenerativeAI } from '@google/generative-ai';
import { config } from '../../config';

export class GeminiEmbeddings {
  private genAI: GoogleGenerativeAI;

  constructor(apiKey?: string) {
    this.genAI = new GoogleGenerativeAI(apiKey || config.gemini.apiKey);
  }

  async embedText(text: string): Promise<number[]> {
    const model = this.genAI.getGenerativeModel({ model: 'text-embedding-004' });
    const result = await model.embedContent(text);
    return result.embedding.values;
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    const batchSize = 10;
    const embeddings: number[][] = [];

    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize);
      const results = await Promise.all(batch.map((t) => this.embedText(t)));
      embeddings.push(...results);
    }

    return embeddings;
  }
}
