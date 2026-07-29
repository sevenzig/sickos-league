import React from 'react';
import { Navigate } from 'react-router-dom';
import Header from '../components/layout/Header';
import WelcomeHero from '../components/welcome/WelcomeHero';
import JoinLeagueCard from '../components/welcome/JoinLeagueCard';
import CreatePrivateLeagueCard from '../components/welcome/CreatePrivateLeagueCard';
import FeatureOverview from '../components/welcome/FeatureOverview';
import { useAuth } from '../context/AuthContext';

const Welcome: React.FC = () => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-slate-400">Checking authentication...</p>
        </div>
      </div>
    );
  }

  if (user) {
    return <Navigate to="/my-leagues" replace />;
  }

  return (
    <div className="fixed inset-0 w-screen h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 overflow-y-auto">
      <Header />

      <div className="pt-24">
        <WelcomeHero />

        <div className="py-12 px-8">
          <div className="max-w-4xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-8">
            <JoinLeagueCard />
            <CreatePrivateLeagueCard />
          </div>
        </div>

        <FeatureOverview />
      </div>
    </div>
  );
};

export default Welcome;
