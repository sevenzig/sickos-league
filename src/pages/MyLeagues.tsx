import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { MultiLeagueApi, League } from '../utils/multiLeagueApi';
import { getLeagueUrl } from '../utils/urlUtils';

const LeagueCard: React.FC<{ league: League }> = ({ league }) => (
  <Link
    to={getLeagueUrl(league.id, league.my_pick ? 'draft' : undefined)}
    className="block bg-slate-800 rounded-lg border border-slate-700 hover:border-slate-600 transition-colors p-6"
  >
    <div className="flex items-start justify-between mb-4">
      <h3 className="text-lg font-semibold text-white truncate">
        {league.name}
      </h3>
      <div className="flex items-center gap-2 flex-shrink-0">
        {league.my_pick && (
          <span className="px-2 py-1 text-xs font-bold rounded-full bg-green-600 text-white animate-pulse">
            Your pick!
          </span>
        )}
        <span
          className={`px-2 py-1 text-xs font-medium rounded-full ${
            league.user_role === 'owner'
              ? 'bg-blue-900/50 text-blue-300'
              : 'bg-green-900/50 text-green-300'
          }`}
        >
          {league.user_role === 'owner' ? 'Commissioner' : 'Manager'}
        </span>
      </div>
    </div>

    <div className="space-y-2 text-sm text-slate-400">
      <div className="flex justify-between">
        <span>Season:</span>
        <span className="text-slate-300">{league.season}</span>
      </div>
      <div className="flex justify-between">
        <span>Teams Filled:</span>
        <span className="text-slate-300">
          {league.fantasy_teams_count}/8
        </span>
      </div>
      <div className="flex justify-between">
        <span>Starters/Week:</span>
        <span className="text-slate-300">
          {league.teams_started_per_week}
        </span>
      </div>
      <div className="flex justify-between">
        <span>Members:</span>
        <span className="text-slate-300">
          {league.member_count}
        </span>
      </div>
      {league.draft_at && (
        <div className="flex justify-between">
          <span>Draft:</span>
          <span className="text-slate-300">
            {new Date(league.draft_at).toLocaleDateString()}
          </span>
        </div>
      )}
      <div className="flex justify-between">
        <span>Draft Status:</span>
        <span className={
          league.draft_status === 'complete'
            ? 'text-green-400'
            : league.draft_status === 'in_progress'
              ? 'text-yellow-400'
              : 'text-slate-300'
        }>
          {league.draft_status === 'in_progress'
            ? 'In progress'
            : league.draft_status === 'complete'
              ? 'Complete'
              : 'Not started'}
        </span>
      </div>
    </div>

    <div className="mt-4 pt-4 border-t border-slate-700">
      <div className="flex items-center justify-between">
        <span className="text-xs text-slate-500">
          {league.fantasy_teams_count < 8
            ? `${8 - league.fantasy_teams_count} spots remaining`
            : league.draft_status === 'pending'
              ? 'Draft next'
              : league.draft_status === 'in_progress'
                ? 'Draft in progress'
                : 'Draft complete'}
        </span>
        <svg
          className="h-4 w-4 text-slate-500"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 5l7 7-7 7"
          />
        </svg>
      </div>
    </div>
  </Link>
);

const LeagueSection: React.FC<{ title: string; leagues: League[] }> = ({ title, leagues }) => {
  if (leagues.length === 0) return null;

  return (
    <section>
      <h2 className="text-xl font-semibold text-white mb-4">{title}</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {leagues.map((league) => (
          <LeagueCard key={league.id} league={league} />
        ))}
      </div>
    </section>
  );
};

const MyLeagues: React.FC = () => {
  const [leagues, setLeagues] = useState<League[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadLeagues();
  }, []);

  const loadLeagues = async () => {
    try {
      setLoading(true);
      const userLeagues = await MultiLeagueApi.getUserLeagues();
      setLeagues(userLeagues);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load leagues');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
          <p className="mt-4 text-slate-400">Loading your leagues...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <div className="bg-red-900/20 border border-red-700 rounded-lg p-6 max-w-md">
            <h3 className="text-red-400 font-medium mb-2">Error Loading Leagues</h3>
            <p className="text-slate-300">{error}</p>
            <button
              onClick={loadLeagues}
              className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
            >
              Try Again
            </button>
          </div>
        </div>
      </div>
    );
  }

  const commissioned = leagues.filter((l) => l.user_role === 'owner');
  const participating = leagues.filter((l) => l.user_role !== 'owner');

  return (
    <div className="min-h-screen bg-slate-900">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-white">My Leagues</h1>
            <p className="text-slate-400 mt-2">
              Manage your Bad QB League memberships
            </p>
          </div>
          <Link
            to="/leagues/new"
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md font-medium transition-colors"
          >
            Create League
          </Link>
        </div>

        {leagues.length === 0 ? (
          <div className="text-center py-16">
            <svg
              className="mx-auto h-12 w-12 text-slate-600"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
              />
            </svg>
            <h3 className="mt-4 text-lg font-medium text-slate-300">No leagues yet</h3>
            <p className="mt-2 text-slate-500">
              Create your first league or join one with an invitation link.
            </p>
            <div className="mt-6 flex justify-center gap-4">
              <Link
                to="/leagues/new"
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md font-medium transition-colors"
              >
                Create League
              </Link>
              <Link
                to="/invite"
                className="bg-slate-700 hover:bg-slate-600 text-white px-4 py-2 rounded-md font-medium transition-colors border border-slate-600"
              >
                Join with Code
              </Link>
            </div>
          </div>
        ) : (
          <div className="space-y-10">
            <LeagueSection title="Leagues You Commission" leagues={commissioned} />
            <LeagueSection title="Leagues You're In" leagues={participating} />
          </div>
        )}
      </div>
    </div>
  );
};

export default MyLeagues;
