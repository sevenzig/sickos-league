import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useLeagueData } from '../context/LeagueContext';

const AdminDashboard: React.FC = () => {
  const { user, signOut } = useAuth();
  const { leagueData, isOnline, syncStatus } = useLeagueData();

  // Calculate metrics
  const totalTeams = leagueData.teams.length;
  const totalWeeks = Math.max(...leagueData.gameStats.map(stat => stat.week), 0);
  const currentWeek = leagueData.currentWeek;
  const totalGameStats = leagueData.gameStats.length;
  const totalLineups = leagueData.lineups.length;
  const lockedWeeks = leagueData.lockedWeeks.length;

  // System status
  const getSystemStatus = () => {
    if (!isOnline) return { status: 'Offline', color: 'text-red-400', bg: 'bg-red-500/20' };
    if (syncStatus === 'error') return { status: 'Error', color: 'text-red-400', bg: 'bg-red-500/20' };
    if (syncStatus === 'syncing') return { status: 'Syncing', color: 'text-yellow-400', bg: 'bg-yellow-500/20' };
    return { status: 'Online', color: 'text-green-400', bg: 'bg-green-500/20' };
  };

  const systemStatus = getSystemStatus();

  return (
    <div className="min-h-screen bg-slate-900">
      {/* Admin Header */}
      <div className="bg-slate-800 border-b border-slate-700 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-white">Dashboard</h1>
            <p className="text-sm text-slate-400 mt-1">League administration and management</p>
          </div>
          <div className="flex items-center space-x-4">
            <div className="text-sm text-slate-400">
              Welcome, {user?.email?.split('@')[0] || 'Admin'}
            </div>
            <button
              onClick={signOut}
              className="px-4 py-2 text-sm bg-slate-700 text-slate-200 border border-slate-600 rounded-md hover:bg-slate-600 transition-colors"
            >
              Sign Out
            </button>
          </div>
        </div>
      </div>

      <div className="flex">
        {/* Sidebar */}
        <div className="w-64 bg-slate-800 border-r border-slate-700 min-h-screen">
          <nav className="mt-6">
            <div className="px-3">
              <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
                Management
              </div>
              <div className="space-y-1">
                <Link
                  to="/admin"
                  className="bg-blue-900/50 text-blue-300 group flex items-center px-3 py-2 text-sm font-medium rounded-md"
                >
                  <svg className="text-blue-400 mr-3 h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2H5a2 2 0 00-2-2z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5a2 2 0 012-2h4a2 2 0 012 2v2H8V5z" />
                  </svg>
                  Dashboard
                </Link>
                <Link
                  to="/archive"
                  className="text-slate-300 hover:bg-slate-700 group flex items-center px-3 py-2 text-sm font-medium rounded-md"
                >
                  <svg className="text-slate-400 mr-3 h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                  Legacy Archive
                </Link>
                <Link
                  to="/admin/import"
                  className="text-slate-300 hover:bg-slate-700 group flex items-center px-3 py-2 text-sm font-medium rounded-md"
                >
                  <svg className="text-slate-400 mr-3 h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10" />
                  </svg>
                  Import Data
                </Link>
                <Link
                  to="/admin/migration"
                  className="text-slate-300 hover:bg-slate-700 group flex items-center px-3 py-2 text-sm font-medium rounded-md"
                >
                  <svg className="text-slate-400 mr-3 h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  Migration
                </Link>
              </div>
            </div>
          </nav>
        </div>

        {/* Main Content */}
        <div className="flex-1 p-6 max-w-none w-full">
          {/* Stats Overview */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            <div className="bg-slate-800 rounded-lg border border-slate-700 p-6">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <div className="w-8 h-8 bg-blue-900/50 rounded-md flex items-center justify-center">
                    <svg className="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  </div>
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-slate-400">Current Week</p>
                  <p className="text-2xl font-semibold text-white">{currentWeek}</p>
                </div>
              </div>
            </div>

            <div className="bg-slate-800 rounded-lg border border-slate-700 p-6">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <div className="w-8 h-8 bg-green-900/50 rounded-md flex items-center justify-center">
                    <svg className="w-5 h-5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                    </svg>
                  </div>
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-slate-400">Total Teams</p>
                  <p className="text-2xl font-semibold text-white">{totalTeams}</p>
                </div>
              </div>
            </div>

            <div className="bg-slate-800 rounded-lg border border-slate-700 p-6">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <div className="w-8 h-8 bg-purple-900/50 rounded-md flex items-center justify-center">
                    <svg className="w-5 h-5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                    </svg>
                  </div>
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-slate-400">Game Records</p>
                  <p className="text-2xl font-semibold text-white">{totalGameStats}</p>
                </div>
              </div>
            </div>

            <div className="bg-slate-800 rounded-lg border border-slate-700 p-6">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <div className="w-8 h-8 bg-yellow-900/50 rounded-md flex items-center justify-center">
                    <svg className="w-5 h-5 text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                  </div>
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-slate-400">Locked Weeks</p>
                  <p className="text-2xl font-semibold text-white">8</p>
                </div>
              </div>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
            <Link to="/archive" className="block h-full">
              <div className="bg-slate-800 rounded-lg border border-slate-700 p-6 hover:bg-slate-700 transition-colors h-full flex flex-col">
                <div className="flex items-center mb-4">
                  <div className="w-10 h-10 bg-emerald-900/50 rounded-lg flex items-center justify-center">
                    <svg className="w-6 h-6 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                    </svg>
                  </div>
                  <h3 className="ml-3 text-lg font-medium text-white">Legacy Archive</h3>
                </div>
                <p className="text-slate-400 text-sm flex-grow">View the archived single-league season (read-only).</p>
              </div>
            </Link>

            <Link to="/admin/import" className="block h-full">
              <div className="bg-slate-800 rounded-lg border border-slate-700 p-6 hover:bg-slate-700 transition-colors h-full flex flex-col">
                <div className="flex items-center mb-4">
                  <div className="w-10 h-10 bg-blue-900/50 rounded-lg flex items-center justify-center">
                    <svg className="w-6 h-6 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10" />
                    </svg>
                  </div>
                  <h3 className="ml-3 text-lg font-medium text-white">Import Data</h3>
                </div>
                <p className="text-slate-400 text-sm flex-grow">Upload weekly scoring data from CSV files. Automatically advance weeks.</p>
              </div>
            </Link>

            <Link to="/admin/migration" className="block h-full">
              <div className="bg-slate-800 rounded-lg border border-slate-700 p-6 hover:bg-slate-700 transition-colors h-full flex flex-col">
                <div className="flex items-center mb-4">
                  <div className="w-10 h-10 bg-purple-900/50 rounded-lg flex items-center justify-center">
                    <svg className="w-6 h-6 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                  </div>
                  <h3 className="ml-3 text-lg font-medium text-white">Data Migration</h3>
                </div>
                <p className="text-slate-400 text-sm flex-grow">Migrate data between storage systems and manage backups.</p>
              </div>
            </Link>
          </div>

          {/* System Status */}
          <div className="bg-slate-800 rounded-lg border border-slate-700 p-6">
            <h2 className="text-lg font-medium text-white mb-4">System Status</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div>
                <h3 className="text-sm font-medium text-slate-400 mb-2">Database</h3>
                <div className="space-y-1 text-sm text-white">
                  <div>Status: <span className={systemStatus.color}>{systemStatus.status}</span></div>
                  <div>Lineups: {totalLineups} records</div>
                  <div>Game Stats: {totalGameStats} records</div>
                </div>
              </div>
              <div>
                <h3 className="text-sm font-medium text-slate-400 mb-2">League Settings</h3>
                <div className="space-y-1 text-sm text-white">
                  <div>Season: 2025</div>
                  <div>Current Week: {currentWeek}</div>
                  <div>Total Teams: {totalTeams}</div>
                </div>
              </div>
              <div>
                <h3 className="text-sm font-medium text-slate-400 mb-2">Administration</h3>
                <div className="space-y-1 text-sm text-white">
                  <div>User: {user?.email || 'Not signed in'}</div>
                  <div>Role: Administrator</div>
                  <div>Access: Full</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;