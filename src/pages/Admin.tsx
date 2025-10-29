import React from 'react';
import { Link } from 'react-router-dom';
import { useLeagueData } from '../context/LeagueContext';
import { useAuth } from '../context/AuthContext';

export default function Admin() {
  const { leagueData, isOnline, hasPendingChanges, syncStatus, syncToDatabase, syncFromDatabase } = useLeagueData();
  const { user } = useAuth();

  // Sync status helper functions
  const getSyncStatusColor = () => {
    if (!isOnline) return 'text-red-500';
    if (syncStatus === 'syncing') return 'text-yellow-500';
    if (syncStatus === 'error') return 'text-red-500';
    if (hasPendingChanges) return 'text-orange-500';
    return 'text-green-500';
  };

  const getSyncStatusText = () => {
    if (!isOnline) return 'Offline';
    if (syncStatus === 'syncing') return 'Syncing...';
    if (syncStatus === 'error') return 'Sync Error';
    if (hasPendingChanges) return 'Pending Changes';
    return 'Synced';
  };

  const getSyncStatusBgColor = () => {
    if (!isOnline) return 'bg-red-500/10 border-red-500/30';
    if (syncStatus === 'syncing') return 'bg-yellow-500/10 border-yellow-500/30';
    if (syncStatus === 'error') return 'bg-red-500/10 border-red-500/30';
    if (hasPendingChanges) return 'bg-orange-500/10 border-orange-500/30';
    return 'bg-emerald-500/10 border-emerald-500/30';
  };

  const handleSync = async () => {
    if (hasPendingChanges) {
      await syncToDatabase();
    } else {
      await syncFromDatabase();
    }
  };

  const adminFeatures = [
    {
      title: 'CSV Import',
      description: 'Import weekly scoring data from CSV files',
      path: '/admin/import',
      gradient: 'from-blue-500 to-cyan-500',
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
        </svg>
      )
    },
    {
      title: 'Data Migration',
      description: 'Migrate historical data to database',
      path: '/admin/migration',
      gradient: 'from-emerald-500 to-teal-500',
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>
      )
    }
  ];

  // Calculate statistics
  const totalTeams = leagueData?.teams?.length || 0;
  const totalMatchups = leagueData?.matchups?.length || 0;
  const currentWeek = leagueData?.currentWeek || 1;
  const lockedWeeks = leagueData?.lockedWeeks?.length || 0;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      {/* Admin Console Header */}
      <div className="bg-gradient-to-r from-slate-800 via-slate-700 to-slate-800 border-b border-slate-600/50 shadow-lg">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500 to-blue-600 shadow-lg">
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1. Piet-756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </div>
              <div>
                <h1 className="text-2xl font-black text-white tracking-tight">Admin Console</h1>
                <p className="text-sm text-slate-300">
                  {user?.email ? `Signed in as ${user.email.split('@')[0]}` : 'Administrator'}
                </p>
              </div>
            </div>

            {/* Sync Status Indicator */}
            <div className={`flex items-center space-x-3 px-4 py-2 rounded-lg border ${getSyncStatusBgColor()}`}>
              <div className="flex items-center space-x-2">
                <div className={`w-2.5 h-2.5 rounded-full ${
                  !isOnline ? 'bg-red-500' :
                  syncStatus === 'syncing' ? 'bg-yellow-500 animate-pulse' :
                  syncStatus === 'error' ? 'bg-red-500' :
                  hasPendingChanges ? 'bg-orange-500' :
                  'bg-emerald-500'
                }`}></div>
                <span className={`text-sm font-semibold ${getSyncStatusColor()}`}>
                  {getSyncStatusText()}
                </span>
              </div>
              {isOnline && (hasPendingChanges || syncStatus === 'error') && (
                <button
                  onClick={handleSync}
                  disabled={syncStatus === 'syncing'}
                  className="px-3 py-1.5 text-xs font-bold bg-blue-600 hover:bg-blue-700 disabled:bg-slate-600 disabled:cursor-not-allowed text-white rounded-md transition-colors duration-200"
                >
                  {syncStatus === 'syncing' ? 'Syncing...' : 'Sync Now'}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Main Admin Dashboard */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Statistics Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <div className="bg-gradient-to-br from-slate-800/90 to-slate-900/90 backdrop-blur-xl rounded-xl border border-slate-700/50 shadow-lg p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-400 uppercase tracking-wider">Teams</p>
                <p className="text-3xl font-black text-white mt-2">{totalTeams}</p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-blue-500/20 flex items-center justify-center">
                <svg className="w-6 h-6 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 005.356 1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6997 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
              </div>
            </div>
          </div>

          <div className="bg-gradient-to-br from-slate-800/90 to-slate-900/90 backdrop-blur-xl rounded-xl border border-slate-700/50 shadow-lg p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-400 uppercase tracking-wider">Matchups</p>
                <p className="text-3xl font-black text-white mt-2">{totalMatchups}</p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-purple-500/20 flex items-center justify-center">
                <svg className="w-6 h-6 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </div>
            </div>
          </div>

          <div className="bg-gradient-to-br from-slate-800/90 to-slate-900/90 backdrop-blur-xl rounded-xl border border-slate-700/50 shadow-lg p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-400 uppercase tracking-wider">Current Week</p>
                <p className="text-3xl font-black text-white mt-2">Week {currentWeek}</p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-emerald-500/20 flex items-center justify-center">
                <svg className="w-6 h-6 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
            </div>
          </div>

          <div className="bg-gradient-to-br from-slate-800/90 to-slate-900/90 backdrop-blur-xl rounded-xl border border-slate-700/50 shadow-lg p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-400 uppercase tracking-wider">Locked Weeks</p>
                <p className="text-3xl font-black text-white mt-2">{lockedWeeks}</p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-yellow-500/20 flex items-center justify-center">
                <svg className="w-6 h-6 text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </div>
            </div>
          </div>
        </div>

        {/* Admin Features */}
        <div className="mb-8">
          <h2 className="text-xl font-bold text-white mb-4">Admin Tools</h2>
          <div className="grid md:grid-cols-2 gap-6">
            {adminFeatures.map((feature) => (
              <Link
                key={feature.path}
                to={feature.path}
                className="group block bg-gradient-to-br from-slate-800/90 to-slate-900/90 backdrop-blur-xl rounded-xl border border-slate-700/50 shadow-lg hover:shadow-xl hover:border-slate-600/50 transition-all duration-200 overflow-hidden"
              >
                <div className="p-6">
                  <div className="flex items-center mb-4">
                    <div className={`w-14 h-14 bg-gradient-to-br ${feature.gradient} rounded-xl flex items-center justify-center text-white mr-4 shadow-lg group-hover:scale-110 transition-transform duration-200`}>
                      {feature.icon}
                    </div>
                    <div>
                      <h3 className="text-xl font-bold text-white">{feature.title}</h3>
                    </div>
                  </div>
                  <p className="text-sm text-slate-300 ml-[72px]">{feature.description}</p>
                </div>
              </Link>
            ))}
          </div>
        </div>

        {/* System Status Alert */}
        <div className="bg-gradient-to-br from-amber-500/10 to-orange-500/10 backdrop-blur-sm rounded-xl border border-amber-500/30 p-6">
          <div className="flex items-start">
            <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/30 mr-4 flex-shrink-0">
              <svg className="w-6 h-6 text-amber-400" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
            </div>
            <div>
              <h3 className="font-bold text-white mb-1">Admin Access Required</h3>
              <p className="text-sm text-slate-300">
                These features are for administrators only. Make sure you have the proper permissions before making changes to the league data.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
