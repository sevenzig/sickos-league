import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useLeagueData } from '../context/LeagueContext';
import { PageChrome, Panel, Button, Badge } from '../components/ui';

const AdminDashboard: React.FC = () => {
  const { user, signOut } = useAuth();
  const { leagueData, isOnline, syncStatus } = useLeagueData();

  const totalTeams = leagueData.teams.length;
  const currentWeek = leagueData.currentWeek;
  const totalGameStats = leagueData.gameStats.length;
  const totalLineups = leagueData.lineups.length;

  const systemStatusLabel = !isOnline
    ? 'Offline'
    : syncStatus === 'error'
    ? 'Error'
    : syncStatus === 'syncing'
    ? 'Syncing'
    : 'Online';

  const stats = [
    { label: 'Current Week', value: currentWeek },
    { label: 'Total Teams', value: totalTeams },
    { label: 'Game Records', value: totalGameStats },
    { label: 'Locked Weeks', value: 8 },
  ];

  const navLinks = [
    { to: '/admin', label: 'Dashboard', active: true },
    { to: '/archive', label: 'Legacy Archive', active: false },
    { to: '/admin/import', label: 'Import Data', active: false },
    { to: '/admin/migration', label: 'Migration', active: false },
  ];

  const quickActions = [
    {
      to: '/archive',
      title: 'Legacy Archive',
      description: 'View the archived single-league season (read-only).',
    },
    {
      to: '/admin/import',
      title: 'Import Data',
      description: 'Upload weekly scoring data from CSV files. Automatically advance weeks.',
    },
    {
      to: '/admin/migration',
      title: 'Data Migration',
      description: 'Migrate data between storage systems and manage backups.',
    },
  ];

  return (
    <div className="min-h-screen bg-slate-950">
      <PageChrome
        title="Dashboard"
        actions={
          <div className="flex items-center gap-4">
            <span className="text-caption text-slate-400">
              {user?.email?.split('@')[0] ?? 'Admin'}
            </span>
            <Button variant="secondary" size="sm" onClick={signOut}>
              Sign Out
            </Button>
          </div>
        }
      />

      <div className="flex">
        {/* Sidebar */}
        <aside className="w-56 bg-slate-900 border-r border-slate-800 min-h-[calc(100vh-74px)] pt-4 flex-shrink-0">
          <nav className="px-3 space-y-1">
            <p className="text-caption font-bold text-slate-500 uppercase tracking-wider px-2 mb-2">
              Management
            </p>
            {navLinks.map(({ to, label, active }) => (
              <Link
                key={to}
                to={to}
                className={`flex items-center gap-2 px-3 py-2 rounded-md text-label font-medium transition-colors ${
                  active
                    ? 'bg-blue-900/40 text-blue-300'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                }`}
              >
                {label}
              </Link>
            ))}
          </nav>
        </aside>

        {/* Main content */}
        <main className="flex-1 p-6 space-y-6">
          {/* Stats */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {stats.map(({ label, value }) => (
              <Panel key={label}>
                <p className="text-caption text-slate-400 mb-1">{label}</p>
                <p className="text-2xl font-semibold text-white tabular-nums">{value}</p>
              </Panel>
            ))}
          </div>

          {/* Quick actions */}
          <div className="grid lg:grid-cols-3 gap-4">
            {quickActions.map(({ to, title, description }) => (
              <Link key={to} to={to} className="block h-full">
                <Panel className="hover:shadow-panel-hover hover:border-slate-600/60 transition-all duration-200 h-full flex flex-col">
                  <h3 className="text-heading text-white mb-2">{title}</h3>
                  <p className="text-body text-slate-400 flex-grow">{description}</p>
                </Panel>
              </Link>
            ))}
          </div>

          {/* System status */}
          <Panel>
            <h2 className="text-heading text-white mb-4">System Status</h2>
            <div className="grid md:grid-cols-3 gap-6 text-body">
              <div>
                <h3 className="text-caption font-bold text-slate-400 uppercase tracking-wider mb-2">
                  Database
                </h3>
                <div className="space-y-1 text-slate-300">
                  <div>
                    Status:{' '}
                    <span
                      className={
                        !isOnline || syncStatus === 'error'
                          ? 'text-red-400'
                          : syncStatus === 'syncing'
                          ? 'text-yellow-400'
                          : 'text-emerald-400'
                      }
                    >
                      {systemStatusLabel}
                    </span>
                  </div>
                  <div>Lineups: {totalLineups} records</div>
                  <div>Game Stats: {totalGameStats} records</div>
                </div>
              </div>
              <div>
                <h3 className="text-caption font-bold text-slate-400 uppercase tracking-wider mb-2">
                  League
                </h3>
                <div className="space-y-1 text-slate-300">
                  <div>Season: 2025</div>
                  <div>Current Week: {currentWeek}</div>
                  <div>Total Teams: {totalTeams}</div>
                </div>
              </div>
              <div>
                <h3 className="text-caption font-bold text-slate-400 uppercase tracking-wider mb-2">
                  Administration
                </h3>
                <div className="space-y-1 text-slate-300">
                  <div>User: {user?.email ?? 'Not signed in'}</div>
                  <div>Role: Administrator</div>
                  <div>Access: Full</div>
                </div>
              </div>
            </div>
          </Panel>
        </main>
      </div>
    </div>
  );
};

export default AdminDashboard;
