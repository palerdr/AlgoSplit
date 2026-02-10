import { startOfWeek, addDays, format } from 'date-fns';
import { CalendarDay } from './CalendarDay';
import type { ProgramSessionResponse } from '@/types/api.types';

interface CalendarWeekViewProps {
  currentDate: Date;
  sessions: ProgramSessionResponse[];
  onSessionClick?: (session: ProgramSessionResponse) => void;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function CalendarWeekView({ currentDate, sessions, onSessionClick }: CalendarWeekViewProps) {
  const weekStart = startOfWeek(currentDate);
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  // Group sessions by date
  const sessionsByDate = new Map<string, ProgramSessionResponse[]>();
  for (const session of sessions) {
    const dateKey = session.date;
    if (!sessionsByDate.has(dateKey)) {
      sessionsByDate.set(dateKey, []);
    }
    sessionsByDate.get(dateKey)!.push(session);
  }

  return (
    <div>
      <div className="grid grid-cols-7 mb-1">
        {WEEKDAYS.map((day) => (
          <div key={day} className="text-center text-[10px] sm:text-xs text-muted py-1 sm:py-2 font-medium">
            {day}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {days.map((day) => {
          const dateStr = format(day, 'yyyy-MM-dd');
          return (
            <CalendarDay
              key={dateStr}
              date={day}
              sessions={sessionsByDate.get(dateStr) || []}
              currentMonth={currentDate}
              onSessionClick={onSessionClick}
              expanded
            />
          );
        })}
      </div>
    </div>
  );
}
