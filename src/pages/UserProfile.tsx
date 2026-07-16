import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { MultiLeagueApi, UserProfile as UserProfileType } from '../utils/multiLeagueApi';

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
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-xl font-medium text-slate-300 mb-4">Please sign in to view your profile</h2>
          <Link to="/" className="text-blue-400 hover:text-blue-300">
            Go to home page
          </Link>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-slate-400">Loading profile...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <div className="bg-red-900/20 border border-red-700 rounded-lg p-6 max-w-md">
            <h3 className="text-red-400 font-medium mb-2">Error Loading Profile</h3>
            <p className="text-slate-300">{error}</p>
            <button
              onClick={() => window.location.reload()}
              className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-500 transition-colors"
            >
              Try Again
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex justify-between items-start">
        <h1 className="text-3xl font-black text-slate-50 tracking-tight">My Profile</h1>
        <Link
          to="/profile/edit"
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-500 transition-colors font-medium"
        >
          Edit Profile
        </Link>
      </div>

      {/* Profile Card */}
      <div className="bg-gradient-to-br from-slate-800/90 to-slate-900/90 backdrop-blur-xl rounded-2xl border border-slate-700/50 shadow-[0_10px_30px_-10px_rgba(0,0,0,0.4)] overflow-hidden">
        <div className="p-8">
          {/* Profile Photo and Basic Info */}
          <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6">
            {/* Profile Photo */}
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

            {/* Basic Info */}
            <div className="flex-1 text-center sm:text-left">
              <h2 className="text-2xl font-bold text-slate-100 mb-2">{getDisplayName()}</h2>
              <p className="text-slate-400 mb-4">{profile?.email}</p>

              {/* Profile Completion Status */}
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-700/50 text-sm">
                <div className={`w-2 h-2 rounded-full ${
                  (profile?.first_name || profile?.last_name)
                    ? 'bg-green-400'
                    : 'bg-yellow-400'
                }`}></div>
                <span className="text-slate-300">
                  {(profile?.first_name || profile?.last_name)
                    ? 'Profile Complete'
                    : 'Profile Incomplete'
                  }
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Fantasy Teams */}
      {profile?.fantasy_teams && profile.fantasy_teams.length > 0 && (
        <div className="bg-gradient-to-br from-slate-800/90 to-slate-900/90 backdrop-blur-xl rounded-2xl border border-slate-700/50 shadow-[0_10px_30px_-10px_rgba(0,0,0,0.4)] overflow-hidden">
          <div className="p-6 border-b border-slate-700/30">
            <h3 className="text-xl font-bold text-slate-100">My Fantasy Teams</h3>
          </div>
          <div className="p-6">
            <div className="grid gap-4">
              {profile.fantasy_teams.map((team) => (
                <div key={team.team_id} className="flex items-center justify-between p-4 bg-slate-800/40 rounded-lg">
                  <div>
                    <h4 className="font-medium text-slate-200">{team.team_name}</h4>
                    <p className="text-sm text-slate-400">{team.league_name}</p>
                  </div>
                  <Link
                    to={`/leagues/${team.league_id}`}
                    className="text-blue-400 hover:text-blue-300 text-sm font-medium"
                  >
                    View League →
                  </Link>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Email Preferences */}
      <div className="bg-gradient-to-br from-slate-800/90 to-slate-900/90 backdrop-blur-xl rounded-2xl border border-slate-700/50 shadow-[0_10px_30px_-10px_rgba(0,0,0,0.4)] overflow-hidden">
        <div className="p-6 border-b border-slate-700/30">
          <h3 className="text-xl font-bold text-slate-100">Email Preferences</h3>
        </div>
        <div className="p-6">
          <div className="grid gap-4">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="font-medium text-slate-200">League Updates</h4>
                <p className="text-sm text-slate-400">Notifications about league events and changes</p>
              </div>
              <div className={`w-4 h-4 rounded-full ${
                profile?.email_preferences?.league_updates ? 'bg-green-400' : 'bg-slate-600'
              }`}></div>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <h4 className="font-medium text-slate-200">Matchup Reminders</h4>
                <p className="text-sm text-slate-400">Reminders to set your lineup before deadlines</p>
              </div>
              <div className={`w-4 h-4 rounded-full ${
                profile?.email_preferences?.matchup_reminders ? 'bg-green-400' : 'bg-slate-600'
              }`}></div>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <h4 className="font-medium text-slate-200">Weekly Summaries</h4>
                <p className="text-sm text-slate-400">Weekly recap of your performance and league standings</p>
              </div>
              <div className={`w-4 h-4 rounded-full ${
                profile?.email_preferences?.weekly_summaries ? 'bg-green-400' : 'bg-slate-600'
              }`}></div>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <h4 className="font-medium text-slate-200">Marketing</h4>
                <p className="text-sm text-slate-400">Promotional emails and product updates</p>
              </div>
              <div className={`w-4 h-4 rounded-full ${
                profile?.email_preferences?.marketing ? 'bg-green-400' : 'bg-slate-600'
              }`}></div>
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-slate-700/30">
            <Link
              to="/profile/edit"
              className="text-blue-400 hover:text-blue-300 text-sm font-medium"
            >
              Update preferences →
            </Link>
          </div>
        </div>
      </div>

      {/* Account Info */}
      <div className="bg-gradient-to-br from-slate-800/90 to-slate-900/90 backdrop-blur-xl rounded-2xl border border-slate-700/50 shadow-[0_10px_30px_-10px_rgba(0,0,0,0.4)] overflow-hidden">
        <div className="p-6 border-b border-slate-700/30">
          <h3 className="text-xl font-bold text-slate-100">Account Information</h3>
        </div>
        <div className="p-6">
          <div className="grid gap-4 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-400">Member since</span>
              <span className="text-slate-200">
                {profile?.created_at
                  ? new Date(profile.created_at).toLocaleDateString()
                  : 'Unknown'
                }
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Last updated</span>
              <span className="text-slate-200">
                {profile?.updated_at
                  ? new Date(profile.updated_at).toLocaleDateString()
                  : 'Never'
                }
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Total leagues</span>
              <span className="text-slate-200">{profile?.fantasy_teams?.length || 0}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default UserProfile;