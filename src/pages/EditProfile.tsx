import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { MultiLeagueApi, UserProfile as UserProfileType, EmailPreferences } from '../utils/multiLeagueApi';
import ProfilePhotoUpload from '../components/profile/ProfilePhotoUpload';
import { Panel, Button, Input, Alert, LoadingBlock } from '@/components/ui';

const EditProfile: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<UserProfileType | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [emailPreferences, setEmailPreferences] = useState<EmailPreferences>({
    marketing: false,
    league_updates: true,
    matchup_reminders: true,
    weekly_summaries: false
  });
  const [teamNames, setTeamNames] = useState<Record<string, string>>({});
  const [pendingPhotoUrl, setPendingPhotoUrl] = useState<string | null>(null);

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
      await MultiLeagueApi.updateUserProfile({
        first_name: firstName.trim() || undefined,
        last_name: lastName.trim() || undefined,
        profile_photo_url: pendingPhotoUrl !== null ? pendingPhotoUrl : undefined,
        email_preferences: emailPreferences
      });
      const teamUpdatePromises = Object.entries(teamNames).map(([teamId, teamName]) => {
        const originalTeam = profile?.fantasy_teams.find(t => t.team_id === teamId);
        if (originalTeam && teamName.trim() !== originalTeam.team_name) {
          return MultiLeagueApi.updateFantasyTeamName(teamId, teamName.trim());
        }
        return Promise.resolve(true);
      });
      await Promise.all(teamUpdatePromises);
      setSuccess(true);
      setTimeout(() => navigate('/profile'), 1500);
    } catch (err) {
      console.error('Error saving profile:', err);
      setError(err instanceof Error ? err.message : 'Failed to save profile');
    } finally {
      setSaving(false);
    }
  };

  const handlePhotoUpdated = (photoUrl: string | null) => {
    setPendingPhotoUrl(photoUrl);
    if (profile) {
      setProfile({ ...profile, profile_photo_url: photoUrl || undefined });
    }
  };

  const updateEmailPreference = (key: keyof EmailPreferences, value: boolean) => {
    setEmailPreferences(prev => ({ ...prev, [key]: value }));
  };

  const updateTeamName = (teamId: string, name: string) => {
    setTeamNames(prev => ({ ...prev, [teamId]: name }));
  };

  if (!user) {
    return (
      <div className="flex items-center justify-center py-24 text-center">
        <div>
          <p className="text-heading text-slate-300 mb-4">Please sign in to edit your profile</p>
          <Button asChild variant="ghost"><Link to="/">Go to home page</Link></Button>
        </div>
      </div>
    );
  }

  if (loading) return <LoadingBlock message="Loading profile..." />;

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-display text-slate-50">Edit Profile</h1>
          <p className="text-body text-slate-400 mt-1">Update your profile information and preferences</p>
        </div>
        <Button asChild variant="secondary">
          <Link to="/profile">Cancel</Link>
        </Button>
      </div>

      <form onSubmit={handleSave} className="space-y-8">
        {success && (
          <Alert variant="success">Profile updated successfully! Redirecting...</Alert>
        )}
        {error && (
          <Alert variant="error">{error}</Alert>
        )}

        {/* Profile Photo & Personal Information */}
        <Panel>
          <h3 className="text-heading text-slate-100 mb-4 pb-4 border-b border-slate-700/30">
            Profile &amp; Personal Information
          </h3>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div>
              <h4 className="text-label font-medium text-slate-200 mb-4">Profile Photo</h4>
              <ProfilePhotoUpload
                currentPhotoUrl={profile?.profile_photo_url ?? undefined}
                onPhotoUpdated={handlePhotoUpdated}
              />
            </div>
            <div className="space-y-4">
              <h4 className="text-label font-medium text-slate-200 mb-4">Personal Information</h4>
              <div className="space-y-1.5">
                <label htmlFor="email" className="text-label font-medium text-slate-300">
                  Email Address
                </label>
                <Input type="email" id="email" value={profile?.email || ''} disabled />
                <p className="text-caption text-slate-500">Email cannot be changed</p>
              </div>
              <div className="space-y-1.5">
                <label htmlFor="firstName" className="text-label font-medium text-slate-300">
                  First Name
                </label>
                <Input
                  type="text"
                  id="firstName"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  placeholder="Enter your first name"
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="lastName" className="text-label font-medium text-slate-300">
                  Last Name
                </label>
                <Input
                  type="text"
                  id="lastName"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  placeholder="Enter your last name"
                />
              </div>
            </div>
          </div>
        </Panel>

        {/* Fantasy Team Names */}
        {profile?.fantasy_teams && profile.fantasy_teams.length > 0 && (
          <Panel>
            <h3 className="text-heading text-slate-100 mb-4 pb-4 border-b border-slate-700/30">
              Fantasy Team Names
            </h3>
            <div className="space-y-4">
              {profile.fantasy_teams.map((team) => (
                <div key={team.team_id} className="space-y-1.5">
                  <label htmlFor={`team-${team.team_id}`} className="text-label font-medium text-slate-300">
                    {team.league_name}
                  </label>
                  <Input
                    type="text"
                    id={`team-${team.team_id}`}
                    value={teamNames[team.team_id] || ''}
                    onChange={(e) => updateTeamName(team.team_id, e.target.value)}
                    placeholder="Enter team name"
                    required
                  />
                </div>
              ))}
            </div>
          </Panel>
        )}

        {/* Email Preferences */}
        <Panel>
          <h3 className="text-heading text-slate-100 mb-4 pb-4 border-b border-slate-700/30">
            Email Preferences
          </h3>
          <div className="space-y-4">
            {([
              { key: 'league_updates' as keyof EmailPreferences, title: 'League Updates', description: 'Notifications about league events and changes' },
              { key: 'matchup_reminders' as keyof EmailPreferences, title: 'Matchup Reminders', description: 'Reminders to set your lineup before deadlines' },
              { key: 'weekly_summaries' as keyof EmailPreferences, title: 'Weekly Summaries', description: 'Weekly recap of your performance and league standings' },
              { key: 'marketing' as keyof EmailPreferences, title: 'Marketing', description: 'Promotional emails and product updates' },
            ]).map((pref) => (
              <div key={pref.key} className="flex items-center justify-between">
                <div className="flex-1">
                  <h4 className="text-label font-medium text-slate-200">{pref.title}</h4>
                  <p className="text-caption text-slate-400">{pref.description}</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={emailPreferences[pref.key]}
                    onChange={(e) => updateEmailPreference(pref.key, e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-600 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600" />
                </label>
              </div>
            ))}
          </div>
        </Panel>

        <div className="flex justify-end gap-4">
          <Button asChild variant="secondary">
            <Link to="/profile">Cancel</Link>
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>
      </form>
    </div>
  );
};

export default EditProfile;
