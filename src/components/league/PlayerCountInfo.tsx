import React from 'react';

const PlayerCountInfo: React.FC = () => {
  return (
    <div className="mb-8 p-6 bg-blue-600/10 border border-blue-600/20 rounded-lg">
      <div className="flex items-start">
        <div className="w-6 h-6 bg-blue-600 rounded flex-shrink-0 mt-0.5 mr-4">
          <svg className="w-6 h-6 p-1 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <div>
          <h3 className="text-lg font-medium text-white mb-2">League Requirements</h3>
          <p className="text-slate-300 leading-relaxed mb-3">
            Your league needs <strong className="text-white">8 total players</strong> to start. As the commissioner,
            you'll need to invite <strong className="text-white">7 additional players</strong> before the season begins.
          </p>
          <div className="space-y-2 text-sm text-slate-400">
            <div className="flex items-center">
              <div className="w-1.5 h-1.5 bg-blue-400 rounded-full mr-3"></div>
              <span>Each player drafts 4 NFL teams for their roster</span>
            </div>
            <div className="flex items-center">
              <div className="w-1.5 h-1.5 bg-blue-400 rounded-full mr-3"></div>
              <span>Players set weekly lineups based on your league settings</span>
            </div>
            <div className="flex items-center">
              <div className="w-1.5 h-1.5 bg-blue-400 rounded-full mr-3"></div>
              <span>You can invite players after creating the league</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PlayerCountInfo;