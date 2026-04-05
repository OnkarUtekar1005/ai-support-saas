import { Client, Notification } from 'pg';
import { EventEmitter } from 'events';
import { logger } from '../OrchestratorLogger';

export interface ErrorEvent {
  id: string;
  level: string;
  source: string;
  projectId: string | null;
  organizationId: string;
  analyzed: boolean;
}

export interface ErrorAnalyzedEvent {
  id: string;
  level: string;
  source: string;
  projectId: string | null;
  organizationId: string;
  aiAnalysis: string;
  aiSuggestion: string;
}

export interface PipelineStatusEvent {
  id: string;
  status: string;
  projectId: string | null;
  organizationId: string;
}

export interface DBListenerEvents {
  'new_error': (event: ErrorEvent) => void;
  'error_analyzed': (event: ErrorAnalyzedEvent) => void;
  'pipeline_status': (event: PipelineStatusEvent) => void;
  'connected': () => void;
  'disconnected': () => void;
}

export class DBListener extends EventEmitter {
  private client: Client | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private isShuttingDown = false;
  private connectionString: string;

  constructor(connectionString: string) {
    super();
    this.connectionString = connectionString;
  }

  async start(): Promise<void> {
    await this.connect();
  }

  private async connect(): Promise<void> {
    if (this.isShuttingDown) return;

    try {
      this.client = new Client({ connectionString: this.connectionString });

      this.client.on('error', (err) => {
        logger.error('DB listener connection error:', err.message);
        this.scheduleReconnect();
      });

      this.client.on('end', () => {
        if (!this.isShuttingDown) {
          logger.warn('DB listener disconnected. Reconnecting...');
          this.emit('disconnected');
          this.scheduleReconnect();
        }
      });

      this.client.on('notification', (msg: Notification) => {
        this.handleNotification(msg);
      });

      await this.client.connect();

      // Subscribe to channels
      await this.client.query('LISTEN new_error');
      await this.client.query('LISTEN error_analyzed');
      await this.client.query('LISTEN pipeline_status');

      logger.info('DB listener connected — listening on: new_error, error_analyzed, pipeline_status');
      this.emit('connected');
    } catch (err) {
      logger.error('DB listener failed to connect:', (err as Error).message);
      this.scheduleReconnect();
    }
  }

  private handleNotification(msg: Notification): void {
    if (!msg.payload) return;

    try {
      const data = JSON.parse(msg.payload);

      switch (msg.channel) {
        case 'new_error':
          logger.debug(`New error event: ${data.id} [${data.level}]`);
          this.emit('new_error', data as ErrorEvent);
          break;

        case 'error_analyzed':
          logger.debug(`Error analyzed: ${data.id}`);
          this.emit('error_analyzed', data as ErrorAnalyzedEvent);
          break;

        case 'pipeline_status':
          logger.debug(`Pipeline status: ${data.id} → ${data.status}`);
          this.emit('pipeline_status', data as PipelineStatusEvent);
          break;

        default:
          logger.warn(`Unknown channel: ${msg.channel}`);
      }
    } catch (err) {
      logger.error('Failed to parse notification payload:', (err as Error).message);
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer || this.isShuttingDown) return;

    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null;
      logger.info('Attempting DB listener reconnect...');
      await this.cleanup();
      await this.connect();
    }, 5000);
  }

  private async cleanup(): Promise<void> {
    if (this.client) {
      try {
        await this.client.end();
      } catch {
        // Ignore cleanup errors
      }
      this.client = null;
    }
  }

  async stop(): Promise<void> {
    this.isShuttingDown = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    await this.cleanup();
    logger.info('DB listener stopped.');
  }
}
