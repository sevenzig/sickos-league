import React from 'react';
import { Link } from 'react-router-dom';

const JoinPublicLeagueCard: React.FC = () => {
  return (
    <div className="bg-white/5 border border-slate-700 rounded-lg p-6">
      <div className="mb-6">
        <div className="w-8 h-8 bg-blue-600 rounded mb-4">
          <svg className="w-8 h-8 p-1.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
          </svg>
        </div>
        <h3 className="text-xl font-medium text-white mb-3">Join a League</h3>
        <p className="text-slate-400 leading-relaxed">
          Have an invite code? Redeem it to join a private friend league and draft your NFL teams.
        </p>
      </div>

      <div className="space-y-4 mb-6">
        <div className="flex items-start text-slate-400">
          <div className="w-1 h-1 bg-slate-500 rounded-full mt-2.5 mr-3 flex-shrink-0"></div>
          <span className="text-sm">Enter the code your commissioner shared</span>
        </div>
        <div className="flex items-start text-slate-400">
          <div className="w-1 h-1 bg-slate-500 rounded-full mt-2.5 mr-3 flex-shrink-0"></div>
          <span className="text-sm">Pick a team name when you join</span>
        </div>
        <div className="flex items-start text-slate-400">
          <div className="w-1 h-1 bg-slate-500 rounded-full mt-2.5 mr-3 flex-shrink-0"></div>
          <span className="text-sm">Standard Bad QB rules</span>
        </div>
      </div>

      <Link
        to="/invite"
        className="block w-full text-center px-6 py-3 bg-blue-600 text-white font-medium rounded-md text-sm"
      >
        Join with Code
      </Link>
    </div>
  );
};

export default JoinPublicLeagueCard;