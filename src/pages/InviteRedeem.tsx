import React from 'react';
import { useParams } from 'react-router-dom';
import AuthCheck from '../components/auth/AuthCheck';
import JoinWithCode from '../components/league/JoinWithCode';

const InviteRedeem: React.FC = () => {
  const { code } = useParams<{ code: string }>();

  return (
    <AuthCheck message="Sign in to join this league with your invite code.">
      <div className="py-12">
        <JoinWithCode initialCode={code || ''} />
      </div>
    </AuthCheck>
  );
};

export default InviteRedeem;
