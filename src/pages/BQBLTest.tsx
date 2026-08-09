import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { MultiLeagueApi, type League } from '../utils/multiLeagueApi';
import { Panel, Button, Badge, Alert, EmptyState, LoadingBlock } from '../components/ui';

const BQBLTest: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [leagues, setLeagues] = useState<League[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (user) loadLeagues();
  }, [user]);

  const loadLeagues = async () => {
    try {
      setLoading(true);
      const userLeagues = await MultiLeagueApi.getUserLeagues();
      setLeagues(userLeagues);
    } catch {
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
      const leagueId = await MultiLeagueApi.createLeague(
        `${user.email?.split('@')[0]}'s BQBL League`,
        2025,
        1
      );
      await loadLeagues();
      navigate(`/leagues/${leagueId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create league');
    } finally {
      setCreating(false);
    }
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
        <Panel className="w-full max-w-md text-center">
          <h1 className="text-title text-white mb-3">BQBL Test Environment</h1>
          <p className="text-body text-slate-400 mb-6">
            Welcome to the new multi-league BQBL system! Sign in to create and manage your
            fantasy football leagues.
          </p>
          {error && <Alert variant="error" className="mb-4">{error}</Alert>}
          <Button onClick={() => navigate('/')} className="w-full">
            Sign In
          </Button>
        </Panel>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 p-4">
      <div className="max-w-4xl mx-auto space-y-6">
        <div>
          <h1 className="text-display font-bold text-white mb-1">BQBL Multi-League System</h1>
          <p className="text-body text-slate-400">
            Welcome back, <span className="text-blue-400">{user.email}</span>
          </p>
        </div>

        {error && <Alert variant="error">{error}</Alert>}

        {/* Create league CTA */}
        <Panel className="border-blue-500/30 bg-blue-500/5">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div>
              <h2 className="text-heading text-white mb-1">Ready to Create Your League?</h2>
              <p className="text-body text-slate-400">
                Set up a new BQBL fantasy football league with the improved multi-league system.
              </p>
            </div>
            <Button onClick={handleCreateLeague} disabled={creating} size="lg">
              {creating ? 'Creating…' : 'Create New League'}
            </Button>
          </div>
        </Panel>

        {/* League list */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-heading text-white">Your Leagues</h2>
            {leagues.length > 0 && (
              <Button variant="secondary" size="sm" onClick={loadLeagues} disabled={loading}>
                {loading ? 'Refreshing…' : 'Refresh'}
              </Button>
            )}
          </div>

          {loading && leagues.length === 0 ? (
            <LoadingBlock message="Loading your leagues…" />
          ) : leagues.length === 0 ? (
            <EmptyState
              title="No leagues yet"
              description="Create your first league using the button above!"
            />
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {leagues.map((league) => (
                <Panel key={league.id} className="hover:shadow-panel-hover transition-all duration-200">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-label font-semibold text-white truncate">{league.name}</h3>
                    <Badge
                      className={
                        league.user_role === 'owner'
                          ? 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30'
                          : 'bg-blue-500/20 text-blue-400 border-blue-500/30'
                      }
                    >
                      {league.user_role}
                    </Badge>
                  </div>
                  <div className="space-y-1 text-caption text-slate-400 mb-4">
                    <div>Season: {league.season}</div>
                    <div>Teams per week: {league.teams_started_per_week}</div>
                    <div>Members: {league.member_count}</div>
                    <div>Fantasy teams: {league.fantasy_teams_count}</div>
                  </div>
                  <Button
                    variant="secondary"
                    size="sm"
                    className="w-full"
                    onClick={() => navigate(`/leagues/${league.id}`)}
                  >
                    View League
                  </Button>
                </Panel>
              ))}
            </div>
          )}
        </div>

        {/* Debug info */}
        <Panel>
          <details className="text-caption">
            <summary className="text-slate-400 cursor-pointer mb-2">🔧 Debug Information</summary>
            <div className="space-y-1 text-slate-500 mt-2">
              <div>Environment: Test/Development</div>
              <div>User ID: {user.id}</div>
              <div>Leagues loaded: {leagues.length}</div>
              <div>Infrastructure: Clean multi-league system</div>
            </div>
          </details>
        </Panel>
      </div>
    </div>
  );
};

export default BQBLTest;
