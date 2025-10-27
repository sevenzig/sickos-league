import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useLeagueData } from '../context/LeagueContext';

interface LayoutProps {
  children: React.ReactNode;
}

const Layout: React.FC<LayoutProps> = ({ children }) => {
  const location = useLocation();
  const { isOnline, hasPendingChanges, syncStatus, syncToDatabase, syncFromDatabase } = useLeagueData();
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (isMenuOpen) {
        const target = event.target as Element;
        if (!target.closest('.mobile-menu') && !target.closest('.hamburger-button')) {
          setIsMenuOpen(false);
        }
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isMenuOpen]);

  // Close menu when route changes
  useEffect(() => {
    setIsMenuOpen(false);
  }, [location.pathname]);

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

      {/* Mobile Hamburger Menu */}
      <div className="md:hidden">
        {/* Hamburger Button */}
        <button
          onClick={() => setIsMenuOpen(!isMenuOpen)}
          className="hamburger-button fixed bottom-4 right-4 z-50 w-12 h-12 bg-dark-surface border border-gray-600 rounded-full flex items-center justify-center shadow-lg hover:bg-gray-700 transition-colors"
          aria-label="Toggle navigation menu"
        >
          <div className="w-6 h-6 flex flex-col justify-center items-center">
            <span className={`block w-5 h-0.5 bg-white transition-all duration-300 ${isMenuOpen ? 'rotate-45 translate-y-1' : ''}`}></span>
            <span className={`block w-5 h-0.5 bg-white transition-all duration-300 mt-1 ${isMenuOpen ? 'opacity-0' : ''}`}></span>
            <span className={`block w-5 h-0.5 bg-white transition-all duration-300 mt-1 ${isMenuOpen ? '-rotate-45 -translate-y-1' : ''}`}></span>
          </div>
        </button>

        {/* Backdrop */}
        {isMenuOpen && (
          <div 
            className="fixed inset-0 bg-black bg-opacity-50 z-40"
            onClick={() => setIsMenuOpen(false)}
          ></div>
        )}

        {/* Menu Panel */}
        <div className={`mobile-menu fixed bottom-20 right-4 z-50 w-64 bg-dark-surface border border-gray-600 rounded-lg shadow-xl transition-all duration-300 ${isMenuOpen ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4 pointer-events-none'}`}>
          {/* Sync Status */}
          <div className="px-4 py-3 border-b border-gray-600">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <div className={`w-2 h-2 rounded-full ${getSyncStatusColor().replace('text-', 'bg-')}`}></div>
                <span className={`text-sm ${getSyncStatusColor()}`}>
                  {getSyncStatusText()}
                </span>
              </div>
              {isOnline && (hasPendingChanges || syncStatus === 'error') && (
                <button
                  onClick={handleSync}
                  disabled={syncStatus === 'syncing'}
                  className="px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400"
                >
                  {syncStatus === 'syncing' ? 'Syncing...' : 'Sync'}
                </button>
              )}
            </div>
          </div>

          {/* Navigation Items */}
          <nav className="py-2">
            {navItems.map((item) => (
              <Link
                key={item.path}
                to={item.path}
                onClick={() => setIsMenuOpen(false)}
                className={`flex items-center space-x-3 px-4 py-3 text-sm font-medium transition-colors ${
                  location.pathname === item.path
                    ? 'bg-gray-700 text-white'
                    : 'text-gray-300 hover:text-white hover:bg-gray-700'
                }`}
              >
                <span className="text-lg">{item.icon}</span>
                <span>{item.label}</span>
              </Link>
            ))}
          </nav>
        </div>
      </div>

    </div>
  );
};

export default Layout;
