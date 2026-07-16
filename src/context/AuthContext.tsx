import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import {
  authGetUser,
  authSignIn,
  authSignUp,
  authSignOut,
  type ApiUser,
} from '../utils/apiClient';

export type User = ApiUser;

export interface Session {
  user: User;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: any }>;
  signUp: (email: string, password: string) => Promise<{ error: any }>;
  signOut: () => Promise<void>;
  isAdmin: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Restore session from the stored token
    const restore = async () => {
      try {
        const { user: currentUser, error } = await authGetUser();
        if (error) {
          console.error('Error restoring session:', error);
        }
        setUser(currentUser);
      } catch (error) {
        console.error('Session check failed:', error);
      } finally {
        setLoading(false);
      }
    };

    restore();
  }, []);

  const signIn = async (email: string, password: string) => {
    try {
      setLoading(true);
      const { user: signedInUser, error } = await authSignIn(email, password);
      if (error) {
        console.error('Sign in error:', error);
        return { error };
      }
      setUser(signedInUser);
      return { error: null };
    } catch (error) {
      console.error('Sign in failed:', error);
      return { error };
    } finally {
      setLoading(false);
    }
  };

  const signUp = async (email: string, password: string) => {
    try {
      setLoading(true);
      const { user: newUser, error } = await authSignUp(email, password);
      if (error) {
        console.error('Sign up error:', error);
        return { error };
      }
      setUser(newUser);
      return { error: null };
    } catch (error) {
      console.error('Sign up failed:', error);
      return { error };
    } finally {
      setLoading(false);
    }
  };

  const signOut = async () => {
    authSignOut();
    setUser(null);
  };

  // Platform admin (CSV import, migration, finalize_week_scores) — distinct from league commissioner
  const isAdmin = !!user?.is_platform_admin;

  const value: AuthContextType = {
    user,
    session: user ? { user } : null,
    loading,
    signIn,
    signUp,
    signOut,
    isAdmin,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}
