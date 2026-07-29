import React, { useEffect, useMemo, useRef, useState } from 'react';

interface DatetimeLocalPickerProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  min?: string;
  disabled?: boolean;
  hasError?: boolean;
}

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'] as const;

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function formatLocal(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function parseLocal(value: string): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function displayLabel(value: string): string {
  const d = parseLocal(value);
  if (!d) return 'Select date and time';
  return d.toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

const DatetimeLocalPicker: React.FC<DatetimeLocalPickerProps> = ({
  id,
  value,
  onChange,
  min,
  disabled = false,
  hasError = false,
}) => {
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const selected = parseLocal(value);
  const minDate = parseLocal(min ?? '');

  const initialView = selected ?? minDate ?? new Date();
  const [viewYear, setViewYear] = useState(initialView.getFullYear());
  const [viewMonth, setViewMonth] = useState(initialView.getMonth());

  const hour24 = selected?.getHours() ?? 12;
  const minute = selected?.getMinutes() ?? 0;
  const hour12 = hour24 % 12 || 12;
  const meridiem = hour24 >= 12 ? 'PM' : 'AM';

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  useEffect(() => {
    if (!open || !value) return;
    const s = parseLocal(value);
    if (!s) return;
    setViewYear(s.getFullYear());
    setViewMonth(s.getMonth());
  }, [open, value]);

  const calendarDays = useMemo(() => {
    const firstDow = new Date(viewYear, viewMonth, 1).getDay();
    const count = daysInMonth(viewYear, viewMonth);
    const prevCount = daysInMonth(viewYear, viewMonth - 1);
    const cells: { day: number; inMonth: boolean; date: Date }[] = [];

    for (let i = firstDow - 1; i >= 0; i -= 1) {
      const day = prevCount - i;
      cells.push({
        day,
        inMonth: false,
        date: new Date(viewYear, viewMonth - 1, day),
      });
    }
    for (let day = 1; day <= count; day += 1) {
      cells.push({
        day,
        inMonth: true,
        date: new Date(viewYear, viewMonth, day),
      });
    }
    let nextDay = 1;
    while (cells.length % 7 !== 0) {
      cells.push({
        day: nextDay,
        inMonth: false,
        date: new Date(viewYear, viewMonth + 1, nextDay),
      });
      nextDay += 1;
    }
    return cells;
  }, [viewYear, viewMonth]);

  const commit = (date: Date) => {
    if (minDate && date.getTime() < minDate.getTime()) return;
    onChange(formatLocal(date));
  };

  const pickDay = (date: Date) => {
    const next = new Date(date);
    next.setHours(hour24, minute, 0, 0);
    commit(next);
  };

  const setTime = (nextHour12: number, nextMinute: number, nextMeridiem: 'AM' | 'PM') => {
    const base = selected ? new Date(selected) : minDate ? new Date(minDate) : new Date();
    let h = nextHour12 % 12;
    if (nextMeridiem === 'PM') h += 12;
    base.setHours(h, nextMinute, 0, 0);
    commit(base);
  };

  const goPrevMonth = () => {
    if (viewMonth === 0) {
      setViewYear((y) => y - 1);
      setViewMonth(11);
    } else {
      setViewMonth((m) => m - 1);
    }
  };

  const goNextMonth = () => {
    if (viewMonth === 11) {
      setViewYear((y) => y + 1);
      setViewMonth(0);
    } else {
      setViewMonth((m) => m + 1);
    }
  };

  const monthLabel = new Date(viewYear, viewMonth, 1).toLocaleString(undefined, {
    month: 'long',
    year: 'numeric',
  });

  const today = new Date();
  const selectClass =
    'bg-slate-900 border border-slate-600 rounded-md text-white text-sm px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500';

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        id={id}
        disabled={disabled}
        onClick={() => !disabled && setOpen((o) => !o)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className={`w-full px-3 py-2 text-left bg-slate-800 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 ${
          hasError ? 'border-red-500' : 'border-slate-600'
        } ${value ? 'text-white' : 'text-slate-400'}`}
      >
        {displayLabel(value)}
      </button>

      {open && !disabled && (
        <div
          role="dialog"
          aria-label="Choose draft date and time"
          className="absolute z-50 mt-2 w-full min-w-[20rem] sm:min-w-[28rem] rounded-lg border border-slate-700 bg-slate-800 shadow-xl p-3"
        >
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-white">{monthLabel}</span>
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={goPrevMonth}
                    className="w-8 h-8 rounded-md text-slate-300 hover:bg-slate-700 hover:text-white"
                    aria-label="Previous month"
                  >
                    ‹
                  </button>
                  <button
                    type="button"
                    onClick={goNextMonth}
                    className="w-8 h-8 rounded-md text-slate-300 hover:bg-slate-700 hover:text-white"
                    aria-label="Next month"
                  >
                    ›
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-7 gap-0.5 mb-1">
                {WEEKDAYS.map((d) => (
                  <div key={d} className="text-center text-xs text-slate-400 py-1">
                    {d}
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-0.5">
                {calendarDays.map(({ day, inMonth, date }) => {
                  const disabledDay = Boolean(
                    minDate && startOfDay(date).getTime() < startOfDay(minDate).getTime()
                  );
                  const isSelected =
                    !!selected &&
                    date.getFullYear() === selected.getFullYear() &&
                    date.getMonth() === selected.getMonth() &&
                    date.getDate() === selected.getDate();
                  const isToday =
                    date.getFullYear() === today.getFullYear() &&
                    date.getMonth() === today.getMonth() &&
                    date.getDate() === today.getDate();

                  return (
                    <button
                      key={`${date.getFullYear()}-${date.getMonth()}-${day}-${inMonth}`}
                      type="button"
                      disabled={disabledDay || !inMonth}
                      onClick={() => pickDay(date)}
                      className={`h-8 text-sm rounded-md transition-colors ${
                        isSelected
                          ? 'bg-blue-600 text-white'
                          : isToday
                            ? 'text-white ring-1 ring-slate-500'
                            : inMonth
                              ? 'text-slate-200 hover:bg-slate-700'
                              : 'text-slate-600'
                      } disabled:opacity-30 disabled:hover:bg-transparent`}
                    >
                      {day}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="sm:border-l sm:border-slate-700 sm:pl-3 flex flex-col justify-start gap-2 min-w-[7.5rem]">
              <span className="text-xs font-medium text-slate-400 uppercase tracking-wide">Time</span>
              <div className="flex gap-1.5 items-center">
                <select
                  aria-label="Hour"
                  className={selectClass}
                  value={hour12}
                  onChange={(e) => setTime(Number(e.target.value), minute, meridiem)}
                >
                  {Array.from({ length: 12 }, (_, i) => i + 1).map((h) => (
                    <option key={h} value={h}>
                      {pad(h)}
                    </option>
                  ))}
                </select>
                <span className="text-slate-500">:</span>
                <select
                  aria-label="Minute"
                  className={selectClass}
                  value={minute}
                  onChange={(e) => setTime(hour12, Number(e.target.value), meridiem)}
                >
                  {Array.from({ length: 60 }, (_, i) => i).map((m) => (
                    <option key={m} value={m}>
                      {pad(m)}
                    </option>
                  ))}
                </select>
                <select
                  aria-label="AM/PM"
                  className={selectClass}
                  value={meridiem}
                  onChange={(e) => setTime(hour12, minute, e.target.value as 'AM' | 'PM')}
                >
                  <option value="AM">AM</option>
                  <option value="PM">PM</option>
                </select>
              </div>
            </div>
          </div>

          <div className="flex justify-between mt-3 pt-2 border-t border-slate-700">
            <button
              type="button"
              onClick={() => {
                onChange('');
                setOpen(false);
              }}
              className="text-sm text-blue-400 hover:text-blue-300"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={() => {
                const now = new Date();
                now.setSeconds(0, 0);
                commit(now);
              }}
              className="text-sm text-blue-400 hover:text-blue-300"
            >
              Today
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default DatetimeLocalPicker;
