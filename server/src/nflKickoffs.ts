/**
 * ESPN → matchups.game_time kickoff sync (prod weekly ops).
 *
 * Boot: if no kickoffs exist, seed weeks 1–18; else ensure current week N..N+2.
 * Cron: Wed 21:00 America/New_York re-sync N..N+2 (flex window).
 *
 * Disable with NFL_KICKOFF_SYNC=0. Season year: NFL_SEASON_YEAR (default 2026).
 * Upsert reuses upsert_nfl_kickoff_times as the first platform admin user.
 */
import cron from 'node-cron';
import { adminPool, runAsUser } from './db.js';

const SEASON_YEAR = Number(process.env.NFL_SEASON_YEAR || 2026);

// Keep in sync with teamNameMap in src/utils/csvParser.ts / scripts/sync-nfl-kickoffs-espn.mjs
const teamNameMap: Record<string, string> = {
  CAR: 'Carolina',
  JAX: 'Jacksonville',
  CIN: 'Cincinnati',
  CLE: 'Cleveland',
  MIA: 'Miami',
  IND: 'Indianapolis',
  LV: 'Las Vegas',
  NE: 'New England',
  HOU: 'Houston',
  LAR: 'LA Rams',
  TB: 'Tampa Bay',
  ATL: 'Atlanta',
  PIT: 'Pittsburgh',
  NYJ: 'NY Jets',
  TEN: 'Tennessee',
  DEN: 'Denver',
  ARI: 'Arizona',
  NO: 'New Orleans',
  NYG: 'NY Giants',
  WSH: 'Washington',
  BAL: 'Baltimore',
  BUF: 'Buffalo',
  DET: 'Detroit',
  GB: 'Green Bay',
  SF: 'San Francisco',
  SEA: 'Seattle',
  MIN: 'Minnesota',
  CHI: 'Chicago',
  KC: 'Kansas City',
  LAC: 'LA Chargers',
  DAL: 'Dallas',
  PHI: 'Philadelphia',
};

function mapAbbr(abbr: string): string {
  const name = teamNameMap[abbr];
  if (!name) throw new Error(`Unknown ESPN abbreviation: ${abbr}`);
  return name;
}

interface EspnGame {
  team1: string;
  team2: string;
  game_time: string;
}

async function fetchEspnWeek(seasonYear: number, week: number): Promise<EspnGame[]> {
  const url =
    `https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard` +
    `?dates=${seasonYear}&seasontype=2&week=${week}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`ESPN HTTP ${res.status} for week ${week}`);
  const data = (await res.json()) as {
    events?: Array<{
      id?: string;
      date?: string;
      competitions?: Array<{
        competitors?: Array<{
          homeAway?: string;
          team?: { abbreviation?: string };
        }>;
      }>;
    }>;
  };

  const games: EspnGame[] = [];
  for (const event of data.events || []) {
    const comps = event.competitions?.[0]?.competitors;
    if (!comps || comps.length < 2) {
      throw new Error(`Event ${event.id} missing competitors for week ${week}`);
    }
    const home = comps.find((c) => c.homeAway === 'home') || comps[0];
    const away = comps.find((c) => c.homeAway === 'away') || comps[1];
    const abbr1 = away.team?.abbreviation;
    const abbr2 = home.team?.abbreviation;
    if (!abbr1 || !abbr2) throw new Error(`Event ${event.id} missing team abbreviations`);
    if (!event.date) throw new Error(`Event ${event.id} missing date`);
    games.push({
      team1: mapAbbr(abbr1),
      team2: mapAbbr(abbr2),
      game_time: event.date,
    });
  }
  return games;
}

/** Current NFL week from ESPN scoreboard (regular season). Falls back to 1. */
async function fetchEspnCurrentWeek(seasonYear: number): Promise<number> {
  const url =
    `https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard` +
    `?dates=${seasonYear}&seasontype=2`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`ESPN HTTP ${res.status} for current week`);
  const data = (await res.json()) as { week?: { number?: number } };
  const n = Number(data.week?.number);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(18, Math.floor(n));
}

async function platformAdminId(): Promise<string | null> {
  const { rows } = await adminPool.query(
    `SELECT id::text AS id
     FROM auth.users
     WHERE is_platform_admin = true
     ORDER BY created_at ASC
     LIMIT 1`
  );
  return rows[0]?.id ?? null;
}

async function upsertWeek(adminId: string, week: number, games: EspnGame[]): Promise<number> {
  const written = await runAsUser(adminId, async (client) => {
    const { rows } = await client.query(
      `SELECT upsert_nfl_kickoff_times($1, $2::jsonb) AS n`,
      [week, JSON.stringify(games)]
    );
    return Number(rows[0]?.n ?? 0);
  });
  return written;
}

async function syncWeeks(weeks: number[]): Promise<void> {
  const adminId = await platformAdminId();
  if (!adminId) {
    console.error(
      '[nfl-kickoffs] no platform admin user — cannot upsert. Grant is_platform_admin then restart api.'
    );
    return;
  }

  for (const week of weeks) {
    try {
      const games = await fetchEspnWeek(SEASON_YEAR, week);
      if (games.length === 0) {
        console.warn(`[nfl-kickoffs] week ${week}: zero ESPN events — skip`);
        continue;
      }
      const n = await upsertWeek(adminId, week, games);
      console.log(
        `[nfl-kickoffs] week ${week}: upserted ${n} row(s) (${games.length} games, season ${SEASON_YEAR})`
      );
    } catch (err) {
      console.error(
        `[nfl-kickoffs] week ${week} failed:`,
        err instanceof Error ? err.message : err
      );
    }
  }
}

async function kickoffRowCount(): Promise<number> {
  const { rows } = await adminPool.query(
    `SELECT COUNT(*)::int AS n FROM matchups WHERE game_time IS NOT NULL`
  );
  return Number(rows[0]?.n ?? 0);
}

async function syncOnBoot(): Promise<void> {
  const existing = await kickoffRowCount();
  if (existing === 0) {
    console.log('[nfl-kickoffs] matchups empty — seeding weeks 1–18');
    await syncWeeks(Array.from({ length: 18 }, (_, i) => i + 1));
    return;
  }

  const current = await fetchEspnCurrentWeek(SEASON_YEAR);
  const weeks = [current, current + 1, current + 2].filter((w) => w >= 1 && w <= 18);
  console.log(`[nfl-kickoffs] boot re-sync weeks ${weeks.join(',')}`);
  await syncWeeks(weeks);
}

async function syncFlexWindow(): Promise<void> {
  const current = await fetchEspnCurrentWeek(SEASON_YEAR);
  const weeks = [current, current + 1, current + 2].filter((w) => w >= 1 && w <= 18);
  console.log(`[nfl-kickoffs] Wednesday flex sync weeks ${weeks.join(',')}`);
  await syncWeeks(weeks);
}

export function startNflKickoffSync(): void {
  if (process.env.NFL_KICKOFF_SYNC === '0') {
    console.log('[nfl-kickoffs] disabled (NFL_KICKOFF_SYNC=0)');
    return;
  }

  // Defer so listen() can succeed first; empty prod needs a full seed ASAP.
  setTimeout(() => {
    syncOnBoot().catch((err) =>
      console.error('[nfl-kickoffs] boot sync error:', err instanceof Error ? err.message : err)
    );
  }, 3_000);

  // Wednesday 21:00 America/New_York — ops N..N+2 flex window
  cron.schedule(
    '0 21 * * 3',
    () => {
      syncFlexWindow().catch((err) =>
        console.error('[nfl-kickoffs] cron error:', err instanceof Error ? err.message : err)
      );
    },
    { timezone: 'America/New_York' }
  );

  console.log(
    `[nfl-kickoffs] workers started (season ${SEASON_YEAR}; boot seed + Wed 21:00 America/New_York)`
  );
}
