import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { env } from '@/lib/env';
import * as schema from '@/db/schema';

/**
 * Postgres connection through Supavisor in TRANSACTION mode.
 *
 * ⚠️ Serverless functions each open their own connection. Connecting directly
 * to :5432 exhausts max_connections under load and takes down all five apps at
 * once (doc 08 §2.4), env.ts refuses a non-pooler URL.
 *
 * Transaction mode forbids prepared statements, hence prepare: false.
 */
const client = postgres(env.DATABASE_URL, {
  prepare: false,
  max: 1,
  idle_timeout: 20,
  connect_timeout: 10,
});

export const db = drizzle(client, { schema });
export type Db = typeof db;
