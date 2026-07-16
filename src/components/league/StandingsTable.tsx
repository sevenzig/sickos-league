import React, { useState, useEffect } from 'react';
import { MultiLeagueApi } from '../../utils/multiLeagueApi';

interface Standing {
  rank: number;
  team_name: string;
  manager_email?: string;
  wins: number;
  losses: number;
  ties: number;
  points_for: number;
  points_against: number;
  win_percentage: number;
}

interface StandingsTableProps {
  leagueId: string;
}

const StandingsTable: React.FC<StandingsTableProps> = ({ leagueId }) => {
  const [standings, setStandings] = useState<Standing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadStandings();
  }, [leagueId]);

  const loadStandings = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await MultiLeagueApi.getLeagueStandings(leagueId);
      setStandings(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load standings');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-slate-800 rounded-lg border border-slate-700 p-6">
        <h3 className="text-lg font-medium text-white mb-4">Standings</h3>
        <div className="animate-pulse space-y-2">
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} className="bg-slate-700 rounded h-12"></div>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-slate-800 rounded-lg border border-slate-700 p-6">
        <h3 className="text-lg font-medium text-white mb-4">Standings</h3>
        <div className="bg-red-900/20 border border-red-700 rounded-lg p-3">
          <p className="text-red-400 text-sm">{error}</p>
        </div>
      </div>
    );
  }

  if (standings.length === 0) {
    return (
      <div className="bg-slate-800 rounded-lg border border-slate-700 p-6">
        <h3 className="text-lg font-medium text-white mb-4">Standings</h3>
        <div className="text-center py-6">
          <p className="text-slate-400">No standings data yet</p>
          <p className="text-slate-500 text-sm mt-1">
            Standings will appear after games are played
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-slate-800 rounded-lg border border-slate-700 p-6">
      <h3 className="text-lg font-medium text-white mb-4">Standings</h3>

      <div className="overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-slate-600">
              <th className="text-left py-2 text-slate-400 text-sm font-medium">Rank</th>
              <th className="text-left py-2 text-slate-400 text-sm font-medium">Team</th>
              <th className="text-center py-2 text-slate-400 text-sm font-medium">W-L-T</th>
              <th className="text-center py-2 text-slate-400 text-sm font-medium">%</th>
            </tr>
          </thead>
          <tbody>
            {standings.map((team) => (
              <tr key={team.rank} className="border-b border-slate-700/50 last:border-b-0">
                <td className="py-3">
                  <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold ${
                    team.rank === 1
                      ? 'bg-yellow-600 text-yellow-100'
                      : team.rank <= 4
                      ? 'bg-green-600 text-green-100'
                      : 'bg-slate-600 text-slate-300'
                  }`}>
                    {team.rank}
                  </span>
                </td>
                <td className="py-3">
                  <div>
                    <div className="text-white font-medium text-sm">
                      {team.team_name}
                    </div>
                    {team.manager_email && (
                      <div className="text-slate-400 text-xs">
                        {team.manager_email.split('@')[0]}
                      </div>
                    )}
                  </div>
                </td>
                <td className="py-3 text-center">
                  <span className="text-slate-300 text-sm font-mono">
                    {team.wins}-{team.losses}-{team.ties}
                  </span>
                </td>
                <td className="py-3 text-center">
                  <span className="text-slate-300 text-sm font-mono">
                    {(team.win_percentage * 100).toFixed(1)}%
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default StandingsTable;