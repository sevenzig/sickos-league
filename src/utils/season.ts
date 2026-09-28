/** Default regular season length. Per-league value may be 14, 15, or 16. */
export const REGULAR_SEASON_WEEKS = 14;

export type RegularSeasonWeeks = 14 | 15 | 16;
export type PlayoffTeams = 4 | 5 | 6;
export type StandingsTiebreaker = 'record_then_points' | 'points_then_record';

/** Championship week: RS+2 for 4-team, RS+3 for 5/6. Never past NFL week 18. */
export function seasonMaxWeek(
  regularSeasonWeeks: number | null | undefined,
  playoffTeams: number | null | undefined,
  hasPlayoffMatchups: boolean
): number {
  const rs = regularSeasonWeeks ?? REGULAR_SEASON_WEEKS;
  if (!hasPlayoffMatchups) return rs;
  const champ = playoffTeams === 4 ? rs + 2 : rs + 3;
  return Math.min(champ, 18);
}

export function playoffEndWeek(
  regularSeasonWeeks: number,
  playoffTeams: PlayoffTeams
): number {
  return playoffTeams === 4 ? regularSeasonWeeks + 2 : regularSeasonWeeks + 3;
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
