import sql from 'mssql';
import { SqlSafetyGuard } from './SqlSafetyGuard';

interface ConnectionConfig {
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
}

const SENSITIVE_COLUMNS = [
  'password', 'pwd', 'pass', 'secret', 'token', 'ssn',
  'social_security', 'credit_card', 'card_number', 'cvv',
];

export class SqlConnector {
  private pool: sql.ConnectionPool | null = null;

  async connect(config: ConnectionConfig): Promise<void> {
    this.pool = await new sql.ConnectionPool({
      server: config.host,
      port: config.port,
      database: config.database,
      user: config.username,
      password: config.password,
      options: {
        encrypt: true,
        trustServerCertificate: true,
      },
      pool: { min: 2, max: 50, idleTimeoutMillis: 30000 },
    }).connect();
  }

  async executeQuery(query: string, maxRows = 1000): Promise<{ columns: string[]; rows: any[]; rowCount: number }> {
    if (!this.pool) throw new Error('Not connected to database');

    // Safety check
    const safety = SqlSafetyGuard.validate(query);
    if (!safety.safe) {
      throw new Error(`Query blocked: ${safety.reason}`);
    }

    const result = await this.pool.request().query(query);
    const recordset = result.recordset || [];
    const columns = recordset.length > 0 ? Object.keys(recordset[0]) : [];

    // Mask sensitive columns
    const maskedRows = recordset.slice(0, maxRows).map((row) => {
      const masked = { ...row };
      for (const col of columns) {
        if (SENSITIVE_COLUMNS.some((s) => col.toLowerCase().includes(s))) {
          masked[col] = '***MASKED***';
        }
      }
      return masked;
    });

    return { columns, rows: maskedRows, rowCount: recordset.length };
  }

  async testConnection(): Promise<boolean> {
    if (!this.pool) return false;
    try {
      await this.pool.request().query('SELECT 1 AS test');
      return true;
    } catch {
      return false;
    }
  }

  async disconnect(): Promise<void> {
    if (this.pool) {
      await this.pool.close();
      this.pool = null;
    }
  }
}
