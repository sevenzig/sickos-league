import React from 'react';
import TeamLogo from './TeamLogo';
import { getDetailedScoringBreakdown } from '../utils/scoring';

interface MatchupModalProps {
  isOpen: boolean;
  onClose: () => void;
  matchupData: {
    week: number;
    team1: string;
    team2: string;
    team1Score: number;
    team2Score: number;
    team1Breakdown: Array<{
      qb: string;
      breakdown: any;
    }>;
    team2Breakdown: Array<{
      qb: string;
      breakdown: any;
    }>;
  } | null;
}

const MatchupModal: React.FC<MatchupModalProps> = ({ isOpen, onClose, matchupData }) => {
  if (!isOpen || !matchupData) return null;

  const { week, team1, team2, team1Score, team2Score, team1Breakdown, team2Breakdown } = matchupData;
  const hasData = team1Breakdown.length > 0 && team1Breakdown[0].breakdown !== null;

  const QBDetailCard: React.FC<{ qb: string; breakdown: any; teamName: string }> = ({ qb, breakdown, teamName }) => {
    if (!breakdown) {
      return (
        <div className="bg-gray-700 rounded-lg p-4 border-2 border-dashed border-gray-500">
          <div className="flex items-center justify-center mb-2">
            <TeamLogo teamName={qb} size="md" />
          </div>
          <div className="text-center text-gray-400 text-sm">Scores not available yet</div>
        </div>
      );
    }

    const scoringBreakdown = getDetailedScoringBreakdown({
      passYards: breakdown.passYards,
      touchdowns: breakdown.touchdowns,
      completionPercent: breakdown.completionPercent,
      turnovers: breakdown.turnovers,
      events: breakdown.events,
      longestPlay: breakdown.longestPlay,
      interceptions: breakdown.interceptions,
      fumbles: breakdown.fumbles,
      rushYards: breakdown.rushYards
    });

    return (
      <div className="bg-gray-700 rounded-lg p-4 hover:bg-gray-600 transition-colors">
        {/* QB Header */}
        <div className="flex items-center justify-center mb-3">
          <TeamLogo teamName={qb} size="md" />
        </div>
        
        {/* Total Score */}
        <div className="text-center mb-4">
          <div className="text-2xl font-bold text-blue-400">{breakdown.finalScore}</div>
          <div className="text-xs text-gray-400">Total Points</div>
        </div>

        {/* Detailed Breakdown */}
        <div className="space-y-2 text-xs">
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-gray-800 p-2 rounded">
              <div className="text-gray-300">Pass Yards</div>
              <div className="font-semibold">{breakdown.passYards}</div>
              <div className="text-blue-400">→ {scoringBreakdown.passYards} pts</div>
            </div>
            <div className="bg-gray-800 p-2 rounded">
              <div className="text-gray-300">Touchdowns</div>
              <div className="font-semibold">{breakdown.touchdowns}</div>
              <div className="text-blue-400">→ {scoringBreakdown.touchdowns} pts</div>
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-gray-800 p-2 rounded">
              <div className="text-gray-300">Completion %</div>
              <div className="font-semibold">{breakdown.completionPercent}%</div>
              <div className="text-blue-400">→ {scoringBreakdown.completionPercent} pts</div>
            </div>
            <div className="bg-gray-800 p-2 rounded">
              <div className="text-gray-300">Turnovers</div>
              <div className="font-semibold">{breakdown.interceptions + breakdown.fumbles}</div>
              <div className="text-blue-400">→ {scoringBreakdown.turnovers} pts</div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="bg-gray-800 p-2 rounded">
              <div className="text-gray-300">Interceptions</div>
              <div className="font-semibold">{breakdown.interceptions}</div>
              <div className="text-blue-400">→ {scoringBreakdown.interceptions} pts</div>
            </div>
            <div className="bg-gray-800 p-2 rounded">
              <div className="text-gray-300">Fumbles</div>
              <div className="font-semibold">{breakdown.fumbles}</div>
              <div className="text-blue-400">→ {scoringBreakdown.fumbles} pts</div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="bg-gray-800 p-2 rounded">
              <div className="text-gray-300">Longest Play</div>
              <div className="font-semibold">{breakdown.longestPlay}</div>
              <div className="text-blue-400">→ {scoringBreakdown.longestPlay} pts</div>
            </div>
            <div className="bg-gray-800 p-2 rounded">
              <div className="text-gray-300">Rush Yards</div>
              <div className="font-semibold">{breakdown.rushYards}</div>
              <div className="text-blue-400">→ {scoringBreakdown.rushYards} pts</div>
            </div>
          </div>

          {/* Special Events */}
          {(breakdown.defensiveTD > 0 || breakdown.safety > 0 || breakdown.gameEndingFumble > 0 || 
            breakdown.gameWinningDrive > 0 || breakdown.benching > 0) && (
            <div className="mt-3 pt-3 border-t border-gray-600">
              <div className="text-gray-300 text-center mb-2 font-semibold">Special Events</div>
              <div className="grid grid-cols-2 gap-2">
                {breakdown.defensiveTD > 0 && (
                  <div className="bg-gray-800 p-2 rounded">
                    <div className="text-gray-300">Defensive TD</div>
                    <div className="font-semibold">{breakdown.defensiveTD}</div>
                    <div className="text-blue-400">→ {breakdown.defensiveTD * 20} pts</div>
                  </div>
                )}
                {breakdown.safety > 0 && (
                  <div className="bg-gray-800 p-2 rounded">
                    <div className="text-gray-300">Safety</div>
                    <div className="font-semibold">{breakdown.safety}</div>
                    <div className="text-blue-400">→ {breakdown.safety * 15} pts</div>
                  </div>
                )}
                {breakdown.gameEndingFumble > 0 && (
                  <div className="bg-gray-800 p-2 rounded">
                    <div className="text-gray-300">GEF</div>
                    <div className="font-semibold">{breakdown.gameEndingFumble}</div>
                    <div className="text-blue-400">→ {breakdown.gameEndingFumble * 50} pts</div>
                  </div>
                )}
                {breakdown.gameWinningDrive > 0 && (
                  <div className="bg-gray-800 p-2 rounded">
                    <div className="text-gray-300">GWD</div>
                    <div className="font-semibold">{breakdown.gameWinningDrive}</div>
                    <div className="text-blue-400">→ {breakdown.gameWinningDrive * -12} pts</div>
                  </div>
                )}
                {breakdown.benching > 0 && (
                  <div className="bg-gray-800 p-2 rounded">
                    <div className="text-gray-300">Benching</div>
                    <div className="font-semibold">{breakdown.benching}</div>
                    <div className="text-blue-400">→ {breakdown.benching * 35} pts</div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center animate-fadeIn">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black bg-opacity-50 backdrop-blur-sm animate-fadeIn"
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className="relative bg-dark-card rounded-lg shadow-2xl max-w-6xl w-full mx-4 max-h-[90vh] overflow-y-auto animate-slideIn">
        {/* Header */}
        <div className="sticky top-0 bg-dark-card border-b border-gray-600 p-6 rounded-t-lg">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-bold">Week {week} Matchup</h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-white text-2xl font-bold transition-colors"
            >
              ×
            </button>
          </div>
          
          {/* Team vs Team Header */}
          <div className="flex items-center justify-center space-x-8">
            <div className="text-center">
              <TeamLogo teamName={team1} size="lg" showName={true} />
            </div>
            <div className="text-gray-400 text-2xl font-bold">vs</div>
            <div className="text-center">
              <TeamLogo teamName={team2} size="lg" showName={true} />
            </div>
          </div>
          
          {/* Total Scores */}
          <div className="flex items-center justify-center space-x-8 mt-4">
            <div className={`text-4xl font-bold ${
              hasData && team1Score > team2Score ? 'text-green-400' : 
              hasData && team1Score < team2Score ? 'text-red-400' : 'text-white'
            }`}>
              {team1Score}
            </div>
            <div className="text-gray-400 text-xl">Final Score</div>
            <div className={`text-4xl font-bold ${
              hasData && team2Score > team1Score ? 'text-green-400' : 
              hasData && team2Score < team1Score ? 'text-red-400' : 'text-white'
            }`}>
              {team2Score}
            </div>
          </div>
          
          {/* Winner */}
          {hasData && team1Score !== team2Score && (
            <div className="text-center mt-4">
              <span className="inline-block px-6 py-2 bg-green-600 text-white rounded-full text-lg font-semibold">
                Winner: {team1Score > team2Score ? team1 : team2}
              </span>
            </div>
          )}
        </div>

        {/* QB Breakdowns */}
        <div className="p-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Team 1 QBs */}
            <div>
              <h3 className="text-lg font-semibold mb-4 text-center">
                <TeamLogo teamName={team1} size="sm" showName={true} />
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {team1Breakdown.map(({ qb, breakdown }, index) => (
                  <QBDetailCard key={index} qb={qb} breakdown={breakdown} teamName={team1} />
                ))}
              </div>
            </div>
            
            {/* Team 2 QBs */}
            <div>
              <h3 className="text-lg font-semibold mb-4 text-center">
                <TeamLogo teamName={team2} size="sm" showName={true} />
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {team2Breakdown.map(({ qb, breakdown }, index) => (
                  <QBDetailCard key={index} qb={qb} breakdown={breakdown} teamName={team2} />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MatchupModal;
