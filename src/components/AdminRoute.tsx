import React from 'react';
import { useAuth } from '../context/AuthContext';
import ProtectedRoute from './ProtectedRoute';

interface AdminRouteProps {
  children: React.ReactNode;
}

/** Requires a signed-in platform admin (is_platform_admin). */
const AdminRoute: React.FC<AdminRouteProps> = ({ children }) => {
  const { isAdmin, loading } = useAuth();

  return (
    <ProtectedRoute>
      {loading ? null : isAdmin ? (
        <>{children}</>
      ) : (
        <div className="min-h-screen flex items-center justify-center p-6">
          <div className="bg-gradient-to-br from-slate-800/90 to-slate-900/90 backdrop-blur-xl rounded-2xl border border-slate-700/50 p-8 text-center max-w-md">
            <h1 className="text-xl font-semibold text-white mb-2">Platform admin required</h1>
            <p className="text-slate-400 text-sm">
              This page is only available to site administrators. League commissioners manage their
              leagues from League Admin.
            </p>
          </div>
        </div>
      )}
    </ProtectedRoute>
  );
};

export default AdminRoute;
