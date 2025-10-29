import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useLeagueData } from '../context/LeagueContext';
import { useAuth } from '../context/AuthContext';

interface LayoutProps {
  children: React.ReactNode;
}

const Layout: React.FC<LayoutProps> = ({ children }) => {
  const location = useLocation();
  const { isAdmin, signOut, user } = useAuth();

  // Safety check for context availability during hot-reload scenarios
  let contextData;
  try {
    contextData = useLeagueData();
  } catch (error) {
    console.error('Layout: Context not available during hot-reload:', error);
    // Return loading state while context initializes
    return (
      <div className="min-h-screen bg-dark-bg text-white flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-gray-300">Initializing...</p>
        </div>
      </div>
    );
  }

  // Additional safety check for context data
  if (!contextData || !contextData.leagueData) {
    return (
      <div className="min-h-screen bg-dark-bg text-white flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-gray-300">Loading league data...</p>
        </div>
      </div>
    );
  }

  const { isOnline, hasPendingChanges, syncStatus, syncToDatabase, syncFromDatabase } = contextData;
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

  // Public navigation items
  const publicNavItems = [
    { path: '/', label: 'Home' },
    { path: '/rosters', label: 'Rosters' },
    { path: '/scores', label: 'Scores' },
    { path: '/rules', label: 'Rules' }
  ];

  // Admin navigation items (for desktop nav)
  const adminNavItems = [
    ...publicNavItems,
    { path: '/admin', label: 'Admin' }
  ];

  // Admin subroutes (for mobile menu)
  const adminSubroutes = [
    { path: '/admin', label: 'Admin Dashboard' },
    { path: '/admin/lineups', label: 'Manage Lineups' },
    { path: '/admin/import', label: 'Import Data' },
    { path: '/admin/migration', label: 'Data Migration' }
  ];

  // Mobile menu items
  const mobileNavItems = isAdmin ? [...publicNavItems, ...adminSubroutes] : publicNavItems;

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
              <div className="hidden md:flex items-center space-x-2">
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
                  {(isAdmin ? adminNavItems : publicNavItems).map((item) => (
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

              {/* Mobile Hamburger Button */}
              <button
                onClick={() => setIsMenuOpen(!isMenuOpen)}
                className="hamburger-button md:hidden p-2 text-gray-300 hover:text-white hover:bg-gray-700 rounded-md transition-colors"
                aria-label="Toggle navigation menu"
              >
                <div className="w-6 h-6 flex flex-col justify-center items-center">
                  <span className={`block w-5 h-0.5 bg-current transition-all duration-300 ${isMenuOpen ? 'rotate-45 translate-y-1' : ''}`}></span>
                  <span className={`block w-5 h-0.5 bg-current transition-all duration-300 mt-1 ${isMenuOpen ? 'opacity-0' : ''}`}></span>
                  <span className={`block w-5 h-0.5 bg-current transition-all duration-300 mt-1 ${isMenuOpen ? '-rotate-45 -translate-y-1' : ''}`}></span>
                </div>
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="w-full px-4 sm:px-6 lg:px-8 py-6">
        {children}
      </main>

      {/* Mobile Menu */}
      {isMenuOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black bg-opacity-50 z-40 md:hidden"
            onClick={() => setIsMenuOpen(false)}
          ></div>

          {/* Menu Panel */}
          <div className="mobile-menu fixed top-16 left-0 right-0 z-50 bg-dark-surface border-b border-gray-600 shadow-xl md:hidden">
            {/* Navigation Items */}
            <nav className="py-2">
              {mobileNavItems.map((item) => (
                <Link
                  key={item.path}
                  to={item.path}
                  onClick={() => setIsMenuOpen(false)}
                  className={`block px-4 py-3 text-sm font-medium transition-colors ${
                    location.pathname === item.path
                      ? 'bg-gray-700 text-white'
                      : 'text-gray-300 hover:text-white hover:bg-gray-700'
                  }`}
                >
                  {item.label}
                </Link>
              ))}

              {/* Sign Out Button for Admin Users */}
              {isAdmin && (
                <>
                  <div className="border-t border-gray-600 my-2"></div>
                  <div className="px-4 py-2">
                    <div className="text-xs text-gray-400 mb-2">
                      Signed in as: {user?.email?.split('@')[0] || 'Admin'}
                    </div>
                    <button
                      onClick={() => {
                        signOut();
                        setIsMenuOpen(false);
                      }}
                      className="w-full text-left px-0 py-2 text-sm font-medium text-gray-300 hover:text-white transition-colors"
                    >
                      Sign Out
                    </button>
                  </div>
                </>
              )}
            </nav>
          </div>
        </>
      )}

    </div>
  );
};

export default Layout;
