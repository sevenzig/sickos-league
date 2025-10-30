import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { FEATURE_FLAGS } from '../utils/supabase';
import WelcomeHero from '../components/welcome/WelcomeHero';
import JoinPublicLeagueCard from '../components/welcome/JoinPublicLeagueCard';
import CreatePrivateLeagueCard from '../components/welcome/CreatePrivateLeagueCard';
import FeatureOverview from '../components/welcome/FeatureOverview';

const Welcome: React.FC = () => {
  const { user, signOut, isAdmin } = useAuth();
  const location = useLocation();
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  if (!FEATURE_FLAGS.ENABLE_MULTI_LEAGUE) {
    // Redirect to existing home page if multi-league is disabled
    return null;
  }

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

  // Navigation items
  const publicNavItems = [
    { path: '/scores', label: 'Scores' },
    { path: '/rules', label: 'Rules' }
  ];

  const authNavItems = user ? [
    { path: '/my-leagues', label: 'My Leagues' },
    { path: '/leagues/new', label: 'Create League' }
  ] : [];

  const adminNavItems = isAdmin ? [
    { path: '/admin', label: 'Legacy Admin' }
  ] : [];

  const desktopNavItems = [...publicNavItems, ...authNavItems, ...adminNavItems];
  const mobileNavItems = [...publicNavItems, ...authNavItems, ...(isAdmin ? [
    { path: '/admin', label: 'Legacy Admin Dashboard' },
    { path: '/admin/lineups', label: 'Legacy Manage Lineups' },
    { path: '/admin/import', label: 'Legacy Import Data' },
    { path: '/admin/migration', label: 'Legacy Data Migration' }
  ] : [])];

  return (
    <div className="fixed inset-0 w-screen h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 overflow-y-auto">
      {/* Header */}
      <header className="absolute top-0 left-0 right-0 z-50 bg-slate-900/90 backdrop-blur-sm border-b border-gray-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center">
              <h1 className="text-xl font-bold text-white">Bad QB League</h1>
            </div>
            <div className="flex items-center space-x-4">
              {/* Desktop Navigation */}
              <div className="hidden md:block">
                <nav className="flex space-x-8">
                  {desktopNavItems.map((item) => (
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

              {/* Desktop Sign Out */}
              {user && (
                <div className="hidden md:flex items-center space-x-4">
                  <div className="text-xs text-gray-400">
                    {user.email?.split('@')[0] || 'User'}
                  </div>
                  <button
                    onClick={signOut}
                    className="px-3 py-2 text-sm text-gray-300 hover:text-white hover:bg-gray-700 rounded-md transition-colors"
                  >
                    Sign Out
                  </button>
                </div>
              )}

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

      {/* Mobile Menu */}
      {isMenuOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black bg-opacity-50 z-40 md:hidden"
            onClick={() => setIsMenuOpen(false)}
          ></div>

          {/* Menu Panel */}
          <div className="mobile-menu fixed top-16 left-0 right-0 z-50 bg-slate-900/95 backdrop-blur-sm border-b border-gray-600 shadow-xl md:hidden">
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

              {/* Sign Out Button for Users */}
              {user && (
                <>
                  <div className="border-t border-gray-600 my-2"></div>
                  <div className="px-4 py-2">
                    <div className="text-xs text-gray-400 mb-2">
                      Signed in as: {user?.email?.split('@')[0] || 'User'}
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

      {/* Main Content - starts below header */}
      <div className="pt-16">
        {/* Hero Section */}
        <WelcomeHero />

        {/* League Entry Cards */}
        <div className="py-12 px-8">
          <div className="max-w-4xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-8">
            <JoinPublicLeagueCard />
            <CreatePrivateLeagueCard />
          </div>
        </div>

        {/* Feature Overview */}
        <FeatureOverview />
      </div>
    </div>
  );
};

export default Welcome;