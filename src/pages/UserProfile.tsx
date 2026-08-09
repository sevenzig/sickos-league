import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { MultiLeagueApi, UserProfile as UserProfileType } from '../utils/multiLeagueApi';
import { Panel, Button, Badge, Alert, LoadingBlock } from '@/components/ui';

const UserProfile: React.FC = () => {
  const { user } = useAuth();
  const [profile, setProfile] = useState<UserProfileType | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadProfile = async () => {
      if (!user) return;
      try {
        setLoading(true);
        setError(null);
        const profileData = await MultiLeagueApi.getUserProfile();
        setProfile(profileData);
      } catch (err) {
        console.error('Error loading profile:', err);
        setError(err instanceof Error ? err.message : 'Failed to load profile');
      } finally {
        setLoading(false);
      }
    };
    loadProfile();
  }, [user]);

  const getDisplayName = () => {
    if (profile?.first_name || profile?.last_name) {
      return `${profile.first_name || ''} ${profile.last_name || ''}`.trim();
    }
    return profile?.email?.split('@')[0] || 'User';
  };

  const getInitials = () => {
    if (profile?.first_name || profile?.last_name) {
      const first = profile.first_name?.charAt(0) || '';
      const last = profile.last_name?.charAt(0) || '';
      return (first + last).toUpperCase();
    }
    return profile?.email?.charAt(0).toUpperCase() || 'U';
  };

  if (!user) {
    return (
      <div className="flex items-center justify-center py-24 text-center">
        <div>
          <p className="text-heading text-slate-300 mb-4">Please sign in to view your profile</p>
          <Button asChild variant="ghost">
            <Link to="/">Go to home page</Link>
          </Button>
        </div>
      </div>
    );
  }

  if (loading) return <LoadingBlock message="Loading profile..." />;

  if (error) {
    return (
      <div className="flex items-center justify-center py-24">
        <Panel className="max-w-md w-full">
          <Alert variant="error" title="Error Loading Profile" className="mb-4">{error}</Alert>
          <Button onClick={() => window.location.reload()}>Try Again</Button>
        </Panel>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-start">
        <h1 className="text-display text-slate-50">My Profile</h1>
        <Button asChild>
          <Link to="/profile/edit">Edit Profile</Link>
        </Button>
      </div>

      {/* Profile Card */}
      <Panel>
        <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6">
          <div className="flex-shrink-0">
            {profile?.profile_photo_url ? (
              <img
                src={profile.profile_photo_url}
                alt="Profile"
                className="w-24 h-24 sm:w-32 sm:h-32 rounded-full object-cover border-4 border-slate-600"
              />
            ) : (
              <div className="w-24 h-24 sm:w-32 sm:h-32 rounded-full bg-gradient-to-br from-slate-700 to-slate-800 border-4 border-slate-600 flex items-center justify-center">
                <span className="text-xl sm:text-2xl font-bold text-slate-300">{getInitials()}</span>
              </div>
            )}
          </div>
          <div className="flex-1 text-center sm:text-left">
            <h2 className="text-title text-slate-100 mb-2">{getDisplayName()}</h2>
            <p className="text-body text-slate-400 mb-4">{profile?.email}</p>
            <Badge variant={(profile?.first_name || profile?.last_name) ? 'success' : 'warning'}>
              {(profile?.first_name || profile?.last_name) ? 'Profile Complete' : 'Profile Incomplete'}
            </Badge>
          </div>
        </div>
      </Panel>

      {/* Fantasy Teams */}
      {profile?.fantasy_teams && profile.fantasy_teams.length > 0 && (
        <Panel>
          <h3 className="text-heading text-slate-100 mb-4 pb-4 border-b border-slate-700/30">My Fantasy Teams</h3>
          <div className="grid gap-4">
            {profile.fantasy_teams.map((team) => (
              <div key={team.team_id} className="flex items-center justify-between p-4 bg-slate-800/40 rounded-lg">
                <div>
                  <h4 className="text-label font-medium text-slate-200">{team.team_name}</h4>
                  <p className="text-caption text-slate-400">{team.league_name}</p>
                </div>
                <Link
                  to={`/leagues/${team.league_id}`}
                  className="text-blue-400 hover:text-blue-300 text-label font-medium"
                >
                  View League →
                </Link>
              </div>
            ))}
          </div>
        </Panel>
      )}

      {/* Email Preferences */}
      <Panel>
        <h3 className="text-heading text-slate-100 mb-4 pb-4 border-b border-slate-700/30">Email Preferences</h3>
        <div className="grid gap-4">
          {([
            { key: 'league_updates', label: 'League Updates', desc: 'Notifications about league events and changes' },
            { key: 'matchup_reminders', label: 'Matchup Reminders', desc: 'Reminders to set your lineup before deadlines' },
            { key: 'weekly_summaries', label: 'Weekly Summaries', desc: 'Weekly recap of your performance and standings' },
            { key: 'marketing', label: 'Marketing', desc: 'Promotional emails and product updates' },
          ] as const).map(({ key, label, desc }) => (
            <div key={key} className="flex items-center justify-between">
              <div>
                <h4 className="text-label font-medium text-slate-200">{label}</h4>
                <p className="text-caption text-slate-400">{desc}</p>
              </div>
              <div className={`w-4 h-4 rounded-full ${
                profile?.email_preferences?.[key] ? 'bg-green-400' : 'bg-slate-600'
              }`} />
            </div>
          ))}
        </div>
        <div className="mt-6 pt-4 border-t border-slate-700/30">
          <Link to="/profile/edit" className="text-blue-400 hover:text-blue-300 text-label font-medium">
            Update preferences →
          </Link>
        </div>
      </Panel>

      {/* Account Info */}
      <Panel>
        <h3 className="text-heading text-slate-100 mb-4 pb-4 border-b border-slate-700/30">Account Information</h3>
        <div className="grid gap-4">
          <div className="flex justify-between text-label">
            <span className="text-slate-400">Member since</span>
            <span className="text-slate-200">
              {profile?.created_at ? new Date(profile.created_at).toLocaleDateString() : 'Unknown'}
            </span>
          </div>
          <div className="flex justify-between text-label">
            <span className="text-slate-400">Last updated</span>
            <span className="text-slate-200">
              {profile?.updated_at ? new Date(profile.updated_at).toLocaleDateString() : 'Never'}
            </span>
          </div>
          <div className="flex justify-between text-label">
            <span className="text-slate-400">Total leagues</span>
            <span className="text-slate-200">{profile?.fantasy_teams?.length || 0}</span>
          </div>
        </div>
      </Panel>
    </div>
  );
};

export default UserProfile;
