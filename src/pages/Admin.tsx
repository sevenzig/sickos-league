import React from 'react';
import { Link } from 'react-router-dom';
import { useLeagueData } from '../context/LeagueContext';
import { useAuth } from '../context/AuthContext';
import { PageChrome, Panel, Button, Badge } from '../components/ui';

export default function Admin() {
  const { leagueData, isOnline, hasPendingChanges, syncStatus, syncToDatabase, syncFromDatabase } =
    useLeagueData();
  const { user } = useAuth();

  const getSyncVariant = (): 'default' | 'success' | 'warning' | 'error' => {
    if (!isOnline || syncStatus === 'error') return 'error';
    if (syncStatus === 'syncing') return 'warning';
    if (hasPendingChanges) return 'warning';
    return 'success';
  };

  const getSyncLabel = () => {
    if (!isOnline) return 'Offline';
    if (syncStatus === 'syncing') return 'Syncing…';
    if (syncStatus === 'error') return 'Sync Error';
    if (hasPendingChanges) return 'Pending';
    return 'Synced';
  };

  const handleSync = async () => {
    if (hasPendingChanges) {
      await syncToDatabase();
    } else {
      await syncFromDatabase();
    }
  };

  const totalTeams = leagueData?.teams?.length ?? 0;
  const totalMatchups = leagueData?.matchups?.length ?? 0;
  const currentWeek = leagueData?.currentWeek ?? 1;
  const lockedWeeks = leagueData?.lockedWeeks?.length ?? 0;

  const stats = [
    { label: 'Teams', value: totalTeams },
    { label: 'Matchups', value: totalMatchups },
    { label: 'Current Week', value: `Wk ${currentWeek}` },
    { label: 'Locked Weeks', value: lockedWeeks },
  ];

  const adminLinks = [
    {
      title: 'CSV Import',
      description: 'Import weekly scoring data from CSV files',
      path: '/admin/import',
    },
    {
      title: 'Data Migration',
      description: 'Migrate historical data to database',
      path: '/admin/migration',
    },
  ];

  const syncLabel = getSyncLabel();
  const isPending = isOnline && (hasPendingChanges || syncStatus === 'error');

  return (
    <div className="space-y-6">
      <PageChrome
        title={
          <div className="flex items-center gap-3">
            <span className="text-title text-slate-50">Admin Console</span>
            {user?.email && (
              <span className="text-caption text-slate-400">{user.email.split('@')[0]}</span>
            )}
          </div>
        }
        actions={
          <div className="flex items-center gap-3">
            <Badge
              variant={syncStatus === 'syncing' ? 'default' : undefined}
              className={
                !isOnline || syncStatus === 'error'
                  ? 'bg-red-500/10 text-red-400 border-red-500/30'
                  : hasPendingChanges || syncStatus === 'syncing'
                  ? 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30'
                  : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
              }
            >
              <span
                className={`mr-1.5 inline-block w-1.5 h-1.5 rounded-full ${
                  !isOnline || syncStatus === 'error'
                    ? 'bg-red-400'
                    : hasPendingChanges
                    ? 'bg-yellow-400'
                    : syncStatus === 'syncing'
                    ? 'bg-yellow-400 animate-pulse'
                    : 'bg-emerald-400'
                }`}
              />
              {syncLabel}
            </Badge>
            {isPending && (
              <Button
                size="sm"
                variant="secondary"
                onClick={handleSync}
                disabled={syncStatus === 'syncing'}
              >
                {syncStatus === 'syncing' ? 'Syncing…' : 'Sync Now'}
              </Button>
            )}
          </div>
        }
      />

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map(({ label, value }) => (
          <Panel key={label} className="flex items-center justify-between">
            <div>
              <p className="text-caption font-bold text-slate-400 uppercase tracking-wider">
                {label}
              </p>
              <p className="text-display font-black text-white mt-1 tabular-nums">{value}</p>
            </div>
          </Panel>
        ))}
      </div>

      {/* Admin tool links */}
      <div>
        <h2 className="text-heading text-slate-50 mb-4">Admin Tools</h2>
        <div className="grid md:grid-cols-2 gap-4">
          {adminLinks.map((link) => (
            <Link
              key={link.path}
              to={link.path}
              className="group block"
            >
              <Panel className="hover:shadow-panel-hover hover:border-slate-600/60 transition-all duration-200 h-full">
                <h3 className="text-heading text-white mb-1">{link.title}</h3>
                <p className="text-body text-slate-400">{link.description}</p>
              </Panel>
            </Link>
          ))}
        </div>
      </div>

      {/* Warning note */}
      <Panel className="border-amber-500/30 bg-amber-500/5">
        <div className="flex items-start gap-3">
          <svg
            className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5"
            fill="currentColor"
            viewBox="0 0 20 20"
          >
            <path
              fillRule="evenodd"
              d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
              clipRule="evenodd"
            />
          </svg>
          <div>
            <h3 className="text-label font-bold text-white mb-1">Admin Access Required</h3>
            <p className="text-body text-slate-400">
              These features are for administrators only. Ensure you have the proper permissions
              before modifying league data.
            </p>
          </div>
        </div>
      </Panel>
    </div>
  );
}
