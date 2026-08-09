import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { MultiLeagueApi } from '../../utils/multiLeagueApi';
import { getLeagueUrl } from '../../utils/urlUtils';
import { Button } from '@/components/ui/button';
import { Panel } from '@/components/ui/panel';
import { NavTabList, navTabTriggerClass } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';

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

const LeagueHeader: React.FC<LeagueHeaderProps> = ({ leagueId, active }) => {
  const [league, setLeague] = useState<HeaderDetails | null>(null);

  useEffect(() => {
    MultiLeagueApi.getLeagueDetails(leagueId)
      .then(setLeague)
      .catch(() => setLeague(null));
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
      <p className="text-caption font-semibold uppercase tracking-widest text-blue-400 mb-2">
        {league ? `Season ${league.season}` : ' '}
      </p>

      <div className="flex items-end justify-between gap-4 flex-wrap mb-6">
        <h1 className="text-display sm:text-5xl font-bold tracking-tight text-white text-balance">
          {league?.name ?? '\u00A0'}
        </h1>
        {league?.user_role === 'owner' && (
          <Link
            to={getLeagueUrl(leagueId, 'admin')}
            className="text-slate-400 hover:text-white underline decoration-slate-600 underline-offset-4 text-label transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background rounded-md"
          >
            Admin Panel &#8594;
          </Link>
        )}
      </div>

      <NavTabList>
        {tabs.map((tab) => (
          <Link
            key={tab.key}
            to={getLeagueUrl(leagueId, tab.path)}
            className={navTabTriggerClass(active === tab.key)}
          >
            {tab.label}
          </Link>
        ))}
      </NavTabList>

      {league && league.draft_status !== 'complete' && (
        <Panel
          padding="md"
          className={cn(
            'mt-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3',
            league.draft_status === 'in_progress'
              ? 'from-yellow-950/40 to-slate-900/95 border-yellow-700/50'
              : 'from-blue-950/40 to-slate-900/95 border-blue-700/50'
          )}
        >
          <div>
            <p
              className={cn(
                'text-label font-medium',
                league.draft_status === 'in_progress' ? 'text-yellow-300' : 'text-blue-300'
              )}
            >
              {league.draft_status === 'in_progress'
                ? league.my_pick
                  ? "Draft in progress - you're on the clock!"
                  : 'Draft in progress'
                : 'The draft has not started yet'}
            </p>
            <p className="text-slate-400 text-label mt-1">
              {league.draft_status === 'in_progress'
                ? 'Rosters are being drafted right now.'
                : league.user_role === 'owner'
                  ? 'Set the pick order and start the draft from the admin panel once all 8 teams have joined.'
                  : 'The schedule is set when the draft starts (or earlier from League Admin). Join the draft room when it begins.'}
            </p>
          </div>
          <Button
            asChild
            size="sm"
            variant={league.draft_status === 'in_progress' ? 'secondary' : 'primary'}
            className={cn(
              'self-start flex-shrink-0',
              league.draft_status === 'in_progress' &&
                'bg-yellow-600 hover:bg-yellow-700 border-0 text-white'
            )}
          >
            <Link
              to={getLeagueUrl(
                leagueId,
                league.draft_status === 'pending' && league.user_role === 'owner' ? 'admin' : 'draft'
              )}
            >
              {league.draft_status === 'in_progress'
                ? 'Go to Draft Room'
                : league.user_role === 'owner'
                  ? 'Open Admin Panel'
                  : 'View Draft Room'}
            </Link>
          </Button>
        </Panel>
      )}
    </div>
  );
};

export default LeagueHeader;
