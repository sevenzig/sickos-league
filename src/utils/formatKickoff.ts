/** Default NFL broadcast timezone for kickoff labels. */
export const DEFAULT_TIMEZONE = 'America/New_York';

/** Curated IANA zones for profile select (all exist in pg_timezone_names). */
export const PROFILE_TIMEZONES: { value: string; label: string }[] = [
  { value: 'America/New_York', label: 'Eastern (ET)' },
  { value: 'America/Chicago', label: 'Central (CT)' },
  { value: 'America/Denver', label: 'Mountain (MT)' },
  { value: 'America/Phoenix', label: 'Arizona (no DST)' },
  { value: 'America/Los_Angeles', label: 'Pacific (PT)' },
  { value: 'America/Anchorage', label: 'Alaska (AKT)' },
  { value: 'Pacific/Honolulu', label: 'Hawaii (HT)' },
  { value: 'UTC', label: 'UTC' },
];

const MONTH_ABBR = [
  'Jan.', 'Feb.', 'Mar.', 'Apr.', 'May', 'June',
  'July', 'Aug.', 'Sept.', 'Oct.', 'Nov.', 'Dec.',
] as const;

/**
 * Format a TIMESTAMPTZ ISO string in the given IANA zone.
 * Example: "1 pm Sunday, Sept. 28"
 */
export function formatKickoff(iso: string, timeZone: string = DEFAULT_TIMEZONE): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';

  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'long',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).formatToParts(d);

  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? '';

  const weekday = get('weekday');
  const monthNum = Number(get('month'));
  const day = get('day');
  let hour = get('hour');
  const minute = get('minute');
  const dayPeriod = get('dayPeriod').toLowerCase();

  const month = MONTH_ABBR[monthNum - 1] ?? get('month');
  const time =
    minute === '00' || minute === '0'
      ? `${hour} ${dayPeriod}`
      : `${hour}:${minute} ${dayPeriod}`;

  return `${time} ${weekday}, ${month} ${day}`;
}

export function timezoneLabel(value: string): string {
  return PROFILE_TIMEZONES.find((z) => z.value === value)?.label ?? value;
}
