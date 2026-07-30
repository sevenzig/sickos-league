import React from 'react';

interface WeekNavigationProps {
  selectedWeek: number;
  currentWeek: number;
  onWeekChange: (week: number) => void;
  onGoToCurrentWeek: () => void;
}

const WeekNavigation: React.FC<WeekNavigationProps> = ({
  selectedWeek,
  currentWeek,
  onWeekChange,
  onGoToCurrentWeek
}) => {
  return (
    <div className="panel min-h-[74px] px-8 flex items-center">
      <div className="flex items-center justify-between w-full">
        <div className="flex items-center gap-2 sm:gap-4 min-w-0 flex-shrink">
          <h2 className="text-xl sm:text-2xl font-black text-slate-50 tracking-tight truncate">
            Week {selectedWeek}
          </h2>
          {selectedWeek === currentWeek ? (
            <span className="inline-flex items-center gap-1 px-2 sm:px-3 py-1.5 bg-emerald-500/20 text-emerald-400 rounded-lg border border-emerald-500/30 text-xs font-bold uppercase tracking-wider whitespace-nowrap">
              Current Week
            </span>
          ) : (
            <button
              onClick={onGoToCurrentWeek}
              className="inline-flex items-center gap-1 px-2 sm:px-3 py-1.5 bg-blue-500/20 text-blue-400 border border-blue-500/30 hover:bg-blue-500/30 rounded-lg transition-all duration-200 text-xs font-bold uppercase tracking-wider whitespace-nowrap"
            >
              Go to Current Week
            </button>
          )}
        </div>
        <div className="flex gap-2 sm:gap-3 flex-shrink-0">
          <button
            onClick={() => onWeekChange(Math.max(1, selectedWeek - 1))}
            className="px-3 sm:px-4 py-2 bg-slate-800/90 hover:bg-slate-700/50 text-slate-200 rounded-lg transition-all duration-200 font-medium text-sm sm:text-base whitespace-nowrap"
          >
            Previous
          </button>
          <button
            onClick={() => onWeekChange(Math.min(18, selectedWeek + 1))}
            className="px-3 sm:px-4 py-2 bg-slate-800/90 hover:bg-slate-700/50 text-slate-200 rounded-lg transition-all duration-200 font-medium text-sm sm:text-base whitespace-nowrap"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
};

export default WeekNavigation;