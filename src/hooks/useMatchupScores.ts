import { useMemo } from 'react';
import { computeBqblScore } from '../utils/scoring';
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

function qbFinal(breakdown: any): number {
  if (!breakdown) return 0;
  // Prefer live BQBL recompute so cards match modal chips; falls back to stored ZFinal.
  return computeBqblScore(breakdown).total;
}

/**
 * Scores + per-QB breakdowns for a week.
 * Saved starters show as soon as a lineup exists; persisted scores win when finalized.
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

      const team1Names = lineupNamesFor(m.fantasy_team1_id, m.week);
      const team2Names = lineupNamesFor(m.fantasy_team2_id, m.week);

      const team1Breakdown = team1Names.map(name => ({ qb: name, breakdown: perfByTeam[name] ?? null }));
      const team2Breakdown = team2Names.map(name => ({ qb: name, breakdown: perfByTeam[name] ?? null }));

      const liveSum = (breakdown: { breakdown: any }[]) =>
        breakdown.reduce((sum, b) => sum + qbFinal(b.breakdown), 0);

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
