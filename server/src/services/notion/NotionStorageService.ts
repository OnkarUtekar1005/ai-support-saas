import { Client } from '@notionhq/client';
import { config } from '../../config';

interface NotionUploadResult {
  fileId: string;
  url: string;
  expiryTime: string;
}

interface NotionPageResult {
  pageId: string;
  pageUrl: string;
}

export class NotionStorageService {
  private notion: Client;

  constructor() {
    this.notion = new Client({ auth: config.notion.apiToken });
  }

  isEnabled(): boolean {
    return !!(config.notion.apiToken && config.notion.databaseId);
  }

  /** Ensure the Notion database has the required property columns. Safe to call repeatedly. */
  async initialize(): Promise<void> {
    if (!this.isEnabled()) return;
    try {
      await (this.notion.databases.update as any)({
        database_id: config.notion.databaseId,
        properties: {
          'File Type': { rich_text: {} },
          Project: { rich_text: {} },
          Notes: { rich_text: {} },
          Category: {
            select: {
              options: [
                { name: 'attachment', color: 'blue' },
                { name: 'document', color: 'green' },
              ],
            },
          },
        },
      });
    } catch (err) {
      console.warn('[Notion] Could not provision database schema:', (err as Error).message);
    }
  }

  /**
   * Upload a file to Notion using the Files API (3-step: create → send → complete).
   * Returns the internal file ID and a short-lived S3 URL.
   */
  async uploadFile(buffer: Buffer, filename: string, mimeType: string): Promise<NotionUploadResult> {
    const baseHeaders: Record<string, string> = {
      Authorization: `Bearer ${config.notion.apiToken}`,
      'Notion-Version': '2022-06-28',
    };

    // Step 1 – create upload session
    const createRes = await fetch('https://api.notion.com/v1/files', {
      method: 'POST',
      headers: { ...baseHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename, content_type: mimeType }),
    });
    if (!createRes.ok) {
      throw new Error(`Notion create upload failed (${createRes.status}): ${await createRes.text()}`);
    }
    const { id: fileId } = await createRes.json() as { id: string };

    // Step 2 – upload content as a single part
    const form = new FormData();
    form.append('file', new Blob([buffer], { type: mimeType }), filename);
    const sendRes = await fetch(`https://api.notion.com/v1/files/${fileId}/send?part_number=1`, {
      method: 'PUT',
      headers: baseHeaders,
      body: form,
    });
    if (!sendRes.ok) {
      throw new Error(`Notion send part failed (${sendRes.status}): ${await sendRes.text()}`);
    }

    // Step 3 – complete upload and get the hosted URL
    const completeRes = await fetch(`https://api.notion.com/v1/files/${fileId}/complete`, {
      method: 'POST',
      headers: { ...baseHeaders, 'Content-Type': 'application/json' },
      body: '{}',
    });
    if (!completeRes.ok) {
      throw new Error(`Notion complete upload failed (${completeRes.status}): ${await completeRes.text()}`);
    }
    const data = await completeRes.json() as { url: string; expiry_time: string };
    return { fileId, url: data.url, expiryTime: data.expiry_time };
  }

  /** Create a Notion database page that embeds the uploaded file as a block. */
  async createPage(params: {
    name: string;
    fileType: string;
    notes?: string | null;
    projectName: string;
    category: 'attachment' | 'document';
    fileId: string;
    fileUrl: string;
    expiryTime: string;
  }): Promise<NotionPageResult> {
    const page = await this.notion.pages.create({
      parent: { database_id: config.notion.databaseId },
      properties: {
        Name: { title: [{ text: { content: params.name } }] },
        'File Type': { rich_text: [{ text: { content: params.fileType } }] },
        Project: { rich_text: [{ text: { content: params.projectName } }] },
        Category: { select: { name: params.category } },
        ...(params.notes
          ? { Notes: { rich_text: [{ text: { content: params.notes } }] } }
          : {}),
      },
      children: [
        {
          object: 'block',
          type: 'file',
          file: {
            type: 'file',
            file: { url: params.fileUrl, expiry_time: params.expiryTime },
            caption: [{ type: 'text', text: { content: params.name } }],
          },
        } as any,
      ],
    });

    const pageId = page.id;
    return {
      pageId,
      pageUrl: `https://notion.so/${pageId.replace(/-/g, '')}`,
    };
  }

  /**
   * Fetch the current (non-expired) S3 URL for the file block on a Notion page.
   * Notion refreshes the URL automatically each time you retrieve the block.
   */
  async getFileUrl(pageId: string): Promise<string | null> {
    try {
      const blocks = await this.notion.blocks.children.list({ block_id: pageId });
      const fileBlock = blocks.results.find((b: any) => b.type === 'file');
      if (!fileBlock) return null;
      return (fileBlock as any).file?.file?.url ?? null;
    } catch {
      return null;
    }
  }

  /** Download the file content from Notion (for in-memory processing). */
  async downloadFile(pageId: string): Promise<Buffer | null> {
    const url = await this.getFileUrl(pageId);
    if (!url) return null;
    const res = await fetch(url);
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  }

  /** Archive (soft-delete) a Notion page when the attachment is deleted. */
  async archivePage(pageId: string): Promise<void> {
    await this.notion.pages.update({ page_id: pageId, archived: true });
  }
}

export const notionStorage = new NotionStorageService();
