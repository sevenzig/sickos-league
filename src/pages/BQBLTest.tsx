import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { MultiLeagueApi, type League } from '../utils/multiLeagueApi';

// Simple Button component
const Button: React.FC<{
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
  variant?: 'default' | 'outline';
  size?: 'sm' | 'md' | 'lg';
  children: React.ReactNode;
}> = ({ onClick, disabled, className = '', variant = 'default', size = 'md', children }) => {
  const baseClass = 'inline-flex items-center justify-center rounded font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-slate-900 disabled:opacity-50 disabled:cursor-not-allowed';

  const variantClass = variant === 'outline'
    ? 'border border-slate-600 bg-transparent hover:bg-slate-800 text-white'
    : 'bg-blue-600 hover:bg-blue-700 text-white';

  const sizeClass = size === 'sm' ? 'px-3 py-1.5 text-sm' : size === 'lg' ? 'px-6 py-3 text-lg' : 'px-4 py-2';

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`${baseClass} ${variantClass} ${sizeClass} ${className}`}
    >
      {children}
    </button>
  );
};

// Simple Card component
const Card: React.FC<{
  className?: string;
  children: React.ReactNode;
}> = ({ className = '', children }) => {
  return (
    <div className={`bg-slate-800 border border-slate-700 rounded-lg shadow-sm ${className}`}>
      {children}
    </div>
  );
};

const BQBLTest: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [leagues, setLeagues] = useState<League[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);

  // Load user's leagues when authenticated
  useEffect(() => {
    if (user) {
      loadLeagues();
    }
  }, [user]);

  const loadLeagues = async () => {
    try {
      setLoading(true);
      const userLeagues = await MultiLeagueApi.getUserLeagues();
      setLeagues(userLeagues);
    } catch (err) {
      console.error('Error loading leagues:', err);
      setError('Failed to load leagues');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateLeague = async () => {
    if (!user) return;

    try {
      setCreating(true);
      setError('');

      // Create a test league
      const leagueId = await MultiLeagueApi.createLeague(
        `${user.email?.split('@')[0]}'s BQBL League`,
        2025,
        1
      );

      console.log('Created league:', leagueId);

      // Reload leagues to show the new one
      await loadLeagues();

      // Navigate to the league dashboard
      navigate(`/leagues/${leagueId}`);
    } catch (err) {
      console.error('Error creating league:', err);
      setError(err instanceof Error ? err.message : 'Failed to create league');
    } finally {
      setCreating(false);
    }
  };

  const handleSignIn = () => {
    navigate('/');
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
        <Card className="w-full max-w-md p-8 text-center">
          <h1 className="text-3xl font-bold text-white mb-4">
            🏈 BQBL Test Environment
          </h1>
          <p className="text-slate-300 mb-8">
            Welcome to the new multi-league BQBL system! Sign in to create and manage your fantasy football leagues.
          </p>

          {error && (
            <div className="bg-red-500/10 border border-red-500 text-red-400 px-4 py-3 rounded mb-4">
              {error}
            </div>
          )}

          <Button
            onClick={handleSignIn}
            className="w-full bg-blue-600 hover:bg-blue-700"
          >
            Sign In
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 p-4">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-white mb-2">
            🏈 BQBL Multi-League System
          </h1>
          <p className="text-slate-300">
            Welcome back, <span className="text-blue-400">{user.email}</span>
          </p>
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500 text-red-400 px-4 py-3 rounded mb-6">
            {error}
          </div>
        )}

        {/* Create League CTA */}
        <Card className="p-6 mb-8 bg-gradient-to-r from-blue-600/20 to-purple-600/20 border-blue-500/30">
          <div className="flex flex-col md:flex-row items-center justify-between">
            <div className="mb-4 md:mb-0">
              <h2 className="text-2xl font-bold text-white mb-2">
                Ready to Create Your League?
              </h2>
              <p className="text-slate-300">
                Set up a new BQBL fantasy football league with the improved multi-league system.
              </p>
            </div>
            <Button
              onClick={handleCreateLeague}
              disabled={creating}
              className="bg-blue-600 hover:bg-blue-700 px-8 py-3 text-lg font-medium"
            >
              {creating ? 'Creating...' : 'Create New League'}
            </Button>
          </div>
        </Card>

        {/* User's Leagues */}
        <div>
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold text-white">Your Leagues</h2>
            {leagues.length > 0 && (
              <Button
                onClick={loadLeagues}
                disabled={loading}
                variant="outline"
                size="sm"
              >
                {loading ? 'Refreshing...' : 'Refresh'}
              </Button>
            )}
          </div>

          {loading && leagues.length === 0 ? (
            <Card className="p-8 text-center">
              <div className="text-slate-400">Loading your leagues...</div>
            </Card>
          ) : leagues.length === 0 ? (
            <Card className="p-8 text-center">
              <div className="text-slate-400 mb-4">
                You haven't created or joined any leagues yet.
              </div>
              <p className="text-sm text-slate-500">
                Create your first league using the button above!
              </p>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {leagues.map((league) => (
                <Card key={league.id} className="p-6 hover:bg-slate-800/50 transition-colors">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-lg font-semibold text-white truncate">
                      {league.name}
                    </h3>
                    <span className={`px-2 py-1 text-xs rounded-full ${
                      league.user_role === 'owner'
                        ? 'bg-yellow-500/20 text-yellow-400'
                        : 'bg-blue-500/20 text-blue-400'
                    }`}>
                      {league.user_role}
                    </span>
                  </div>

                  <div className="space-y-2 text-sm text-slate-300 mb-4">
                    <div>Season: {league.season}</div>
                    <div>Teams per week: {league.teams_started_per_week}</div>
                    <div>Members: {league.member_count}</div>
                    <div>Fantasy teams: {league.fantasy_teams_count}</div>
                  </div>

                  <Button
                    onClick={() => navigate(`/leagues/${league.id}`)}
                    className="w-full bg-slate-700 hover:bg-slate-600"
                    size="sm"
                  >
                    View League
                  </Button>
                </Card>
              ))}
            </div>
          )}
        </div>

        {/* Debug Info */}
        <Card className="mt-8 p-4 bg-slate-800/50">
          <details className="text-sm">
            <summary className="text-slate-400 cursor-pointer mb-2">
              🔧 Debug Information
            </summary>
            <div className="space-y-2 text-slate-500">
              <div>Environment: Test/Development</div>
              <div>User ID: {user.id}</div>
              <div>Leagues loaded: {leagues.length}</div>
              <div>Infrastructure: Clean multi-league system</div>
              <div>Database: Fantasy teams, league matchups, fantasy lineups</div>
            </div>
          </details>
        </Card>
      </div>
    </div>
  );
};

export default BQBLTest;