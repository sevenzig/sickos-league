import React, { useState, useEffect } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { MultiLeagueApi } from '../../utils/multiLeagueApi';
import { getLeagueUrl } from '../../utils/urlUtils';
import SignInModal from '../auth/SignInModal';

const Header: React.FC = () => {
  const location = useLocation();
  const { user, signOut } = useAuth();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [showSignIn, setShowSignIn] = useState(false);
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin');
  const [userDropdownOpen, setUserDropdownOpen] = useState(false);
  const [userRole, setUserRole] = useState<'owner' | 'manager' | null>(null);

  // Extract league ID from current route
  const leagueIdMatch = location.pathname.match(/^\/leagues\/([^\/]+)/);
  const currentLeagueId = leagueIdMatch ? leagueIdMatch[1] : null;
  const isInLeagueRoute = !!currentLeagueId;

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Element;

      // Close mobile menu
      if (isMenuOpen && !target.closest('.mobile-menu') && !target.closest('.hamburger-button')) {
        setIsMenuOpen(false);
      }

      // Close user dropdown
      if (userDropdownOpen && !target.closest('.user-dropdown') && !target.closest('.user-dropdown-button')) {
        setUserDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isMenuOpen, userDropdownOpen]);

  // Close menu when route changes
  useEffect(() => {
    setIsMenuOpen(false);
    setUserDropdownOpen(false);
  }, [location.pathname]);

  // Load user role for current league
  useEffect(() => {
    const loadUserRole = async () => {
      if (currentLeagueId && user) {
        try {
          const leagueDetails = await MultiLeagueApi.getLeagueDetails(currentLeagueId);
          setUserRole(leagueDetails?.user_role || null);
        } catch (error) {
          console.error('Error loading user role:', error);
          setUserRole(null);
        }
      } else {
        setUserRole(null);
      }
    };

    loadUserRole();
  }, [currentLeagueId, user]);

  // Navigation items - conditional based on route
  const getMainNavItems = () => {
    const isHomeRoute = location.pathname === '/' || location.pathname === '/welcome';

    // /archive stays mounted in App.tsx (and linked from AdminDashboard); omit from header nav
    const baseItems = [
      { path: '/my-leagues', label: 'My Leagues', authRequired: true },
      { path: '/rules', label: 'Rules', authRequired: false }
    ];

    // Only add "Create League" on home routes
    if (isHomeRoute) {
      baseItems.splice(1, 0, { path: '/leagues/new', label: 'Create League', authRequired: true });
    }

    return baseItems;
  };

  // League admin item - only shown for league owners in league routes
  const leagueAdminItem = isInLeagueRoute && userRole === 'owner' && currentLeagueId ? {
    path: getLeagueUrl(currentLeagueId, 'admin'),
    label: 'Admin',
    authRequired: true
  } : null;

  const mainNavItems = getMainNavItems();
  const visibleNavItems = mainNavItems.filter(item => !item.authRequired || user);

  // Add league admin item if applicable
  if (leagueAdminItem && user) {
    visibleNavItems.push(leagueAdminItem);
  }


  return (
    <>
      <SignInModal
        isOpen={showSignIn}
        onClose={() => setShowSignIn(false)}
        initialMode={authMode}
        redirectOnSuccess
      />

      <header className="absolute top-0 left-0 right-0 z-50 bg-slate-900/90 backdrop-blur-sm border-b border-gray-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            {/* Logo */}
            <div className="flex items-center">
              <Link to="/" className="text-xl font-bold text-white hover:text-blue-300 transition-colors">
                Bad QB League
              </Link>
            </div>

            <div className="flex items-center space-x-4">
              {/* Desktop Navigation */}
              <div className="hidden md:block">
                <nav className="flex space-x-8">
                  {visibleNavItems.map((item) => (
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

              {/* Desktop Auth Controls */}
              <div className="hidden md:flex items-center space-x-3">
                {!user ? (
                  <>
                    <button
                      onClick={() => { setAuthMode('signin'); setShowSignIn(true); }}
                      className="px-3 py-2 text-sm text-gray-300 hover:text-white hover:bg-gray-700 rounded-md transition-colors"
                    >
                      Login
                    </button>
                    <button
                      onClick={() => { setAuthMode('signup'); setShowSignIn(true); }}
                      className="px-3 py-2 text-sm text-white bg-blue-600 hover:bg-blue-500 rounded-md transition-colors"
                    >
                      Register
                    </button>
                  </>
                ) : (
                  <div className="relative">
                    <button
                      className="user-dropdown-button flex items-center gap-2 px-3 py-2 text-sm text-gray-200 hover:text-white hover:bg-gray-700 rounded-md transition-colors"
                      onClick={() => setUserDropdownOpen(!userDropdownOpen)}
                    >
                      <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-gray-700 text-gray-300">
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                          <circle cx="12" cy="7" r="4" />
                        </svg>
                      </span>
                      <span className="text-xs font-medium">{user.email?.split('@')[0] || 'User'}</span>
                      <svg className={`w-3 h-3 transition-transform ${userDropdownOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>

                    {userDropdownOpen && (
                      <div className="user-dropdown absolute right-0 mt-2 w-48 rounded-md border border-gray-700 bg-slate-800 shadow-lg py-1 z-50">
                        <Link
                          to="/profile"
                          className="block px-3 py-2 text-sm text-gray-300 hover:bg-gray-700 hover:text-white"
                          onClick={() => setUserDropdownOpen(false)}
                        >
                          My Profile
                        </Link>
                        {isInLeagueRoute && userRole === 'owner' && currentLeagueId && (
                          <>
                            <div className="border-t border-gray-600 my-1"></div>
                            <Link
                              to={getLeagueUrl(currentLeagueId, 'admin')}
                              className="block px-3 py-2 text-sm text-gray-300 hover:bg-gray-700 hover:text-white"
                              onClick={() => setUserDropdownOpen(false)}
                            >
                              League Admin
                            </Link>
                          </>
                        )}
                        <div className="border-t border-gray-600 my-1"></div>
                        <button
                          onClick={() => {
                            signOut();
                            setUserDropdownOpen(false);
                          }}
                          className="w-full text-left px-3 py-2 text-sm text-gray-300 hover:bg-gray-700 hover:text-white"
                        >
                          Logout
                        </button>
                      </div>
                    )}
                  </div>
                )}
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
            <nav className="py-2">
              {visibleNavItems.map((item) => (
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

              {/* Mobile Auth Controls */}
              {!user ? (
                <>
                  <div className="border-t border-gray-600 my-2"></div>
                  <div className="px-4 py-2 grid grid-cols-2 gap-2">
                    <button
                      onClick={() => {
                        setAuthMode('signin');
                        setShowSignIn(true);
                        setIsMenuOpen(false);
                      }}
                      className="text-center px-3 py-2 text-sm text-gray-300 hover:text-white hover:bg-gray-700 rounded-md transition-colors"
                    >
                      Login
                    </button>
                    <button
                      onClick={() => {
                        setAuthMode('signup');
                        setShowSignIn(true);
                        setIsMenuOpen(false);
                      }}
                      className="text-center px-3 py-2 text-sm text-white bg-blue-600 hover:bg-blue-500 rounded-md transition-colors"
                    >
                      Register
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="border-t border-gray-600 my-2"></div>

                  <Link
                    to="/profile"
                    onClick={() => setIsMenuOpen(false)}
                    className="block px-4 py-3 text-sm font-medium text-gray-300 hover:text-white hover:bg-gray-700"
                  >
                    My Profile
                  </Link>

                  {/* League admin item in mobile dropdown when in league routes */}
                  {isInLeagueRoute && userRole === 'owner' && currentLeagueId && (
                    <>
                      <Link
                        to={getLeagueUrl(currentLeagueId, 'admin')}
                        onClick={() => setIsMenuOpen(false)}
                        className="block px-4 py-3 text-sm font-medium text-gray-300 hover:text-white hover:bg-gray-700"
                      >
                        League Admin
                      </Link>
                    </>
                  )}

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
                      Logout
                    </button>
                  </div>
                </>
              )}
            </nav>
          </div>
        </>
      )}
    </>
  );
};

export default Header;