import React, { useState, useEffect } from 'react';
import { MultiLeagueApi, LeagueMatchup } from '../../utils/multiLeagueApi';

interface MatchupCardsProps {
  leagueId: string;
  week: number;
}

const MatchupCards: React.FC<MatchupCardsProps> = ({ leagueId, week }) => {
  const [matchups, setMatchups] = useState<LeagueMatchup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadMatchups();
  }, [leagueId, week]);

  const loadMatchups = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await MultiLeagueApi.getLeagueSchedule(leagueId, week);
      setMatchups(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load matchups');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-slate-800 rounded-lg border border-slate-700 p-6">
        <h2 className="text-xl font-semibold text-white mb-6">Week {week} Matchups</h2>
        <div className="space-y-4">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="animate-pulse">
              <div className="bg-slate-700 rounded-lg h-24"></div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-slate-800 rounded-lg border border-slate-700 p-6">
        <h2 className="text-xl font-semibold text-white mb-6">Week {week} Matchups</h2>
        <div className="bg-red-900/20 border border-red-700 rounded-lg p-4">
          <p className="text-red-400">{error}</p>
        </div>
      </div>
    );
  }

  if (matchups.length === 0) {
    return (
      <div className="bg-slate-800 rounded-lg border border-slate-700 p-6">
        <h2 className="text-xl font-semibold text-white mb-6">Week {week} Matchups</h2>
        <div className="text-center py-8">
          <p className="text-slate-400">No matchups scheduled for this week</p>
          <p className="text-slate-500 text-sm mt-2">
            Matchups will appear once the schedule is generated
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-slate-800 rounded-lg border border-slate-700 p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold text-white">Week {week} Matchups</h2>
        {matchups[0]?.week_locked && (
          <span className="px-2 py-1 bg-red-900/50 text-red-300 text-xs rounded-full">
            Locked
          </span>
        )}
      </div>

      <div className="space-y-4">
        {matchups.map((matchup) => (
          <div
            key={matchup.id}
            className="bg-slate-700 rounded-lg border border-slate-600 p-4"
          >
            <div className="flex items-center justify-between">
              {/* Team 1 */}
              <div className="flex-1">
                <div className="text-white font-medium">
                  {matchup.fantasy_team1_name}
                </div>
                {matchup.team1_manager_email && (
                  <div className="text-slate-400 text-sm">
                    {matchup.team1_manager_email.split('@')[0]}
                  </div>
                )}
              </div>

              {/* VS */}
              <div className="flex items-center px-4">
                <span className="text-slate-400 font-medium">VS</span>
              </div>

              {/* Team 2 */}
              <div className="flex-1 text-right">
                <div className="text-white font-medium">
                  {matchup.fantasy_team2_name}
                </div>
                {matchup.team2_manager_email && (
                  <div className="text-slate-400 text-sm">
                    {matchup.team2_manager_email.split('@')[0]}
                  </div>
                )}
              </div>
            </div>

            {/* Matchup Info */}
            <div className="mt-3 pt-3 border-t border-slate-600">
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-400">
                  {matchup.locks_at
                    ? `Locks: ${new Date(matchup.locks_at).toLocaleString()}`
                    : 'Lock time TBD'}
                </span>
                <div className="flex items-center space-x-2">
                  {matchup.week_locked ? (
                    <span className="text-red-400">Locked</span>
                  ) : (
                    <span className="text-green-400">Open</span>
                  )}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default MatchupCards;