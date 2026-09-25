/** Regular season is always 14 weeks. Playoffs end week 16 (4 teams) or 17. */
export const REGULAR_SEASON_WEEKS = 14;

export type PlayoffTeams = 4 | 5 | 6 | 8;
export type StandingsTiebreaker = 'record_then_points' | 'points_then_record';

export function seasonMaxWeek(
  playoffTeams: number | null | undefined,
  hasPlayoffMatchups: boolean
): number {
  if (!hasPlayoffMatchups) return REGULAR_SEASON_WEEKS;
  return playoffTeams === 4 ? 16 : 17;
}

export function compareStandings(
  a: { wins: number; totalPoints: number; teamName?: string },
  b: { wins: number; totalPoints: number; teamName?: string },
  tiebreaker: StandingsTiebreaker = 'record_then_points'
): number {
  if (tiebreaker === 'points_then_record') {
    if (a.totalPoints !== b.totalPoints) return b.totalPoints - a.totalPoints;
    if (a.wins !== b.wins) return b.wins - a.wins;
  } else {
    if (a.wins !== b.wins) return b.wins - a.wins;
    if (a.totalPoints !== b.totalPoints) return b.totalPoints - a.totalPoints;
  }
  return (a.teamName || '').localeCompare(b.teamName || '');
}
