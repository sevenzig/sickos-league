import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { MultiLeagueApi, UserProfile as UserProfileType, EmailPreferences } from '../utils/multiLeagueApi';
import ProfilePhotoUpload from '../components/profile/ProfilePhotoUpload';

const EditProfile: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<UserProfileType | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Form data
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [emailPreferences, setEmailPreferences] = useState<EmailPreferences>({
    marketing: false,
    league_updates: true,
    matchup_reminders: true,
    weekly_summaries: false
  });
  const [teamNames, setTeamNames] = useState<Record<string, string>>({});

  useEffect(() => {
    const loadProfile = async () => {
      if (!user) return;

      try {
        setLoading(true);
        setError(null);
        const profileData = await MultiLeagueApi.getUserProfile();

        if (profileData) {
          setProfile(profileData);
          setFirstName(profileData.first_name || '');
          setLastName(profileData.last_name || '');
          setEmailPreferences(profileData.email_preferences);

          // Initialize team names
          const initialTeamNames: Record<string, string> = {};
          profileData.fantasy_teams.forEach(team => {
            initialTeamNames[team.team_id] = team.team_name;
          });
          setTeamNames(initialTeamNames);
        }
      } catch (err) {
        console.error('Error loading profile:', err);
        setError(err instanceof Error ? err.message : 'Failed to load profile');
      } finally {
        setLoading(false);
      }
    };

    loadProfile();
  }, [user]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(false);

    try {
      // Update profile (including photo URL if changed)
      await MultiLeagueApi.updateUserProfile({
        first_name: firstName.trim() || undefined,
        last_name: lastName.trim() || undefined,
        profile_photo_url: pendingPhotoUrl !== null ? pendingPhotoUrl : undefined,
        email_preferences: emailPreferences
      });

      // Update team names
      const teamUpdatePromises = Object.entries(teamNames).map(([teamId, teamName]) => {
        const originalTeam = profile?.fantasy_teams.find(t => t.team_id === teamId);
        if (originalTeam && teamName.trim() !== originalTeam.team_name) {
          return MultiLeagueApi.updateFantasyTeamName(teamId, teamName.trim());
        }
        return Promise.resolve(true);
      });

      await Promise.all(teamUpdatePromises);

      setSuccess(true);
      setTimeout(() => {
        navigate('/profile');
      }, 1500);
    } catch (err) {
      console.error('Error saving profile:', err);
      setError(err instanceof Error ? err.message : 'Failed to save profile');
    } finally {
      setSaving(false);
    }
  };

  const [pendingPhotoUrl, setPendingPhotoUrl] = useState<string | null>(null);

  const handlePhotoUpdated = (photoUrl: string | null) => {
    setPendingPhotoUrl(photoUrl);
    if (profile) {
      setProfile({
        ...profile,
        profile_photo_url: photoUrl || undefined
      });
    }
  };

  const updateEmailPreference = (key: keyof EmailPreferences, value: boolean) => {
    setEmailPreferences(prev => ({
      ...prev,
      [key]: value
    }));
  };

  const updateTeamName = (teamId: string, name: string) => {
    setTeamNames(prev => ({
      ...prev,
      [teamId]: name
    }));
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-xl font-medium text-slate-300 mb-4">Please sign in to edit your profile</h2>
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

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-black text-slate-50 tracking-tight">Edit Profile</h1>
          <p className="text-slate-400 mt-2">Update your profile information and preferences</p>
        </div>
        <Link
          to="/profile"
          className="px-4 py-2 bg-slate-700 text-slate-200 rounded-md hover:bg-slate-600 transition-colors font-medium"
        >
          Cancel
        </Link>
      </div>

      <form onSubmit={handleSave} className="space-y-8">
        {/* Success Message */}
        {success && (
          <div className="bg-green-600/10 border border-green-600/20 rounded-lg p-4">
            <div className="flex items-center gap-3">
              <div className="w-6 h-6 rounded-full bg-green-600/20 flex items-center justify-center">
                <svg className="w-4 h-4 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <p className="text-green-400 font-medium">Profile updated successfully! Redirecting...</p>
            </div>
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div className="bg-red-600/10 border border-red-600/20 rounded-lg p-4">
            <p className="text-red-400">{error}</p>
          </div>
        )}

        {/* Profile Photo & Personal Information - Combined */}
        <div className="bg-gradient-to-br from-slate-800/90 to-slate-900/90 backdrop-blur-xl rounded-2xl border border-slate-700/50 shadow-[0_10px_30px_-10px_rgba(0,0,0,0.4)] overflow-hidden">
          <div className="p-6 border-b border-slate-700/30">
            <h3 className="text-xl font-bold text-slate-100">Profile & Personal Information</h3>
          </div>
          <div className="p-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* Profile Photo Column */}
              <div>
                <h4 className="text-lg font-medium text-slate-200 mb-4">Profile Photo</h4>
                <ProfilePhotoUpload
                  currentPhotoUrl={profile?.profile_photo_url ?? undefined}
                  onPhotoUpdated={handlePhotoUpdated}
                />
              </div>

              {/* Personal Information Column */}
              <div className="space-y-6">
                <h4 className="text-lg font-medium text-slate-200 mb-4">Personal Information</h4>

                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-slate-300 mb-2">
                    Email Address
                  </label>
                  <input
                    type="email"
                    id="email"
                    value={profile?.email || ''}
                    disabled
                    className="w-full px-3 py-2 bg-slate-700/50 border border-slate-600 rounded-md text-slate-400 cursor-not-allowed"
                  />
                  <p className="text-slate-500 text-xs mt-1">Email cannot be changed</p>
                </div>

                <div className="grid grid-cols-1 gap-4">
                  <div>
                    <label htmlFor="firstName" className="block text-sm font-medium text-slate-300 mb-2">
                      First Name
                    </label>
                    <input
                      type="text"
                      id="firstName"
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      className="w-full px-3 py-2 bg-white/5 border border-slate-600 rounded-md text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent"
                      placeholder="Enter your first name"
                    />
                  </div>

                  <div>
                    <label htmlFor="lastName" className="block text-sm font-medium text-slate-300 mb-2">
                      Last Name
                    </label>
                    <input
                      type="text"
                      id="lastName"
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      className="w-full px-3 py-2 bg-white/5 border border-slate-600 rounded-md text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent"
                      placeholder="Enter your last name"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Fantasy Team Names */}
        {profile?.fantasy_teams && profile.fantasy_teams.length > 0 && (
          <div className="bg-gradient-to-br from-slate-800/90 to-slate-900/90 backdrop-blur-xl rounded-2xl border border-slate-700/50 shadow-[0_10px_30px_-10px_rgba(0,0,0,0.4)] overflow-hidden">
            <div className="p-6 border-b border-slate-700/30">
              <h3 className="text-xl font-bold text-slate-100">Fantasy Team Names</h3>
            </div>
            <div className="p-6 space-y-4">
              {profile.fantasy_teams.map((team) => (
                <div key={team.team_id}>
                  <label htmlFor={`team-${team.team_id}`} className="block text-sm font-medium text-slate-300 mb-2">
                    {team.league_name}
                  </label>
                  <input
                    type="text"
                    id={`team-${team.team_id}`}
                    value={teamNames[team.team_id] || ''}
                    onChange={(e) => updateTeamName(team.team_id, e.target.value)}
                    className="w-full px-3 py-2 bg-white/5 border border-slate-600 rounded-md text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent"
                    placeholder="Enter team name"
                    required
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Email Preferences */}
        <div className="bg-gradient-to-br from-slate-800/90 to-slate-900/90 backdrop-blur-xl rounded-2xl border border-slate-700/50 shadow-[0_10px_30px_-10px_rgba(0,0,0,0.4)] overflow-hidden">
          <div className="p-6 border-b border-slate-700/30">
            <h3 className="text-xl font-bold text-slate-100">Email Preferences</h3>
          </div>
          <div className="p-6 space-y-4">
            {[
              {
                key: 'league_updates' as keyof EmailPreferences,
                title: 'League Updates',
                description: 'Notifications about league events and changes'
              },
              {
                key: 'matchup_reminders' as keyof EmailPreferences,
                title: 'Matchup Reminders',
                description: 'Reminders to set your lineup before deadlines'
              },
              {
                key: 'weekly_summaries' as keyof EmailPreferences,
                title: 'Weekly Summaries',
                description: 'Weekly recap of your performance and league standings'
              },
              {
                key: 'marketing' as keyof EmailPreferences,
                title: 'Marketing',
                description: 'Promotional emails and product updates'
              }
            ].map((pref) => (
              <div key={pref.key} className="flex items-center justify-between">
                <div className="flex-1">
                  <h4 className="font-medium text-slate-200">{pref.title}</h4>
                  <p className="text-sm text-slate-400">{pref.description}</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={emailPreferences[pref.key]}
                    onChange={(e) => updateEmailPreference(pref.key, e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-600 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                </label>
              </div>
            ))}
          </div>
        </div>

        {/* Save Button */}
        <div className="flex justify-end gap-4">
          <Link
            to="/profile"
            className="px-6 py-2 bg-slate-700 text-slate-200 rounded-md hover:bg-slate-600 transition-colors font-medium"
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={saving}
            className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default EditProfile;