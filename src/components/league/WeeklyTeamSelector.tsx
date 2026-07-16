import React from 'react';

interface WeeklyTeamSelectorProps {
  value: number;
  onChange: (value: number) => void;
}

const WeeklyTeamSelector: React.FC<WeeklyTeamSelectorProps> = ({ value, onChange }) => {
  const options = [
    {
      value: 1,
      label: '1 Team per Week',
      description: 'Most conservative scoring - one team per week',
      difficulty: 'Easy'
    },
    {
      value: 2,
      label: '2 Teams per Week',
      description: 'Balanced scoring - two teams per week',
      difficulty: 'Medium'
    },
    {
      value: 3,
      label: '3 Teams per Week',
      description: 'Higher scoring - three teams per week',
      difficulty: 'Hard'
    },
    {
      value: 4,
      label: '4 Teams per Week',
      description: 'Maximum scoring - all four teams per week',
      difficulty: 'Expert'
    }
  ];

  const getDifficultyColor = (difficulty: string) => {
    switch (difficulty) {
      case 'Easy': return 'text-green-400';
      case 'Medium': return 'text-yellow-400';
      case 'Hard': return 'text-orange-400';
      case 'Expert': return 'text-red-400';
      default: return 'text-slate-400';
    }
  };

  return (
    <div className="mb-8">
      <label className="block text-lg font-medium text-white mb-3">
        Weekly Lineup Size
      </label>
      <p className="text-slate-400 mb-6 leading-relaxed">
        Choose how many NFL teams each player must start in their weekly lineup.
        Remember, each player drafts 4 total teams for their roster.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {options.map((option) => (
          <button
            key={option.value}
            onClick={() => onChange(option.value)}
            className={`p-4 border rounded-lg text-left transition-all ${
              value === option.value
                ? 'border-blue-600 bg-blue-600/10'
                : 'border-slate-600 bg-white/5 hover:border-slate-500'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-medium text-white">{option.label}</h3>
              <span className={`text-xs font-medium px-2 py-1 rounded ${getDifficultyColor(option.difficulty)} bg-current/10`}>
                {option.difficulty}
              </span>
            </div>
            <p className="text-sm text-slate-400 leading-relaxed">
              {option.description}
            </p>
          </button>
        ))}
      </div>

      <div className="mt-4 p-4 bg-slate-800/30 border border-slate-700 rounded-lg">
        <h4 className="text-sm font-medium text-white mb-2">How it works:</h4>
        <div className="text-xs text-slate-400 space-y-1">
          <div>• Players draft 4 NFL teams during the draft</div>
          <div>• Each week, players choose {value === 4 ? 'all 4' : value} of their teams to start</div>
          <div>• Scores are based on how poorly the selected quarterbacks perform</div>
        </div>
      </div>
    </div>
  );
};

export default WeeklyTeamSelector;