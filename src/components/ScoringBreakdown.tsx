import React from 'react';
import { QBPerformance } from '../utils/csvParser';
import TeamLogo from './TeamLogo';

interface ScoringBreakdownProps {
  teamName: string;
  week: number;
  selectedQBs: string[];
  qbBreakdown: { [qb: string]: QBPerformance };
  totalScore: number;
}

const ScoringBreakdown: React.FC<ScoringBreakdownProps> = ({
  teamName,
  week,
  selectedQBs,
  qbBreakdown,
  totalScore
}) => {
  return (
    <div className="bg-dark-card rounded-lg p-4 mb-4">
      <h3 className="text-lg font-semibold mb-3 flex items-center">
        <TeamLogo teamName={teamName} size="md" showName={true} className="mr-2" />
        - Week {week} Scoring Breakdown
      </h3>
      
      <div className="space-y-4">
        {selectedQBs.map(qb => {
          const performance = qbBreakdown[qb];
          if (!performance) {
            return (
              <div key={qb} className="bg-gray-700 rounded p-3">
                <div className="font-medium text-gray-300 flex items-center">
                  <TeamLogo teamName={qb} size="sm" showName={true} />
                </div>
                <div className="text-sm text-gray-400">No data available</div>
              </div>
            );
          }
          
          return (
            <div key={qb} className="bg-gray-700 rounded p-3">
              <div className="flex justify-between items-start mb-2">
                <TeamLogo teamName={qb} size="sm" showName={true} />
                <div className="text-lg font-bold text-yellow-400">
                  {performance.finalScore} pts
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <div className="text-gray-400">Pass Yards</div>
                  <div className="text-white">{performance.passYards}</div>
                </div>
                
                <div>
                  <div className="text-gray-400">Touchdowns</div>
                  <div className="text-white">{performance.touchdowns}</div>
                </div>
                
                <div>
                  <div className="text-gray-400">Completion %</div>
                  <div className="text-white">{performance.completionPercent.toFixed(1)}%</div>
                </div>
                
                <div>
                  <div className="text-gray-400">Turnovers</div>
                  <div className="text-white">{performance.turnovers}</div>
                </div>
              </div>
              
              {performance.events.length > 0 && (
                <div className="mt-2">
                  <div className="text-gray-400 text-sm mb-1">Events:</div>
                  <div className="flex flex-wrap gap-1">
                    {performance.events.map((event, index) => (
                      <span
                        key={index}
                        className="bg-red-600 text-white text-xs px-2 py-1 rounded"
                      >
                        {event}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
      
      <div className="mt-4 pt-4 border-t border-gray-600">
        <div className="flex justify-between items-center">
          <div className="text-lg font-semibold text-white">Total Score</div>
          <div className="text-2xl font-bold text-yellow-400">{totalScore} pts</div>
        </div>
      </div>
    </div>
  );
};

export default ScoringBreakdown;
