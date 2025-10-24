import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useLeagueData } from '../context/LeagueContext';

interface LayoutProps {
  children: React.ReactNode;
}

const Layout: React.FC<LayoutProps> = ({ children }) => {
  const location = useLocation();
  const { isOnline, hasPendingChanges, syncStatus, syncToDatabase, syncFromDatabase } = useLeagueData();

  const navItems = [
    { path: '/', label: 'Home', icon: '🏠' },
    { path: '/rosters', label: 'Rosters', icon: '👥' },
    { path: '/lineups', label: 'Lineups', icon: '⚙️' },
    { path: '/scores', label: 'Scores', icon: '📊' },
    { path: '/rules', label: 'Rules', icon: '📋' },
    { path: '/admin', label: 'Admin', icon: '⚙️' }
  ];

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

  const handleSync = async () => {
    if (hasPendingChanges) {
      await syncToDatabase();
    } else {
      await syncFromDatabase();
    }
  };

  return (
    <div className="min-h-screen bg-dark-bg">
      {/* Header */}
      <header className="bg-dark-surface border-b border-gray-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center">
              <h1 className="text-xl font-bold text-white">Bad QB League</h1>
            </div>
            <div className="flex items-center space-x-4">
              {/* Sync Status Indicator */}
              <div className="flex items-center space-x-2">
                <div className={`w-2 h-2 rounded-full ${getSyncStatusColor().replace('text-', 'bg-')}`}></div>
                <span className={`text-sm ${getSyncStatusColor()}`}>
                  {getSyncStatusText()}
                </span>
                {isOnline && (hasPendingChanges || syncStatus === 'error') && (
                  <button
                    onClick={handleSync}
                    disabled={syncStatus === 'syncing'}
                    className="ml-2 px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400"
                  >
                    {syncStatus === 'syncing' ? 'Syncing...' : 'Sync'}
                  </button>
                )}
              </div>
              
              {/* Desktop Navigation */}
              <div className="hidden md:block">
                <nav className="flex space-x-8">
                  {navItems.map((item) => (
                    <Link
                      key={item.path}
                      to={item.path}
                      className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                        location.pathname === item.path
                          ? 'bg-gray-700 text-white'
                          : 'text-gray-300 hover:text-white hover:bg-gray-700'
                      }`}
                    >
                      {item.label}
                    </Link>
                  ))}
                </nav>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="w-full px-4 sm:px-6 lg:px-8 py-6">
        {children}
      </main>

      {/* Mobile bottom navigation */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-dark-surface border-t border-gray-700">
        <div className="grid grid-cols-5 h-16">
          {navItems.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className={`flex flex-col items-center justify-center text-xs font-medium transition-colors ${
                location.pathname === item.path
                  ? 'text-white bg-gray-700'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              <span className="text-lg mb-1">{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          ))}
        </div>
      </nav>

      {/* Add bottom padding for mobile nav */}
      <div className="md:hidden h-16"></div>
    </div>
  );
};

export default Layout;
