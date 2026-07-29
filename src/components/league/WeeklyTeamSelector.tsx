import React from 'react';

interface WeeklyTeamSelectorProps {
  value: number;
  onChange: (value: number) => void;
}

const OPTIONS = [
  { value: 1, label: '1 Team per Week' },
  { value: 2, label: '2 Teams per Week' },
  { value: 3, label: '3 Teams per Week' },
  { value: 4, label: '4 Teams per Week' },
];

const WeeklyTeamSelector: React.FC<WeeklyTeamSelectorProps> = ({ value, onChange }) => {
  return (
    <div className="mb-8">
      <label className="block text-lg font-medium text-white mb-3">
        Weekly Lineup Size
      </label>
      <p className="text-slate-400 mb-4 leading-relaxed">
        Choose how many NFL teams each player must start in their weekly lineup.
        Remember, each player drafts 4 total teams for their roster.
      </p>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {OPTIONS.map((option) => {
          const selected = value === option.value;
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={selected}
              onClick={() => onChange(option.value)}
              className={`px-3 py-3 border rounded-lg text-center transition-all ${
                selected
                  ? 'border-amber-400 bg-amber-400/15 text-amber-100'
                  : 'border-slate-600 bg-white/5 text-white hover:border-slate-500'
              }`}
            >
              <span className="font-medium text-sm">{option.label}</span>
            </button>
          );
        })}
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
