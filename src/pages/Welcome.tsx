import React from 'react';
import { FEATURE_FLAGS } from '../utils/supabase';
import Header from '../components/layout/Header';
import WelcomeHero from '../components/welcome/WelcomeHero';
import JoinPublicLeagueCard from '../components/welcome/JoinPublicLeagueCard';
import CreatePrivateLeagueCard from '../components/welcome/CreatePrivateLeagueCard';
import FeatureOverview from '../components/welcome/FeatureOverview';

const Welcome: React.FC = () => {
  if (!FEATURE_FLAGS.ENABLE_MULTI_LEAGUE) {
    // Redirect to existing home page if multi-league is disabled
    return null;
  }

  return (
    <div className="fixed inset-0 w-screen h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 overflow-y-auto">
      <Header />

      {/* Main Content - starts below header with breathing room */}
      <div className="pt-24">
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