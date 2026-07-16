import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { MultiLeagueApi } from '../utils/multiLeagueApi';
import MatchupCards from '../components/league/MatchupCards';
import StandingsTable from '../components/league/StandingsTable';
import RecordTable from '../components/league/RecordTable';

interface LeagueDetails {
  id: string;
  name: string;
  season: number;
  teams_started_per_week: number;
  current_week: number;
}

const LeagueHome: React.FC = () => {
  const { leagueId } = useParams<{ leagueId: string }>();
  const [league, setLeague] = useState<LeagueDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentWeek, setCurrentWeek] = useState(1);

  useEffect(() => {
    if (leagueId) {
      loadLeagueData();
    }
  }, [leagueId]);

  const loadLeagueData = async () => {
    if (!leagueId) return;

    try {
      setLoading(true);
      const leagueDetails = await MultiLeagueApi.getLeagueDetails(leagueId);
      setLeague(leagueDetails);
      setCurrentWeek(leagueDetails?.current_week || 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load league data');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
          <p className="mt-4 text-slate-400">Loading league...</p>
        </div>
      </div>
    );
  }

  if (error || !league || !leagueId) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <div className="bg-red-900/20 border border-red-700 rounded-lg p-6 max-w-md">
            <h3 className="text-red-400 font-medium mb-2">Error Loading League</h3>
            <p className="text-slate-300">{error || 'League not found'}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">{league.name}</h1>
          <div className="flex items-center space-x-4 text-slate-400">
            <span>Season {league.season}</span>
            <span>•</span>
            <span>Week {currentWeek}</span>
            <span>•</span>
            <span>{league.teams_started_per_week} starters per week</span>
          </div>
        </div>

        {/* Week Selector */}
        <div className="mb-8">
          <div className="bg-slate-800 rounded-lg border border-slate-700 p-4">
            <h2 className="text-lg font-medium text-white mb-4">Select Week</h2>
            <div className="flex flex-wrap gap-2">
              {Array.from({ length: 18 }, (_, i) => i + 1).map((week) => (
                <button
                  key={week}
                  onClick={() => setCurrentWeek(week)}
                  className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                    currentWeek === week
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                  }`}
                >
                  Week {week}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left Column - Matchups */}
          <div className="lg:col-span-2">
            <MatchupCards leagueId={leagueId} week={currentWeek} />
          </div>

          {/* Right Column - Standings and Records */}
          <div className="space-y-8">
            <StandingsTable leagueId={leagueId} />
            <RecordTable leagueId={leagueId} />
          </div>
        </div>
      </div>
    </div>
  );
};

export default LeagueHome;