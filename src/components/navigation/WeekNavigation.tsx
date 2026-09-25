import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Panel } from '@/components/ui/panel';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

interface WeekNavigationProps {
  selectedWeek: number;
  currentWeek: number;
  onWeekChange: (week: number) => void;
  onGoToCurrentWeek: () => void;
  maxWeek?: number;
}

const WeekNavigation: React.FC<WeekNavigationProps> = ({
  selectedWeek,
  currentWeek,
  onWeekChange,
  onGoToCurrentWeek,
  maxWeek = 14,
}) => {
  const isCurrentWeek = selectedWeek === currentWeek;

  return (
    <Panel padding="none" className="min-h-[74px] px-4 sm:px-8 flex items-center">
      {/* Mobile: centered week scrubber */}
      <div className="grid grid-cols-[auto_1fr_auto] items-center gap-2 w-full sm:hidden">
        <Button
          variant="secondary"
          size="md"
          aria-label="Previous week"
          onClick={() => onWeekChange(Math.max(1, selectedWeek - 1))}
          disabled={selectedWeek <= 1}
        >
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <div className="flex flex-col items-center justify-center min-w-0 text-center">
          <h2 className="text-xl font-bold text-slate-50 tracking-tight truncate max-w-full">
            Week {selectedWeek}
          </h2>
          {isCurrentWeek ? (
            <Badge variant="success" className="mt-1 whitespace-nowrap uppercase tracking-wider">
              Current Week
            </Badge>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              onClick={onGoToCurrentWeek}
              className="mt-0.5"
            >
              Current
            </Button>
          )}
        </div>
        <Button
          variant="secondary"
          size="md"
          aria-label="Next week"
          onClick={() => onWeekChange(Math.min(maxWeek, selectedWeek + 1))}
          disabled={selectedWeek >= maxWeek}
        >
          <ChevronRight className="h-5 w-5" />
        </Button>
      </div>

      {/* Desktop: single-row chrome */}
      <div className="hidden sm:flex items-center justify-between w-full">
        <div className="flex items-center gap-2 sm:gap-4 min-w-0 flex-shrink">
          <h2 className="text-xl sm:text-2xl font-bold text-slate-50 tracking-tight truncate">
            Week {selectedWeek}
          </h2>
          {isCurrentWeek ? (
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
            disabled={selectedWeek <= 1}
          >
            Previous
          </Button>
          <Button
            variant="secondary"
            size="md"
            onClick={() => onWeekChange(Math.min(maxWeek, selectedWeek + 1))}
            disabled={selectedWeek >= maxWeek}
          >
            Next
          </Button>
        </div>
      </div>
    </Panel>
  );
};

export default WeekNavigation;
