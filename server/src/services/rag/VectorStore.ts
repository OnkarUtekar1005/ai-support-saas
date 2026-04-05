import { prisma } from '../../utils/prisma';
import { GeminiEmbeddings } from '../ai/GeminiEmbeddings';

export interface SearchResult {
  id: string;
  title: string;
  content: string;
  score: number;
}

export class VectorStore {
  private embeddings: GeminiEmbeddings;

  constructor() {
    this.embeddings = new GeminiEmbeddings();
  }

  async addEntry(organizationId: string, title: string, content: string, category?: string): Promise<string> {
    const embedding = await this.embeddings.embedText(`${title}\n${content}`);

    const entry = await prisma.knowledgeEntry.create({
      data: {
        title,
        content,
        category,
        embedding,
        organizationId,
      },
    });

    return entry.id;
  }

  async search(organizationId: string, query: string, topK = 5): Promise<SearchResult[]> {
    const queryEmbedding = await this.embeddings.embedText(query);

    // Get all entries for the organization
    const entries = await prisma.knowledgeEntry.findMany({
      where: { organizationId },
      select: { id: true, title: true, content: true, embedding: true },
    });

    // Calculate cosine similarity
    const scored = entries
      .map((entry) => ({
        id: entry.id,
        title: entry.title,
        content: entry.content,
        score: cosineSimilarity(queryEmbedding, entry.embedding),
      }))
      .filter((e) => e.score > 0.3)
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);

    return scored;
  }

  async searchByProject(organizationId: string, projectId: string, query: string, topK = 5): Promise<SearchResult[]> {
    const queryEmbedding = await this.embeddings.embedText(query);

    const entries = await prisma.knowledgeEntry.findMany({
      where: { organizationId, projectId },
      select: { id: true, title: true, content: true, embedding: true },
    });

    const scored = entries
      .map((entry) => ({
        id: entry.id,
        title: entry.title,
        content: entry.content,
        score: cosineSimilarity(queryEmbedding, entry.embedding),
      }))
      .filter((e) => e.score > 0.3)
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);

    return scored;
  }

  async addBatch(
    organizationId: string,
    entries: Array<{ title: string; content: string; category?: string }>
  ): Promise<number> {
    let count = 0;
    for (const entry of entries) {
      await this.addEntry(organizationId, entry.title, entry.content, entry.category);
      count++;
    }
    return count;
  }
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  return denominator === 0 ? 0 : dotProduct / denominator;
}
