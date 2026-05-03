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

  async addEntry(
    organizationId: string,
    title: string,
    content: string,
    category?: string,
    projectId?: string,
    documentId?: string,
    chunkIndex?: number
  ): Promise<string> {
    const embedding = await this.embeddings.embedText(`${title}\n${content}`);

    const entry = await prisma.knowledgeEntry.create({
      data: {
        title,
        content,
        category,
        embedding,
        organizationId,
        ...(projectId && { projectId }),
        ...(documentId && { documentId }),
        ...(chunkIndex !== undefined && { chunkIndex }),
      },
    });

    return entry.id;
  }

  async search(organizationId: string, query: string, topK = 5): Promise<SearchResult[]> {
    const entries = await prisma.knowledgeEntry.findMany({
      where: { organizationId },
      select: { id: true, title: true, content: true, embedding: true },
    });

    if (entries.length === 0) return [];

    const queryEmbedding = await this.embeddings.embedText(query);
    return this.rankBySimilarity(entries, queryEmbedding, topK);
  }

  async searchByProject(
    organizationId: string,
    projectId: string,
    query: string,
    topK = 5
  ): Promise<SearchResult[]> {
    const entries = await prisma.knowledgeEntry.findMany({
      where: { organizationId, projectId },
      select: { id: true, title: true, content: true, embedding: true },
    });

    // Skip embedding API call if there's nothing to search
    if (entries.length === 0) return [];

    const queryEmbedding = await this.embeddings.embedText(query);
    return this.rankBySimilarity(entries, queryEmbedding, topK);
  }

  async addBatch(
    organizationId: string,
    entries: Array<{ title: string; content: string; category?: string }>,
    projectId?: string
  ): Promise<number> {
    let count = 0;
    for (const entry of entries) {
      await this.addEntry(organizationId, entry.title, entry.content, entry.category, projectId);
      count++;
    }
    return count;
  }

  private rankBySimilarity(
    entries: Array<{ id: string; title: string; content: string; embedding: number[] }>,
    queryEmbedding: number[],
    topK: number
  ): SearchResult[] {
    return entries
      .map((e) => ({ id: e.id, title: e.title, content: e.content, score: cosineSimilarity(queryEmbedding, e.embedding) }))
      .filter((e) => e.score > 0.3)
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);
  }
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}
