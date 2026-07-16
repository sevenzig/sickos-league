import { Router } from 'express';
import { runAsUser } from './db.js';
import type { AuthedRequest } from './auth.js';

/** Public-schema tables/views the generic query endpoint may touch. RLS still applies. */
const TABLE_ALLOWLIST = new Set([
  'teams',
  'game_stats',
  'lineups',
  'matchups',
  'league_settings',
  'leagues',
  'league_members',
  'league_invitations',
  'fantasy_teams',
  'fantasy_lineups',
  'league_matchups',
  'league_weeks',
  'user_profiles',
  'v_league_standings',
  'v_user_leagues',
]);

/**
 * Foreign-key embeds supported in select strings (the supabase-js
 * `related_table(cols)` syntax). Keyed per table by either the related table
 * name or an explicit FK-constraint hint.
 */
const EMBEDS: Record<string, Record<string, { table: string; local: string; foreign: string }>> = {
  lineups: {
    teams: { table: 'teams', local: 'team_id', foreign: 'id' },
  },
  matchups: {
    matchups_team1_id_fkey: { table: 'teams', local: 'team1_id', foreign: 'id' },
    matchups_team2_id_fkey: { table: 'teams', local: 'team2_id', foreign: 'id' },
    teams: { table: 'teams', local: 'team1_id', foreign: 'id' },
  },
  league_invitations: {
    leagues: { table: 'leagues', local: 'league_id', foreign: 'id' },
  },
  fantasy_teams: {
    leagues: { table: 'leagues', local: 'league_id', foreign: 'id' },
  },
};

const IDENT = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

function q(ident: string): string {
  if (!IDENT.test(ident)) throw new BadRequest(`Invalid identifier: ${ident}`);
  return `"${ident}"`;
}

class BadRequest extends Error {}

interface Filter {
  op: 'eq' | 'in';
  column: string;
  value: unknown;
}

interface QueryBody {
  table: string;
  action: 'select' | 'insert' | 'update' | 'upsert' | 'delete';
  select?: string;
  filters?: Filter[];
  order?: { column: string; ascending?: boolean }[];
  limit?: number;
  single?: boolean;
  maybeSingle?: boolean;
  count?: 'exact';
  head?: boolean;
  values?: unknown;
  onConflict?: string;
  returning?: boolean;
}

/** Split a select string on top-level commas (embeds contain nested commas). */
function splitSelect(select: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = '';
  for (const ch of select) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) {
      parts.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

interface ParsedSelect {
  columnSql: string[];
  innerEmbedChecks: string[]; // EXISTS-style conditions for !inner embeds
}

function parseSelect(table: string, select: string): ParsedSelect {
  const columnSql: string[] = [];
  const innerEmbedChecks: string[] = [];

  for (const part of splitSelect(select)) {
    const embedMatch = part.match(/^(?:([a-zA-Z_][a-zA-Z0-9_]*):)?([a-zA-Z_][a-zA-Z0-9_]*)(?:!([a-zA-Z_][a-zA-Z0-9_]*))?\(([^)]*)\)$/);
    if (embedMatch) {
      const [, aliasRaw, ref, hint, colsRaw] = embedMatch;
      const key = hint && hint !== 'inner' ? hint : ref;
      const embed = EMBEDS[table]?.[key];
      if (!embed) throw new BadRequest(`Unsupported embed '${part}' on table '${table}'`);
      const alias = aliasRaw || ref;
      const cols = colsRaw
        .split(',')
        .map((c) => c.trim())
        .filter(Boolean)
        .map((c) => (c === '*' ? '*' : q(c)))
        .join(', ');
      const sub = `SELECT ${cols || '*'} FROM ${q(embed.table)} f WHERE f.${q(embed.foreign)} = t.${q(embed.local)}`;
      columnSql.push(`(SELECT row_to_json(sub) FROM (${sub}) sub) AS ${q(alias)}`);
      if (hint === 'inner') {
        innerEmbedChecks.push(
          `EXISTS (SELECT 1 FROM ${q(embed.table)} f WHERE f.${q(embed.foreign)} = t.${q(embed.local)})`
        );
      }
      continue;
    }
    if (part === '*') {
      columnSql.push('t.*');
    } else {
      columnSql.push(`t.${q(part)}`);
    }
  }

  return { columnSql, innerEmbedChecks };
}

function buildWhere(filters: Filter[], params: unknown[]): string[] {
  const clauses: string[] = [];
  for (const f of filters) {
    if (f.op === 'eq') {
      params.push(f.value);
      clauses.push(`t.${q(f.column)} = $${params.length}`);
    } else if (f.op === 'in') {
      if (!Array.isArray(f.value)) throw new BadRequest(`'in' filter for ${f.column} requires an array`);
      params.push(f.value);
      clauses.push(`t.${q(f.column)} = ANY($${params.length})`);
    } else {
      throw new BadRequest(`Unsupported filter op: ${(f as Filter).op}`);
    }
  }
  return clauses;
}

export const tablesRouter = Router();

tablesRouter.post('/query', async (req: AuthedRequest, res) => {
  const body = req.body as QueryBody;
  try {
    if (!body || typeof body.table !== 'string' || !TABLE_ALLOWLIST.has(body.table)) {
      throw new BadRequest(`Table '${body?.table}' is not accessible`);
    }
    const table = body.table;
    const filters = body.filters ?? [];
    const params: unknown[] = [];

    let sql: string;
    let countSql: string | null = null;
    const countParams: unknown[] = [];

    switch (body.action) {
      case 'select': {
        const { columnSql, innerEmbedChecks } = parseSelect(table, body.select || '*');
        const where = [...buildWhere(filters, params), ...innerEmbedChecks];
        sql = `SELECT ${columnSql.join(', ')} FROM ${q(table)} t`;
        if (where.length) sql += ` WHERE ${where.join(' AND ')}`;
        if (body.order?.length) {
          const orderSql = body.order
            .map((o) => `t.${q(o.column)} ${o.ascending === false ? 'DESC' : 'ASC'}`)
            .join(', ');
          sql += ` ORDER BY ${orderSql}`;
        }
        if (typeof body.limit === 'number') sql += ` LIMIT ${Math.floor(body.limit)}`;

        if (body.count === 'exact') {
          const countWhere = buildWhere(filters, countParams);
          countSql = `SELECT COUNT(*)::int AS count FROM ${q(table)} t`;
          if (countWhere.length) countSql += ` WHERE ${countWhere.join(' AND ')}`;
        }
        break;
      }
      case 'insert':
      case 'upsert': {
        const rows = Array.isArray(body.values) ? body.values : [body.values];
        if (rows.length === 0 || rows.some((r) => typeof r !== 'object' || r === null)) {
          throw new BadRequest('insert requires row object(s)');
        }
        const columns = Object.keys(rows[0] as Record<string, unknown>);
        if (columns.length === 0) throw new BadRequest('insert requires at least one column');
        const valuesSql = rows
          .map(
            (row) =>
              `(${columns
                .map((c) => {
                  params.push((row as Record<string, unknown>)[c] ?? null);
                  return `$${params.length}`;
                })
                .join(', ')})`
          )
          .join(', ');
        sql = `INSERT INTO ${q(table)} (${columns.map(q).join(', ')}) VALUES ${valuesSql}`;
        if (body.action === 'upsert') {
          const conflictCols = (body.onConflict || '')
            .split(',')
            .map((c) => c.trim())
            .filter(Boolean);
          if (conflictCols.length === 0) throw new BadRequest('upsert requires onConflict columns');
          const updates = columns
            .filter((c) => !conflictCols.includes(c))
            .map((c) => `${q(c)} = EXCLUDED.${q(c)}`)
            .join(', ');
          sql += ` ON CONFLICT (${conflictCols.map(q).join(', ')}) ${updates ? `DO UPDATE SET ${updates}` : 'DO NOTHING'}`;
        }
        if (body.returning) sql += ' RETURNING *';
        break;
      }
      case 'update': {
        const values = body.values as Record<string, unknown>;
        if (typeof values !== 'object' || values === null || Object.keys(values).length === 0) {
          throw new BadRequest('update requires a values object');
        }
        const sets = Object.keys(values).map((c) => {
          params.push(values[c] ?? null);
          return `${q(c)} = $${params.length}`;
        });
        const where = buildWhere(filters, params);
        if (where.length === 0) throw new BadRequest('update requires at least one filter');
        sql = `UPDATE ${q(table)} t SET ${sets.join(', ')} WHERE ${where.join(' AND ')}`;
        if (body.returning) sql += ' RETURNING *';
        break;
      }
      case 'delete': {
        const where = buildWhere(filters, params);
        if (where.length === 0) throw new BadRequest('delete requires at least one filter');
        sql = `DELETE FROM ${q(table)} t WHERE ${where.join(' AND ')}`;
        if (body.returning) sql += ' RETURNING *';
        break;
      }
      default:
        throw new BadRequest(`Unsupported action: ${body.action}`);
    }

    const { data, count } = await runAsUser(req.userId ?? null, async (client) => {
      const result = body.head && countSql ? null : await client.query(sql, params);
      let cnt: number | null = null;
      if (countSql) {
        const countResult = await client.query(countSql, countParams);
        cnt = countResult.rows[0].count;
      }
      return { data: result?.rows ?? null, count: cnt };
    });

    let payload: unknown = data;
    if (body.single || body.maybeSingle) {
      if (data && data.length > 1) {
        res.status(400).json({
          error: { message: 'JSON object requested, multiple (or no) rows returned', code: 'PGRST116' },
        });
        return;
      }
      payload = data?.[0] ?? null;
      if (body.single && payload === null) {
        res.status(406).json({
          error: { message: 'JSON object requested, multiple (or no) rows returned', code: 'PGRST116' },
        });
        return;
      }
    }

    res.json({ data: payload, count });
  } catch (err) {
    if (err instanceof BadRequest) {
      res.status(400).json({ error: { message: err.message } });
      return;
    }
    const e = err as { message?: string; code?: string };
    res.status(400).json({ error: { message: e.message ?? 'Query failed', code: e.code } });
  }
});
