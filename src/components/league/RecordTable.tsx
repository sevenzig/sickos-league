import React, { useState, useEffect } from 'react';
import { MultiLeagueApi } from '../../utils/multiLeagueApi';
import { Panel } from '@/components/ui';

interface TeamRecord {
  team_name: string;
  manager_email?: string;
  wins: number;
  losses: number;
  ties: number;
  points_for: number;
  points_against: number;
  point_differential: number;
  games_played: number;
}

interface RecordTableProps {
  leagueId: string;
}

const RecordTable: React.FC<RecordTableProps> = ({ leagueId }) => {
  const [records, setRecords] = useState<TeamRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<keyof TeamRecord>('wins');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  useEffect(() => {
    loadRecords();
  }, [leagueId]);

  const loadRecords = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await MultiLeagueApi.getLeagueStandings(leagueId);

      // Transform standings data to record format
      // pg NUMERIC arrives as string — coerce before math / toFixed
      const recordData: TeamRecord[] = data.map((team: any) => {
        const points_for = Number(team.points_for) || 0;
        const points_against = Number(team.points_against) || 0;
        const wins = Number(team.wins) || 0;
        const losses = Number(team.losses) || 0;
        const ties = Number(team.ties) || 0;
        return {
          team_name: team.team_name,
          manager_email: team.manager_email,
          wins,
          losses,
          ties,
          points_for,
          points_against,
          point_differential: points_for - points_against,
          games_played: wins + losses + ties,
        };
      });

      setRecords(recordData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load records');
    } finally {
      setLoading(false);
    }
  };

  const handleSort = (column: keyof TeamRecord) => {
    if (sortBy === column) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(column);
      setSortOrder('desc');
    }
  };

  const sortedRecords = React.useMemo(() => {
    return [...records].sort((a, b) => {
      const aVal = a[sortBy];
      const bVal = b[sortBy];

      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return sortOrder === 'asc' ? aVal - bVal : bVal - aVal;
      }

      const aStr = String(aVal).toLowerCase();
      const bStr = String(bVal).toLowerCase();
      return sortOrder === 'asc'
        ? aStr.localeCompare(bStr)
        : bStr.localeCompare(aStr);
    });
  }, [records, sortBy, sortOrder]);

  const SortButton: React.FC<{ column: keyof TeamRecord; children: React.ReactNode }> = ({ column, children }) => (
    <button
      onClick={() => handleSort(column)}
      className="flex items-center space-x-1 text-slate-400 hover:text-slate-300 transition-colors"
    >
      <span>{children}</span>
      {sortBy === column && (
        <span className="text-blue-400">
          {sortOrder === 'asc' ? '↑' : '↓'}
        </span>
      )}
    </button>
  );

  if (loading) {
    return (
      <Panel>
        <h3 className="text-heading text-slate-50 mb-4">Team Records</h3>
        <div className="animate-pulse space-y-2">
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} className="bg-slate-700 rounded h-10"></div>
          ))}
        </div>
      </Panel>
    );
  }

  if (error) {
    return (
      <Panel>
        <h3 className="text-heading text-slate-50 mb-4">Team Records</h3>
        <div className="bg-red-900/20 border border-red-700 rounded-lg p-3">
          <p className="text-red-400 text-sm">{error}</p>
        </div>
      </Panel>
    );
  }

  if (records.length === 0) {
    return (
      <Panel>
        <h3 className="text-heading text-slate-50 mb-4">Team Records</h3>
        <div className="text-center py-6">
          <p className="text-slate-400">No records data yet</p>
          <p className="text-slate-500 text-sm mt-1">
            Records will appear after games are played
          </p>
        </div>
      </Panel>
    );
  }

  return (
    <Panel>
      <h3 className="text-heading text-slate-50 mb-4">Team Records</h3>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-600">
              <th className="text-left py-2">
                <SortButton column="team_name">Team</SortButton>
              </th>
              <th className="text-center py-2">
                <SortButton column="wins">W</SortButton>
              </th>
              <th className="text-center py-2">
                <SortButton column="losses">L</SortButton>
              </th>
              <th className="text-center py-2">
                <SortButton column="ties">T</SortButton>
              </th>
              <th className="text-center py-2">
                <SortButton column="points_for">PF</SortButton>
              </th>
              <th className="text-center py-2">
                <SortButton column="points_against">PA</SortButton>
              </th>
              <th className="text-center py-2">
                <SortButton column="point_differential">+/-</SortButton>
              </th>
            </tr>
          </thead>
          <tbody>
            {sortedRecords.map((team) => (
              <tr key={team.team_name} className="border-b border-slate-700/50 last:border-b-0 hover:bg-slate-700/30">
                <td className="py-2">
                  <div>
                    <div className="text-white font-medium">
                      {team.team_name}
                    </div>
                    {team.manager_email && (
                      <div className="text-slate-400 text-xs">
                        {team.manager_email.split('@')[0]}
                      </div>
                    )}
                  </div>
                </td>
                <td className="py-2 text-center">
                  <span className={`font-mono ${team.wins > 0 ? 'text-green-400' : 'text-slate-400'}`}>
                    {team.wins}
                  </span>
                </td>
                <td className="py-2 text-center">
                  <span className={`font-mono ${team.losses > 0 ? 'text-red-400' : 'text-slate-400'}`}>
                    {team.losses}
                  </span>
                </td>
                <td className="py-2 text-center">
                  <span className={`font-mono ${team.ties > 0 ? 'text-yellow-400' : 'text-slate-400'}`}>
                    {team.ties}
                  </span>
                </td>
                <td className="py-2 text-center">
                  <span className="text-slate-300 font-mono">
                    {team.points_for.toFixed(1)}
                  </span>
                </td>
                <td className="py-2 text-center">
                  <span className="text-slate-300 font-mono">
                    {team.points_against.toFixed(1)}
                  </span>
                </td>
                <td className="py-2 text-center">
                  <span className={`font-mono ${
                    team.point_differential > 0
                      ? 'text-green-400'
                      : team.point_differential < 0
                      ? 'text-red-400'
                      : 'text-slate-400'
                  }`}>
                    {team.point_differential > 0 ? '+' : ''}{team.point_differential.toFixed(1)}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-4 pt-4 border-t border-slate-700">
        <div className="text-caption text-slate-500">
          <span className="font-medium">Legend:</span> W = Wins, L = Losses, T = Ties, PF = Points For, PA = Points Against, +/- = Point Differential
        </div>
      </div>
    </Panel>
  );
};

export default RecordTable;
