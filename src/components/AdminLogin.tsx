import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';

const AdminLogin: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { signIn } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    const { error } = await signIn(email, password);

    if (error) {
      setError(error.message || 'Login failed. Please check your credentials.');
    }

    setIsLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="bg-gradient-to-br from-slate-800/90 to-slate-900/90 backdrop-blur-xl rounded-3xl border border-slate-700/50 shadow-[0_20px_60px_-15px_rgba(0,0,0,0.5)] px-8 py-6 mb-6">
          <h1 className="text-2xl font-black text-slate-50 tracking-tight text-center">Admin Access</h1>
          <p className="text-slate-400 mt-2 text-center">Sign in to manage lineups and league settings</p>
        </div>

        {/* Login Form */}
        <div className="bg-gradient-to-br from-slate-800/90 to-slate-900/90 backdrop-blur-xl rounded-2xl border border-slate-700/50 shadow-[0_10px_30px_-10px_rgba(0,0,0,0.4)] p-6 md:p-8">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label htmlFor="email" className="block text-sm font-bold text-slate-300 mb-3 uppercase tracking-wider">
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full px-4 py-3 bg-slate-800/60 border border-slate-600/50 rounded-lg text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all duration-200"
                placeholder="admin@example.com"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-bold text-slate-300 mb-3 uppercase tracking-wider">
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full px-4 py-3 bg-slate-800/60 border border-slate-600/50 rounded-lg text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all duration-200"
                placeholder="Enter your password"
              />
            </div>

            {error && (
              <div className="p-4 rounded-lg border bg-rose-500/10 border-rose-500/30 text-rose-400">
                <p className="text-sm font-medium">{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading || !email || !password}
              className="w-full bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white py-3 px-6 rounded-lg font-bold transition-all duration-200 disabled:from-slate-600 disabled:to-slate-700 disabled:cursor-not-allowed disabled:opacity-50 shadow-lg hover:shadow-xl"
            >
              {isLoading ? (
                <span className="flex items-center justify-center gap-2">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  Signing In...
                </span>
              ) : (
                'Sign In'
              )}
            </button>
          </form>

          <div className="mt-8 pt-6 border-t border-slate-700/30">
            <p className="text-sm text-slate-400 text-center">
              Need access? Contact your league administrator.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminLogin;