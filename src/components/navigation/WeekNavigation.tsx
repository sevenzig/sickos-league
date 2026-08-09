import React from 'react';
import { Panel } from '@/components/ui/panel';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

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
    <Panel padding="none" className="min-h-[74px] px-8 flex items-center">
      <div className="flex items-center justify-between w-full">
        <div className="flex items-center gap-2 sm:gap-4 min-w-0 flex-shrink">
          <h2 className="text-xl sm:text-2xl font-bold text-slate-50 tracking-tight truncate">
            Week {selectedWeek}
          </h2>
          {selectedWeek === currentWeek ? (
            <Badge variant="success" className="whitespace-nowrap uppercase tracking-wider">
              Current Week
            </Badge>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              onClick={onGoToCurrentWeek}
              className="whitespace-nowrap"
            >
              Go to Current Week
            </Button>
          )}
        </div>
        <div className="flex gap-2 sm:gap-3 flex-shrink-0">
          <Button
            variant="secondary"
            size="md"
            onClick={() => onWeekChange(Math.max(1, selectedWeek - 1))}
          >
            Previous
          </Button>
          <Button
            variant="secondary"
            size="md"
            onClick={() => onWeekChange(Math.min(18, selectedWeek + 1))}
          >
            Next
          </Button>
        </div>
      </div>
    </Panel>
  );
};

export default WeekNavigation;
