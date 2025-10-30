import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

const CreatePrivateLeagueCard: React.FC = () => {
  const { user } = useAuth();

  return (
    <div className="bg-white/5 border border-slate-700 rounded-lg p-8">
      <div className="mb-6">
        <div className="w-8 h-8 bg-blue-600 rounded mb-4">
          <svg className="w-8 h-8 p-1.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 100 4m0-4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 100 4m0-4v2m0-6V4" />
          </svg>
        </div>
        <h3 className="text-xl font-medium text-white mb-3">Create a League</h3>
        <p className="text-slate-400 leading-relaxed">
          Be the commissioner! Set your own rules, invite your friends, and run your own Bad QB League exactly how you want it.
        </p>
      </div>

      <div className="space-y-3 mb-8">
        <div className="flex items-start text-slate-400">
          <div className="w-1 h-1 bg-slate-500 rounded-full mt-2.5 mr-3 flex-shrink-0"></div>
          <span className="text-sm">Full commissioner controls</span>
        </div>
        <div className="flex items-start text-slate-400">
          <div className="w-1 h-1 bg-slate-500 rounded-full mt-2.5 mr-3 flex-shrink-0"></div>
          <span className="text-sm">Invite friends privately</span>
        </div>
        <div className="flex items-start text-slate-400">
          <div className="w-1 h-1 bg-slate-500 rounded-full mt-2.5 mr-3 flex-shrink-0"></div>
          <span className="text-sm">Customize league settings</span>
        </div>
      </div>

      {user ? (
        <Link
          to="/leagues/new"
          className="block w-full text-center px-6 py-3 bg-blue-600 text-white font-medium rounded-md text-sm"
        >
          Create League
        </Link>
      ) : (
        <button
          onClick={() => {/* Auth will be handled by AuthContext */}}
          className="block w-full text-center px-6 py-3 bg-blue-600 text-white font-medium rounded-md text-sm"
        >
          Sign In to Create
        </button>
      )}
    </div>
  );
};

export default CreatePrivateLeagueCard;