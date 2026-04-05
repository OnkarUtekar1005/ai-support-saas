import { readFileSync } from 'fs';
import { join } from 'path';
import { Client } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

async function setupTriggers() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });

  try {
    await client.connect();
    console.log('Connected to database.');

    const sql = readFileSync(join(__dirname, 'triggers.sql'), 'utf-8');
    await client.query(sql);

    console.log('LISTEN/NOTIFY triggers created successfully.');
  } catch (err) {
    console.error('Failed to setup triggers:', (err as Error).message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

setupTriggers();
