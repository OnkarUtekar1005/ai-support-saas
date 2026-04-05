import { prisma } from '../../utils/prisma';
import { GeminiEmbeddings } from '../ai/GeminiEmbeddings';
import * as fs from 'fs';
import * as path from 'path';

export class DocumentProcessor {
  private embeddings: GeminiEmbeddings;

  constructor() {
    this.embeddings = new GeminiEmbeddings();
  }

  async process(documentId: string): Promise<void> {
    const doc = await prisma.projectDocument.findUnique({ where: { id: documentId } });
    if (!doc) throw new Error('Document not found');

    try {
      // Update status to processing
      await prisma.projectDocument.update({ where: { id: documentId }, data: { status: 'processing' } });

      // Extract text based on file type
      let text = '';
      if (doc.fileType === 'pdf') {
        const pdfParse = require('pdf-parse');
        const buffer = fs.readFileSync(doc.filePath);
        const pdf = await pdfParse(buffer);
        text = pdf.text;
      } else if (doc.fileType === 'docx') {
        const mammoth = await import('mammoth');
        const result = await mammoth.extractRawText({ path: doc.filePath });
        text = result.value;
      } else {
        // txt, md
        text = fs.readFileSync(doc.filePath, 'utf-8');
      }

      if (!text.trim()) {
        await prisma.projectDocument.update({ where: { id: documentId }, data: { status: 'failed', errorMessage: 'No text content found' } });
        return;
      }

      // Chunk text
      const chunks = this.chunkText(text, 500, 50);

      // Create knowledge entries with embeddings
      let chunkCount = 0;
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        const title = `${doc.fileName} — chunk ${i + 1}`;

        try {
          const embedding = await this.embeddings.embedText(`${title}\n${chunk}`);
          await prisma.knowledgeEntry.create({
            data: {
              title,
              content: chunk,
              category: 'document',
              embedding,
              projectId: doc.projectId,
              documentId: doc.id,
              chunkIndex: i,
              organizationId: doc.organizationId,
            },
          });
          chunkCount++;
        } catch (err) {
          console.error(`Failed to embed chunk ${i} of ${doc.fileName}:`, (err as Error).message);
        }
      }

      await prisma.projectDocument.update({
        where: { id: documentId },
        data: { status: 'indexed', chunkCount },
      });
    } catch (err) {
      await prisma.projectDocument.update({
        where: { id: documentId },
        data: { status: 'failed', errorMessage: (err as Error).message },
      });
    }
  }

  private chunkText(text: string, chunkSize: number, overlap: number): string[] {
    const words = text.split(/\s+/);
    const chunks: string[] = [];
    for (let i = 0; i < words.length; i += chunkSize - overlap) {
      const chunk = words.slice(i, i + chunkSize).join(' ');
      if (chunk.trim()) chunks.push(chunk.trim());
      if (i + chunkSize >= words.length) break;
    }
    return chunks;
  }
}
