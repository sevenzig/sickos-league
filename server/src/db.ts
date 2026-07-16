import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';

const SQL_DIR = process.env.SQL_DIR || path.resolve(process.cwd(), '..', 'db');

// Admin pool (superuser): migrations only.
export const adminPool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
});

// App pool: request handling. app_user is a plain role (member of
// `authenticated`), so RLS policies apply exactly as they did under Supabase.
export const appPool = new pg.Pool({
  connectionString: process.env.APP_DATABASE_URL,
});

/**
 * Run `fn` inside a transaction with app.user_id set, so auth.uid()
 * resolves to the calling user inside SQL functions, views, and policies.
 */
export async function runAsUser<T>(
  userId: string | null,
  fn: (client: pg.PoolClient) => Promise<T>
): Promise<T> {
  const client = await appPool.connect();
  try {
    await client.query('BEGIN');
    if (userId) {
      await client.query('SELECT set_config($1, $2, true)', ['app.user_id', userId]);
    }
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Apply bootstrap.sql (idempotent, every boot), then any unapplied
 * migrations in filename order, then seed.sql (idempotent, every boot).
 */
export async function migrate(): Promise<void> {
  const client = await adminPool.connect();
  try {
    const bootstrap = fs.readFileSync(path.join(SQL_DIR, 'bootstrap.sql'), 'utf8');
    await client.query(bootstrap);

    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    const migrationsDir = path.join(SQL_DIR, 'migrations');
    const files = fs
      .readdirSync(migrationsDir)
      .filter((f) => f.endsWith('.sql') && fs.statSync(path.join(migrationsDir, f)).isFile())
      .sort();

    const { rows } = await client.query('SELECT name FROM schema_migrations');
    const applied = new Set(rows.map((r) => r.name));

    for (const file of files) {
      if (applied.has(file)) continue;
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
      console.log(`Applying migration ${file}...`);
      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        throw new Error(`Migration ${file} failed: ${(err as Error).message}`);
      }
    }

    const seedPath = path.join(SQL_DIR, 'seed.sql');
    if (fs.existsSync(seedPath)) {
      await client.query(fs.readFileSync(seedPath, 'utf8'));
    }

    console.log('Database ready.');
  } finally {
    client.release();
  }
}
