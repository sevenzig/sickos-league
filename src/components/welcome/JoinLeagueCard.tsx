import React from 'react';
import { Link } from 'react-router-dom';
import { Panel } from '@/components/ui/panel';
import { Button } from '@/components/ui/button';

const JoinLeagueCard: React.FC = () => {
  return (
    <Panel padding="default">
      <div className="mb-6">
        <div className="w-8 h-8 bg-primary rounded-md mb-4">
          <svg
            className="w-8 h-8 p-1.5 text-white"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z"
            />
          </svg>
        </div>
        <h3 className="text-heading text-white mb-3">Join a League</h3>
        <p className="text-body text-slate-400 leading-relaxed">
          Have an invite link from your commissioner? Open it, sign in or register, pick a team name, and you&apos;re in.
        </p>
      </div>

      <div className="space-y-4 mb-6">
        <div className="flex items-start gap-3 text-slate-400">
          <div className="w-1 h-1 bg-slate-500 rounded-full mt-2 flex-shrink-0" />
          <span className="text-label">Open the invite link they shared</span>
        </div>
        <div className="flex items-start gap-3 text-slate-400">
          <div className="w-1 h-1 bg-slate-500 rounded-full mt-2 flex-shrink-0" />
          <span className="text-label">Sign in or create an account</span>
        </div>
        <div className="flex items-start gap-3 text-slate-400">
          <div className="w-1 h-1 bg-slate-500 rounded-full mt-2 flex-shrink-0" />
          <span className="text-label">Choose a team name and join</span>
        </div>
      </div>

      <Button asChild variant="secondary" className="w-full">
        <Link to="/invite">Join with Invite Code</Link>
      </Button>
    </Panel>
  );
};

export default JoinLeagueCard;
