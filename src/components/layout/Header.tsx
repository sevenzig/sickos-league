import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { MultiLeagueApi } from '../../utils/multiLeagueApi';
import { getLeagueUrl } from '../../utils/urlUtils';
import SignInModal from '../auth/SignInModal';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

const Header: React.FC = () => {
  const location = useLocation();
  const { user, signOut } = useAuth();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [showSignIn, setShowSignIn] = useState(false);
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin');
  const [userRole, setUserRole] = useState<'owner' | 'manager' | null>(null);

  const leagueIdMatch = location.pathname.match(/^\/leagues\/([^\/]+)/);
  const currentLeagueId = leagueIdMatch ? leagueIdMatch[1] : null;
  const isInLeagueRoute = !!currentLeagueId;

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Element;
      if (isMenuOpen && !target.closest('.mobile-menu') && !target.closest('.hamburger-button')) {
        setIsMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isMenuOpen]);

  useEffect(() => {
    setIsMenuOpen(false);
  }, [location.pathname]);

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

  const getMainNavItems = () => {
    const isHomeRoute = location.pathname === '/' || location.pathname === '/welcome';
    const baseItems = [
      { path: '/my-leagues', label: 'My Leagues', authRequired: true },
      { path: '/rules', label: 'Rules', authRequired: false },
    ];
    if (isHomeRoute) {
      baseItems.splice(1, 0, { path: '/leagues/new', label: 'Create League', authRequired: true });
    }
    return baseItems;
  };

  const leagueAdminItem =
    isInLeagueRoute && userRole === 'owner' && currentLeagueId
      ? { path: getLeagueUrl(currentLeagueId, 'admin'), label: 'Admin', authRequired: true }
      : null;

  const mainNavItems = getMainNavItems();
  const visibleNavItems = mainNavItems.filter((item) => !item.authRequired || user);
  if (leagueAdminItem && user) visibleNavItems.push(leagueAdminItem);

  const navLinkClass = (path: string) =>
    cn(
      'px-3 py-2 rounded-md text-label transition-colors',
      location.pathname === path
        ? 'bg-slate-700 text-white'
        : 'text-slate-300 hover:text-white hover:bg-slate-700'
    );

  return (
    <>
      <SignInModal
        isOpen={showSignIn}
        onClose={() => setShowSignIn(false)}
        initialMode={authMode}
        redirectOnSuccess
      />

      <header className="absolute top-0 left-0 right-0 z-50 bg-slate-900/90 backdrop-blur-sm border-b border-slate-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center">
              <Link to="/" className="text-heading font-bold text-white hover:text-blue-300 transition-colors">
                Bad QB League
              </Link>
            </div>

            <div className="flex items-center gap-4">
              <div className="hidden md:block">
                <nav className="flex gap-8">
                  {visibleNavItems.map((item) => (
                    <Link key={item.path} to={item.path} className={navLinkClass(item.path)}>
                      {item.label}
                    </Link>
                  ))}
                </nav>
              </div>

              <div className="hidden md:flex items-center gap-3">
                {!user ? (
                  <>
                    <Button variant="ghost" size="sm" onClick={() => { setAuthMode('signin'); setShowSignIn(true); }}>
                      Login
                    </Button>
                    <Button variant="primary" size="sm" onClick={() => { setAuthMode('signup'); setShowSignIn(true); }}>
                      Register
                    </Button>
                  </>
                ) : (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        className="flex items-center gap-2 px-3 py-2 text-label text-slate-200 hover:text-white hover:bg-slate-700 rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-slate-700 text-slate-300">
                          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                            <circle cx="12" cy="7" r="4" />
                          </svg>
                        </span>
                        <span className="text-caption font-medium">
                          {user.email?.split('@')[0] || 'User'}
                        </span>
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem asChild>
                        <Link to="/profile">My Profile</Link>
                      </DropdownMenuItem>
                      {isInLeagueRoute && userRole === 'owner' && currentLeagueId && (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem asChild>
                            <Link to={getLeagueUrl(currentLeagueId, 'admin')}>League Admin</Link>
                          </DropdownMenuItem>
                        </>
                      )}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => signOut()}>
                        Logout
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>

              <button
                type="button"
                onClick={() => setIsMenuOpen(!isMenuOpen)}
                className="hamburger-button md:hidden p-2 text-slate-300 hover:text-white hover:bg-slate-700 rounded-md transition-colors"
                aria-label="Toggle navigation menu"
              >
                <div className="w-6 h-6 flex flex-col justify-center items-center">
                  <span className={cn('block w-5 h-0.5 bg-current transition-all duration-300', isMenuOpen && 'rotate-45 translate-y-1')} />
                  <span className={cn('block w-5 h-0.5 bg-current transition-all duration-300 mt-1', isMenuOpen && 'opacity-0')} />
                  <span className={cn('block w-5 h-0.5 bg-current transition-all duration-300 mt-1', isMenuOpen && '-rotate-45 -translate-y-1')} />
                </div>
              </button>
            </div>
          </div>
        </div>
      </header>

      {isMenuOpen && (
        <>
          <div
            className="fixed inset-0 bg-black/50 z-40 md:hidden"
            onClick={() => setIsMenuOpen(false)}
          />
          <div className="mobile-menu fixed top-16 left-0 right-0 z-50 bg-slate-900/95 backdrop-blur-sm border-b border-slate-600 shadow-panel md:hidden">
            <nav className="py-2">
              {visibleNavItems.map((item) => (
                <Link
                  key={item.path}
                  to={item.path}
                  onClick={() => setIsMenuOpen(false)}
                  className={cn('block px-4 py-3', navLinkClass(item.path))}
                >
                  {item.label}
                </Link>
              ))}

              {!user ? (
                <>
                  <div className="border-t border-slate-600 my-2" />
                  <div className="px-4 py-2 grid grid-cols-2 gap-2">
                    <Button variant="ghost" size="sm" onClick={() => { setAuthMode('signin'); setShowSignIn(true); setIsMenuOpen(false); }}>
                      Login
                    </Button>
                    <Button variant="primary" size="sm" onClick={() => { setAuthMode('signup'); setShowSignIn(true); setIsMenuOpen(false); }}>
                      Register
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <div className="border-t border-slate-600 my-2" />
                  <Link
                    to="/profile"
                    onClick={() => setIsMenuOpen(false)}
                    className="block px-4 py-3 text-label font-medium text-slate-300 hover:text-white hover:bg-slate-700"
                  >
                    My Profile
                  </Link>
                  {isInLeagueRoute && userRole === 'owner' && currentLeagueId && (
                    <Link
                      to={getLeagueUrl(currentLeagueId, 'admin')}
                      onClick={() => setIsMenuOpen(false)}
                      className="block px-4 py-3 text-label font-medium text-slate-300 hover:text-white hover:bg-slate-700"
                    >
                      League Admin
                    </Link>
                  )}
                  <div className="border-t border-slate-600 my-2" />
                  <div className="px-4 py-2">
                    <div className="text-caption text-slate-400 mb-2">
                      Signed in as: {user?.email?.split('@')[0] || 'User'}
                    </div>
                    <button
                      type="button"
                      onClick={() => { signOut(); setIsMenuOpen(false); }}
                      className="w-full text-left px-0 py-2 text-label font-medium text-slate-300 hover:text-white transition-colors"
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
