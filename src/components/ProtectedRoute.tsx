import React from 'react';
import AuthCheck from './auth/AuthCheck';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children }) => (
  <AuthCheck>{children}</AuthCheck>
);

export default ProtectedRoute;