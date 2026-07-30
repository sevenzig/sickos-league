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
      <p className="text-xs font-semibold uppercase tracking-widest text-blue-400 mb-2">
        {league ? `Season ${league.season}` : ' '}
      </p>

      <div className="flex items-end justify-between gap-5 flex-wrap mb-7">
        <h1 className="text-4xl sm:text-5xl font-black tracking-tight text-white text-balance">{league?.name ?? '\u00A0'}</h1>
        {league?.user_role === 'owner' && (
          <Link
            to={getLeagueUrl(leagueId, 'admin')}
            className="text-slate-400 hover:text-white underline decoration-slate-600 underline-offset-4 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900 rounded-sm"
          >
            Admin Panel &#8594;
          </Link>
        )}
      </div>

      <div className="inline-flex gap-0.5 bg-slate-700/35 p-1 rounded-full overflow-x-auto max-w-full">
        {tabs.map(tab => (
          <Link
            key={tab.key}
            to={getLeagueUrl(leagueId, tab.path)}
            className={`px-4 py-1.5 rounded-full text-sm font-semibold whitespace-nowrap transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900 ${
              active === tab.key
                ? 'bg-blue-500 text-white'
                : 'text-slate-400 hover:text-white'
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
