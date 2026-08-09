import React from 'react';
import { useLeagueData } from '../context/LeagueContext';
import Header from './layout/Header';

/*
  STANDARDIZED SPACING SYSTEM (layout layer — fixed):

  Header Clearance:
  - pt-24 = Header height + breathing room

  Section / stack:
  - space-y-4 = related items
  - space-y-6 = standard sections
  - space-y-8 = major section breaks

  Container:
  - px-4 sm:px-6 lg:px-8
  - Panel padding via <Panel size/padding> (density recipes for component internals)

  Component density (derived): see src/lib/density.ts
  Prefer <Panel>, <Button>, <PageChrome> from src/components/ui
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
          <p className="text-slate-300">Initializing...</p>
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
          <p className="text-slate-300">Loading league data...</p>
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
