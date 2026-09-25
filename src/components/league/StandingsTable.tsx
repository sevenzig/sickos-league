import React, { useState, useEffect } from 'react';
import { MultiLeagueApi, type LeagueMatchup } from '../../utils/multiLeagueApi';
import FantasyTeamAvatar from './FantasyTeamAvatar';
import FantasyTeamRosterModal from './FantasyTeamRosterModal';
import { Panel } from '@/components/ui/panel';
import { Badge } from '@/components/ui/badge';

interface Standing {
  rank: number;
  fantasy_team_id: string;
  team_name: string;
  manager_email?: string;
  wins: number;
  losses: number;
  ties: number;
  points_for: number;
  points_against: number;
  win_percentage: number;
  logo_url?: string | null;
  streak: string;
}

interface StandingsTableProps {
  leagueId: string;
}

/** Current W/L/T streak from completed matchups, ordered by week ascending. */
function streakFromMatchups(
  teamId: string,
  matchups: LeagueMatchup[]
): string {
  const results: Array<'W' | 'L' | 'T'> = [];
  const completed = matchups
    .filter((m) => !m.is_playoff && m.is_complete && m.team1_score != null && m.team2_score != null)
    .sort((a, b) => a.week - b.week);

  for (const m of completed) {
    const isTeam1 = m.fantasy_team1_id === teamId;
    const isTeam2 = m.fantasy_team2_id === teamId;
    if (!isTeam1 && !isTeam2) continue;
    const mine = Number(isTeam1 ? m.team1_score : m.team2_score);
    const theirs = Number(isTeam1 ? m.team2_score : m.team1_score);
    results.push(mine === theirs ? 'T' : mine > theirs ? 'W' : 'L');
  }

  if (results.length === 0) return '—';
  const last = results[results.length - 1];
  let n = 0;
  for (let i = results.length - 1; i >= 0; i--) {
    if (results[i] !== last) break;
    n++;
  }
  return `${last}${n}`;
}

const StandingsTable: React.FC<StandingsTableProps> = ({ leagueId }) => {
  const [standings, setStandings] = useState<Standing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rosterTeam, setRosterTeam] = useState<Standing | null>(null);

  useEffect(() => {
    loadStandings();
  }, [leagueId]);

  const loadStandings = async () => {
    try {
      setLoading(true);
      setError(null);
      const fullId = await MultiLeagueApi.resolveLeagueId(leagueId);
      const [data, schedule] = await Promise.all([
        MultiLeagueApi.getLeagueStandings(fullId),
        MultiLeagueApi.getLeagueSchedule(fullId).catch(() => [] as LeagueMatchup[]),
      ]);
      setStandings(
        data.map((row: Omit<Standing, 'streak'>) => ({
          ...row,
          streak: streakFromMatchups(row.fantasy_team_id, schedule),
        }))
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load standings');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Panel padding="default">
        <h3 className="text-heading text-slate-50 mb-4">Standings</h3>
        <div className="animate-pulse space-y-2">
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} className="bg-slate-700 rounded-md h-12" />
          ))}
        </div>
      </Panel>
    );
  }

  if (error) {
    return (
      <Panel padding="default">
        <h3 className="text-heading text-slate-50 mb-4">Standings</h3>
        <div className="bg-red-900/20 border border-red-700 rounded-md p-3">
          <p className="text-red-400 text-label">{error}</p>
        </div>
      </Panel>
    );
  }

  if (standings.length === 0) {
    return (
      <Panel padding="default">
        <h3 className="text-heading text-slate-50 mb-4">Standings</h3>
        <div className="text-center py-6">
          <p className="text-slate-400 text-body">No standings data yet</p>
          <p className="text-slate-400 text-label mt-1">
            Standings will appear after games are played
          </p>
        </div>
      </Panel>
    );
  }

  return (
    <Panel padding="default">
      <h3 className="text-heading text-slate-50 mb-4">Standings</h3>

      <div className="overflow-x-auto">
        <table className="w-full table-fixed min-w-[32rem]">
          <colgroup>
            <col className="w-12" />
            <col />
            <col className="w-[4.5rem]" />
            <col className="w-14" />
            <col className="w-14" />
            <col className="w-14" />
          </colgroup>
          <thead>
            <tr className="border-b border-slate-600">
              <th className="text-left py-2 pr-2 text-slate-400 text-caption uppercase tracking-wide">#</th>
              <th className="text-left py-2 pr-2 text-slate-400 text-caption uppercase tracking-wide">Team</th>
              <th className="text-center py-2 px-1 text-slate-400 text-caption uppercase tracking-wide">W-L-T</th>
              <th className="text-right py-2 px-1 text-slate-400 text-caption uppercase tracking-wide">PF</th>
              <th className="text-right py-2 px-1 text-slate-400 text-caption uppercase tracking-wide">%</th>
              <th className="text-right py-2 pl-1 text-slate-400 text-caption uppercase tracking-wide">Streak</th>
            </tr>
          </thead>
          <tbody>
            {standings.map((team) => (
              <tr
                key={team.fantasy_team_id || team.rank}
                className="border-b border-slate-700/50 last:border-b-0"
              >
                <td className="py-3 pr-2">
                  <Badge
                    variant={
                      team.rank === 1 ? 'warning' : team.rank <= 4 ? 'success' : 'default'
                    }
                    className="justify-center w-6 h-6 p-0 font-bold"
                  >
                    {team.rank}
                  </Badge>
                </td>
                <td className="py-3 pr-2 min-w-0">
                  <button
                    type="button"
                    onClick={() => setRosterTeam(team)}
                    className="flex items-center gap-2 min-w-0 w-full text-left rounded-md hover:bg-slate-700/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background transition-colors"
                    aria-label={`View ${team.team_name} roster`}
                  >
                    <FantasyTeamAvatar teamName={team.team_name} logoUrl={team.logo_url} size="sm" />
                    <div className="min-w-0">
                      <div className="text-white font-medium text-label truncate">
                        {team.team_name}
                      </div>
                      {team.manager_email && (
                        <div className="text-slate-400 text-caption truncate">
                          {team.manager_email.split('@')[0]}
                        </div>
                      )}
                    </div>
                  </button>
                </td>
                <td className="py-3 px-1 text-center">
                  <span className="text-slate-300 text-label font-mono tabular-nums">
                    {team.wins}-{team.losses}-{team.ties}
                  </span>
                </td>
                <td className="py-3 px-1 text-right">
                  <span className="text-slate-300 text-label font-mono tabular-nums">
                    {Number(team.points_for || 0).toFixed(0)}
                  </span>
                </td>
                <td className="py-3 px-1 text-right">
                  <span className="text-slate-300 text-label font-mono tabular-nums">
                    {(Number(team.win_percentage || 0) * 100).toFixed(0)}
                  </span>
                </td>
                <td className="py-3 pl-1 text-right">
                  <span className={`text-label font-mono tabular-nums ${
                    team.streak.startsWith('W')
                      ? 'text-green-400'
                      : team.streak.startsWith('L')
                      ? 'text-red-400'
                      : 'text-slate-400'
                  }`}>
                    {team.streak}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <FantasyTeamRosterModal
        isOpen={Boolean(rosterTeam)}
        onClose={() => setRosterTeam(null)}
        fantasyTeamId={rosterTeam?.fantasy_team_id ?? null}
        teamName={rosterTeam?.team_name ?? ''}
        logoUrl={rosterTeam?.logo_url}
      />
    </Panel>
  );
};

export default StandingsTable;
