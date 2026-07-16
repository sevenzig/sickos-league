import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { MultiLeagueApi } from '../../utils/multiLeagueApi';
import { getLeagueUrl } from '../../utils/urlUtils';

interface LeagueHeaderProps {
  leagueId: string; // URL param (8-char id or legacy UUID)
  active: 'home' | 'lineups' | 'schedule' | 'standings' | 'draft';
}

interface HeaderDetails {
  id: string;
  name: string;
  season: number;
  user_role: 'owner' | 'manager';
  draft_status: 'pending' | 'in_progress' | 'complete';
  my_pick?: boolean;
}

// Phase 5.3: shared league page header - league name, tab navigation, and a
// draft-status callout so pre-draft leagues never feel like a dead end.
const LeagueHeader: React.FC<LeagueHeaderProps> = ({ leagueId, active }) => {
  const [league, setLeague] = useState<HeaderDetails | null>(null);

  useEffect(() => {
    MultiLeagueApi.getLeagueDetails(leagueId)
      .then(setLeague)
      .catch(() => setLeague(null)); // pages render their own errors
  }, [leagueId]);

  const tabs: { key: LeagueHeaderProps['active']; label: string; path: string }[] = [
    { key: 'home', label: 'Home', path: '' },
    { key: 'lineups', label: 'My Lineup', path: 'lineups' },
    { key: 'schedule', label: 'Schedule', path: 'schedule' },
    { key: 'standings', label: 'Standings', path: 'standings' },
    { key: 'draft', label: 'Draft', path: 'draft' },
  ];

  return (
    <div className="mb-6">
      <nav className="flex items-center space-x-2 text-sm text-slate-400 mb-3">
        <Link to="/my-leagues" className="hover:text-slate-300">My Leagues</Link>
        <span>→</span>
        <span className="text-slate-300">{league?.name ?? '...'}</span>
      </nav>

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-white">{league?.name ?? '\u00A0'}</h1>
          {league && <span className="text-slate-400 text-sm">Season {league.season}</span>}
        </div>
        {league?.user_role === 'owner' && (
          <Link
            to={getLeagueUrl(leagueId, 'admin')}
            className="self-start px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-md text-sm font-medium transition-colors"
          >
            Admin Panel
          </Link>
        )}
      </div>

      <div className="flex gap-1 mt-4 border-b border-slate-700 overflow-x-auto">
        {tabs.map(tab => (
          <Link
            key={tab.key}
            to={getLeagueUrl(leagueId, tab.path)}
            className={`px-4 py-2 text-sm font-medium whitespace-nowrap border-b-2 -mb-px transition-colors ${
              active === tab.key
                ? 'border-blue-500 text-white'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            {tab.label}
          </Link>
        ))}
      </div>

      {league && league.draft_status !== 'complete' && (
        <div className={`mt-4 rounded-lg border p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 ${
          league.draft_status === 'in_progress'
            ? 'bg-yellow-900/20 border-yellow-700'
            : 'bg-blue-900/20 border-blue-700'
        }`}>
          <div>
            <p className={`font-medium ${league.draft_status === 'in_progress' ? 'text-yellow-300' : 'text-blue-300'}`}>
              {league.draft_status === 'in_progress'
                ? league.my_pick
                  ? "Draft in progress - you're on the clock!"
                  : 'Draft in progress'
                : 'The draft has not started yet'}
            </p>
            <p className="text-slate-400 text-sm mt-1">
              {league.draft_status === 'in_progress'
                ? 'Rosters are being drafted right now.'
                : league.user_role === 'owner'
                  ? 'Set the pick order and start the draft from the admin panel once all 8 teams have joined.'
                  : 'Matchups and standings appear once the draft is complete and the schedule is generated.'}
            </p>
          </div>
          <Link
            to={getLeagueUrl(
              leagueId,
              league.draft_status === 'pending' && league.user_role === 'owner' ? 'admin' : 'draft'
            )}
            className={`self-start flex-shrink-0 px-4 py-2 rounded-md text-sm font-medium text-white transition-colors ${
              league.draft_status === 'in_progress'
                ? 'bg-yellow-600 hover:bg-yellow-700'
                : 'bg-blue-600 hover:bg-blue-700'
            }`}
          >
            {league.draft_status === 'in_progress'
              ? 'Go to Draft Room'
              : league.user_role === 'owner' ? 'Open Admin Panel' : 'View Draft Room'}
          </Link>
        </div>
      )}
    </div>
  );
};

export default LeagueHeader;
