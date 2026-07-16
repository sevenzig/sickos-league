import React, { useState, useEffect } from 'react';
import TeamLogo from '../TeamLogo';
import { MultiLeagueApi } from '../../utils/multiLeagueApi';

interface StandingTeam {
  rank: number;
  team_name: string;
  wins: number;
  losses: number;
  ties: number;
  points_for: number;
  points_against: number;
}

interface LeagueStandingsProps {
  leagueId: string;
  teams: string[];
}

const LeagueStandings: React.FC<LeagueStandingsProps> = ({ leagueId, teams }) => {
  const [standings, setStandings] = useState<StandingTeam[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadStandings = async () => {
      try {
        setLoading(true);
        const standingsData = await MultiLeagueApi.getLeagueStandings(leagueId);
        setStandings(standingsData);
      } catch (error) {
        console.error('Error loading standings:', error);
        // Fall back to showing teams with empty stats
        const fallbackStandings = teams.map((team, index) => ({
          rank: index + 1,
          team_name: team,
          wins: 0,
          losses: 0,
          ties: 0,
          points_for: 0,
          points_against: 0
        }));
        setStandings(fallbackStandings);
      } finally {
        setLoading(false);
      }
    };

    if (leagueId && teams.length > 0) {
      loadStandings();
    }
  }, [leagueId, teams]);
  return (
    <div className="space-y-6">
      <h3 className="text-xl font-black text-slate-50 tracking-tight">League Standings</h3>
      <div className="bg-gradient-to-br from-slate-800/90 to-slate-900/90 backdrop-blur-xl rounded-2xl border border-slate-700/50 shadow-[0_10px_30px_-10px_rgba(0,0,0,0.4)] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gradient-to-r from-slate-800 to-slate-800/80">
              <tr>
                <th className="px-4 py-4 text-left text-xs font-bold text-slate-400 uppercase tracking-wider">Rank</th>
                <th className="px-4 py-4 text-left text-xs font-bold text-slate-400 uppercase tracking-wider">Team</th>
                <th className="px-4 py-4 text-left text-xs font-bold text-slate-400 uppercase tracking-wider">Record</th>
                <th className="px-4 py-4 text-left text-xs font-bold text-slate-400 uppercase tracking-wider">Points</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/30">
              {loading ? (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center">
                    <div className="flex flex-col items-center gap-2">
                      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500"></div>
                      <p className="text-slate-400 text-sm">Loading standings...</p>
                    </div>
                  </td>
                </tr>
              ) : standings.length > 0 ? (
                standings.map((standing, index) => (
                  <tr key={standing.team_name} className={`hover:bg-slate-700/20 transition-colors duration-150 ${
                    index % 2 === 0 ? 'bg-slate-800/20' : 'bg-slate-800/40'
                  }`}>
                    <td className="px-4 py-4 text-sm font-bold text-slate-200 tabular-nums">{standing.rank}</td>
                    <td className="px-4 py-4 text-sm font-medium text-slate-200">
                      <TeamLogo teamName={standing.team_name} size="sm" showName={true} />
                    </td>
                    <td className="px-4 py-4 text-sm text-slate-300 tabular-nums">
                      {standing.wins}-{standing.losses}{standing.ties > 0 ? `-${standing.ties}` : ''}
                    </td>
                    <td className="px-4 py-4 text-sm font-bold text-emerald-400 tabular-nums">
                      {standing.points_for || 0}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-slate-400">
                    No standings data available
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default LeagueStandings;