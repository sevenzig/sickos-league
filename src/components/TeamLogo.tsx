import React from 'react';
import { getTeamLogo } from '../utils/teamLogos';

interface TeamLogoProps {
  teamName: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  showName?: boolean;
  fallbackText?: string;
}

const TeamLogo: React.FC<TeamLogoProps> = ({ 
  teamName, 
  size = 'md', 
  className = '', 
  showName = false,
  fallbackText 
}) => {
  const logoPath = getTeamLogo(teamName);
  
  const sizeClasses = {
    xs: 'w-4 h-4',
    sm: 'w-6 h-6',
    md: 'w-8 h-8', 
    lg: 'w-12 h-12',
    xl: 'w-16 h-16'
  };

  const textSizeClasses = {
    xs: 'text-xs',
    sm: 'text-xs',
    md: 'text-sm',
    lg: 'text-base',
    xl: 'text-lg'
  };

  if (!logoPath) {
    return (
      <div className={`flex items-center ${className}`}>
        <div className={`${sizeClasses[size]} bg-gray-600 rounded flex items-center justify-center flex-shrink-0`}>
          <span className={`${textSizeClasses[size]} text-gray-300 font-medium`}>
            {fallbackText || teamName.charAt(0)}
          </span>
        </div>
        {showName && (
          <span className={`ml-2 ${textSizeClasses[size]} font-medium leading-tight`}>
            {teamName}
          </span>
        )}
      </div>
    );
  }

  // Extract size classes from className if provided, otherwise use size prop
  const hasSizeInClassName = className && (className.includes('w-') || className.includes('h-'));
  const imgSizeClass = hasSizeInClassName 
    ? className.split(' ').filter(c => c.startsWith('w-') || c.startsWith('h-') || c.startsWith('md:')).join(' ')
    : sizeClasses[size];
  const wrapperClass = hasSizeInClassName ? '' : 'w-full h-full';

  return (
    <div className={`flex items-center justify-center ${wrapperClass} ${hasSizeInClassName ? '' : className}`}>
      <img 
        src={logoPath} 
        alt={`${teamName} logo`}
        className={`${imgSizeClass} object-contain flex-shrink-0 ${hasSizeInClassName ? className.replace(/\b(w-\S+|h-\S+|md:\S+)\b/g, '').trim() : ''}`}
        onError={(e) => {
          // Fallback to text if image fails to load
          const target = e.target as HTMLImageElement;
          target.style.display = 'none';
          const parent = target.parentElement;
          if (parent) {
            parent.innerHTML = `
              <div class="${sizeClasses[size]} bg-gray-600 rounded flex items-center justify-center flex-shrink-0">
                <span class="${textSizeClasses[size]} text-gray-300 font-medium">
                  ${fallbackText || teamName.charAt(0)}
                </span>
              </div>
            `;
          }
        }}
      />
      {showName && (
        <span className={`ml-2 ${textSizeClasses[size]} font-medium leading-tight`}>
          {teamName}
        </span>
      )}
    </div>
  );
};

export default TeamLogo;
