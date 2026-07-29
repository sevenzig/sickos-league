import { useMemo } from 'react';
import type { LeagueMatchup } from '../utils/multiLeagueApi';

export interface MatchupScoreEntry {
  team1Score: number;
  team2Score: number;
  team1Breakdown: Array<{ qb: string; breakdown: any }>;
  team2Breakdown: Array<{ qb: string; breakdown: any }>;
}

export type MatchupScoresMap = Record<string, MatchupScoreEntry>;

/** Key used by MatchupCard / modal lookup. */
export function matchupScoreKey(team1: string, team2: string, week: number): string {
  return `${team1}-${team2}-${week}`;
}

/**
 * Scores + per-QB breakdowns for a week.
 * Lineups only reveal once the week is locked; persisted scores win when finalized.
 */
export function computeMatchupScores(
  schedule: LeagueMatchup[],
  week: number,
  weekStats: any[],
  lineupNamesFor: (fantasyTeamId: string, week: number) => string[]
): MatchupScoresMap {
  const scores: MatchupScoresMap = {};
  const perfByTeam: Record<string, any> = {};
  weekStats.forEach(p => {
    perfByTeam[p.team] = p;
  });

  schedule
    .filter(m => m.week === week)
    .forEach(m => {
      const key = matchupScoreKey(m.fantasy_team1_name, m.fantasy_team2_name, m.week);
      const locked = m.week_locked;

      const team1Names = locked ? lineupNamesFor(m.fantasy_team1_id, m.week) : [];
      const team2Names = locked ? lineupNamesFor(m.fantasy_team2_id, m.week) : [];

      const team1Breakdown = team1Names.map(name => ({ qb: name, breakdown: perfByTeam[name] ?? null }));
      const team2Breakdown = team2Names.map(name => ({ qb: name, breakdown: perfByTeam[name] ?? null }));

      const liveSum = (breakdown: { breakdown: any }[]) =>
        breakdown.reduce((sum, b) => sum + (b.breakdown?.finalScore ?? 0), 0);

      scores[key] = {
        team1Score: m.is_complete && m.team1_score != null ? Number(m.team1_score) : liveSum(team1Breakdown),
        team2Score: m.is_complete && m.team2_score != null ? Number(m.team2_score) : liveSum(team2Breakdown),
        team1Breakdown,
        team2Breakdown,
      };
    });

  return scores;
}

export function useMatchupScores(
  schedule: LeagueMatchup[],
  week: number,
  weekStats: any[],
  lineupNamesFor: (fantasyTeamId: string, week: number) => string[]
): MatchupScoresMap {
  return useMemo(
    () => computeMatchupScores(schedule, week, weekStats, lineupNamesFor),
    [schedule, week, weekStats, lineupNamesFor]
  );
}
