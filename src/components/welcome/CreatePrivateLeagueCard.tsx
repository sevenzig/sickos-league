import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import SignInModal from '../auth/SignInModal';
import { Panel } from '@/components/ui/panel';
import { Button } from '@/components/ui/button';

const CreatePrivateLeagueCard: React.FC = () => {
  const { user } = useAuth();
  const [showSignIn, setShowSignIn] = useState(false);

  return (
    <>
      <SignInModal isOpen={showSignIn} onClose={() => setShowSignIn(false)} />
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
                d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 100 4m0-4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 100 4m0-4v2m0-6V4"
              />
            </svg>
          </div>
          <h3 className="text-heading text-white mb-3">Create a League</h3>
          <p className="text-body text-slate-400 leading-relaxed">
            Be the commissioner! Set your own rules, invite your friends, and run your own Bad QB
            League exactly how you want it.
          </p>
        </div>

        <div className="space-y-4 mb-6">
          <div className="flex items-start gap-3 text-slate-400">
            <div className="w-1 h-1 bg-slate-500 rounded-full mt-2 flex-shrink-0" />
            <span className="text-label">Full commissioner controls</span>
          </div>
          <div className="flex items-start gap-3 text-slate-400">
            <div className="w-1 h-1 bg-slate-500 rounded-full mt-2 flex-shrink-0" />
            <span className="text-label">Invite friends privately</span>
          </div>
          <div className="flex items-start gap-3 text-slate-400">
            <div className="w-1 h-1 bg-slate-500 rounded-full mt-2 flex-shrink-0" />
            <span className="text-label">Customize league settings</span>
          </div>
        </div>

        {user ? (
          <Button asChild className="w-full">
            <Link to="/leagues/new">Create League</Link>
          </Button>
        ) : (
          <Button className="w-full" onClick={() => setShowSignIn(true)}>
            Sign In to Create
          </Button>
        )}
      </Panel>
    </>
  );
};

export default CreatePrivateLeagueCard;
