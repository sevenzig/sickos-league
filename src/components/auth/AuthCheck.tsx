import React from 'react';
import { useAuth } from '../../context/AuthContext';
import SignInModal from './SignInModal';
import AuthForm from './AuthForm';

interface AuthCheckProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
  /** Shown in the default "Sign In Required" screen. Override per page for context. */
  message?: string;
  /**
   * When true, guests see AuthForm inline (no modal). Used on join/invite.
   * CreateLeague / ProtectedRoute keep the button + modal gate.
   */
  inline?: boolean;
}

const AuthCheck: React.FC<AuthCheckProps> = ({
  children,
  fallback,
  message = 'You need to be signed in to continue.',
  inline = false,
}) => {
  const { user, loading } = useAuth();
  const [showSignIn, setShowSignIn] = React.useState(false);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-slate-400">Checking authentication...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    if (inline) {
      return (
        <div className="max-w-md mx-auto">
          {fallback ?? (
            <>
              <p className="text-body text-slate-400 mb-6 text-center leading-relaxed">
                {message}
              </p>
              <AuthForm stackedActions />
            </>
          )}
        </div>
      );
    }

    return (
      <>
        <SignInModal isOpen={showSignIn} onClose={() => setShowSignIn(false)} />
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
          {fallback || (
            <div className="flex items-center justify-center min-h-screen px-8">
              <div className="max-w-md mx-auto text-center">
                <h1 className="text-2xl font-light text-white mb-6">Sign In Required</h1>
                <p className="text-slate-400 mb-8 leading-relaxed">
                  {message}
                </p>
                <button
                  onClick={() => setShowSignIn(true)}
                  className="px-8 py-4 bg-blue-600 text-white font-medium rounded-md"
                >
                  Sign In
                </button>
              </div>
            </div>
          )}
        </div>
      </>
    );
  }

  return <>{children}</>;
};

export default AuthCheck;
