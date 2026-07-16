import React from 'react';
import { useLeagueData } from '../context/LeagueContext';
import Header from './layout/Header';

/*
  STANDARDIZED SPACING SYSTEM:

  Header Clearance:
  - pt-24 (6rem) = Header height (4rem) + breathing room (2rem)

  Component Spacing:
  - space-y-6 (1.5rem) = Standard vertical spacing between sections
  - space-y-8 (2rem) = Larger spacing for major sections
  - space-y-4 (1rem) = Tight spacing for related items

  Container Padding:
  - px-4 sm:px-6 lg:px-8 = Responsive horizontal padding
  - py-6 (1.5rem) = Standard vertical padding
  - py-8 (2rem) = Larger vertical padding for major containers

  Card/Component Internal:
  - p-4 (1rem) = Compact internal padding
  - p-6 (1.5rem) = Standard internal padding
  - p-8 (2rem) = Spacious internal padding

  Gaps:
  - gap-4 (1rem) = Standard grid/flex gap
  - gap-6 (1.5rem) = Larger grid/flex gap
  - gap-8 (2rem) = Major section gaps
*/

interface LayoutProps {
  children: React.ReactNode;
}

const Layout: React.FC<LayoutProps> = ({ children }) => {
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

  return (
    <div className="min-h-screen bg-dark-bg relative">
      <Header />

      {/* Main content with proper spacing for header and consistent padding */}
      <main className="w-full px-4 sm:px-6 lg:px-8 pt-24 pb-8">
        {children}
      </main>
    </div>
  );
};

export default Layout;
