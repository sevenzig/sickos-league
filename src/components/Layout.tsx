import React from 'react';
import { Link, useLocation } from 'react-router-dom';

interface LayoutProps {
  children: React.ReactNode;
}

const Layout: React.FC<LayoutProps> = ({ children }) => {
  const location = useLocation();

  const navItems = [
    { path: '/', label: 'Home', icon: '🏠' },
    { path: '/rosters', label: 'Rosters', icon: '👥' },
    { path: '/lineups', label: 'Lineups', icon: '⚙️' },
    { path: '/scores', label: 'Scores', icon: '📊' },
    { path: '/rules', label: 'Rules', icon: '📋' }
  ];

  return (
    <div className="min-h-screen bg-dark-bg">
      {/* Header */}
      <header className="bg-dark-surface border-b border-gray-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center">
              <h1 className="text-xl font-bold text-white">Bad QB League</h1>
            </div>
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
