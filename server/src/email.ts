import { Resend } from 'resend';
import cron from 'node-cron';
import { adminPool } from './db.js';

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const EMAIL_FROM = process.env.EMAIL_FROM || 'BQBL <noreply@example.com>';
const APP_BASE_URL = (process.env.APP_BASE_URL || 'http://localhost:5173').replace(/\/$/, '');
const POLL_MS = Number(process.env.EMAIL_POLL_MS || 30_000);

const resend = RESEND_API_KEY ? new Resend(RESEND_API_KEY) : null;

interface OutboxRow {
  id: string;
  recipient_user_id: string | null;
  recipient_email: string | null;
  template: string;
  payload: Record<string, unknown>;
}

function renderTemplate(template: string, payload: Record<string, unknown>): { subject: string; html: string } {
  const leagueName = String(payload.league_name ?? 'your league');
  const leagueId = String(payload.league_id ?? '');
  const code = String(payload.code ?? '');
  const pick = payload.pick_number;
  const week = payload.week;

  switch (template) {
    case 'draft_turn':
      return {
        subject: `You're on the clock in ${leagueName}`,
        html: `<p>It's your turn to pick in <strong>${leagueName}</strong>${pick ? ` (pick #${pick})` : ''}.</p>
<p><a href="${APP_BASE_URL}/leagues/${leagueId}/draft">Make your pick</a></p>`,
      };
    case 'invite':
      return {
        subject: `Invite code for ${leagueName}`,
        html: `<p>Your invite code for <strong>${leagueName}</strong> is ready.</p>
<p>Code: <strong>${code}</strong></p>
<p>Share this link: <a href="${APP_BASE_URL}/invite/${code}">${APP_BASE_URL}/invite/${code}</a></p>`,
      };
    case 'lineup_reminder':
      return {
        subject: `Set your lineup for week ${week} — ${leagueName}`,
        html: `<p>You haven't set a lineup yet for week ${week} in <strong>${leagueName}</strong>.</p>
<p><a href="${APP_BASE_URL}/leagues/${leagueId}/lineups">Set your lineup</a></p>`,
      };
    default:
      return {
        subject: 'BQBL notification',
        html: `<pre>${JSON.stringify(payload, null, 2)}</pre>`,
      };
  }
}

async function resolveEmail(row: OutboxRow): Promise<string | null> {
  if (row.recipient_email) return row.recipient_email;
  if (!row.recipient_user_id) return null;
  const { rows } = await adminPool.query('SELECT email FROM auth.users WHERE id = $1', [
    row.recipient_user_id,
  ]);
  return rows[0]?.email ?? null;
}

async function sendOne(row: OutboxRow): Promise<void> {
  const to = await resolveEmail(row);
  if (!to) {
    await adminPool.query(
      `UPDATE email_outbox SET last_error = $2, sent_at = NOW() WHERE id = $1`,
      [row.id, 'No recipient email']
    );
    return;
  }

  const { subject, html } = renderTemplate(row.template, row.payload ?? {});

  if (!resend) {
    console.log(`[email] dry-run → ${to}: ${subject}`);
    await adminPool.query(`UPDATE email_outbox SET sent_at = NOW(), last_error = NULL WHERE id = $1`, [
      row.id,
    ]);
    return;
  }

  const { error } = await resend.emails.send({
    from: EMAIL_FROM,
    to,
    subject,
    html,
  });

  if (error) {
    await adminPool.query(`UPDATE email_outbox SET last_error = $2 WHERE id = $1`, [
      row.id,
      error.message || String(error),
    ]);
    console.error(`[email] send failed for ${row.id}:`, error);
    return;
  }

  await adminPool.query(`UPDATE email_outbox SET sent_at = NOW(), last_error = NULL WHERE id = $1`, [
    row.id,
  ]);
}

export async function processEmailOutbox(limit = 20): Promise<number> {
  const { rows } = await adminPool.query(
    `SELECT id, recipient_user_id, recipient_email, template, payload
     FROM email_outbox
     WHERE sent_at IS NULL
     ORDER BY created_at ASC
     LIMIT $1`,
    [limit]
  );

  for (const row of rows as OutboxRow[]) {
    await sendOne(row);
  }
  return rows.length;
}

async function queueLineupReminders(): Promise<void> {
  // Best-effort: remind for the earliest unlocked week across leagues this season
  const { rows } = await adminPool.query(
    `SELECT COALESCE(MIN(w.week_number), 1) AS week
     FROM weeks w
     JOIN leagues l ON l.id = w.league_id
     WHERE NOT w.is_locked AND l.season = EXTRACT(YEAR FROM NOW())::int`
  );
  const week = Number(rows[0]?.week || 1);
  const season = new Date().getFullYear();
  const { rows: result } = await adminPool.query(
    `SELECT enqueue_lineup_reminders($1, $2) AS queued`,
    [week, season]
  );
  console.log(`[email] queued ${result[0]?.queued ?? 0} lineup reminder(s) for week ${week}`);
}

async function tickLiveDrafts(): Promise<void> {
  const { rows } = await adminPool.query(`SELECT draft_tick_all() AS n`);
  const n = Number(rows[0]?.n || 0);
  if (n > 0) {
    console.log(`[draft] tick advanced ${n} draft action(s)`);
  }
}

export function startEmailWorkers(): void {
  setInterval(() => {
    processEmailOutbox().catch((err) => console.error('[email] poller error:', err));
  }, POLL_MS);

  // Live draft autostart + pick timeouts (even if nobody is polling the room)
  setInterval(() => {
    tickLiveDrafts().catch((err) => console.error('[draft] tick error:', err));
  }, 5000);

  // Thursdays 10:00 America/New_York — lineup reminders before weekend games
  cron.schedule(
    '0 10 * * 4',
    () => {
      queueLineupReminders().catch((err) => console.error('[email] reminder cron error:', err));
    },
    { timezone: 'America/New_York' }
  );

  console.log(
    `[email] workers started (poll every ${POLL_MS}ms; Resend ${resend ? 'enabled' : 'dry-run'}; draft tick every 5s)`
  );
}
