import React from 'react';
import { photoUrl } from '../../utils/apiClient';

interface FantasyTeamAvatarProps {
  teamName: string;
  logoUrl?: string | null;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

const sizeClasses = {
  sm: 'w-6 h-6 text-xs',
  md: 'w-8 h-8 text-sm',
  lg: 'w-12 h-12 text-base',
  xl: 'w-20 h-20 text-2xl',
};

// Phase 5.2: fantasy team logo/avatar. Uploaded logo when set, otherwise the
// team's initials on a colored disc (deterministic per name).
const FantasyTeamAvatar: React.FC<FantasyTeamAvatarProps> = ({
  teamName,
  logoUrl,
  size = 'md',
  className = '',
}) => {
  if (logoUrl) {
    return (
      <img
        src={photoUrl(logoUrl)}
        alt={`${teamName} logo`}
        className={`${sizeClasses[size].split(' ').slice(0, 2).join(' ')} rounded-full object-cover flex-shrink-0 bg-slate-700 ${className}`}
      />
    );
  }

  const initials = teamName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(w => w.charAt(0).toUpperCase())
    .join('') || '?';

  // Stable hue from the team name so each team keeps its color
  let hash = 0;
  for (let i = 0; i < teamName.length; i++) {
    hash = (hash * 31 + teamName.charCodeAt(i)) | 0;
  }
  const hue = Math.abs(hash) % 360;

  return (
    <div
      className={`${sizeClasses[size]} rounded-full flex items-center justify-center flex-shrink-0 font-bold text-white ${className}`}
      style={{ backgroundColor: `hsl(${hue}, 45%, 35%)` }}
      aria-label={`${teamName} avatar`}
    >
      {initials}
    </div>
  );
};

export default FantasyTeamAvatar;
