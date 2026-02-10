import { startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval, format } from 'date-fns';
import { CalendarDay } from './CalendarDay';
import type { ProgramSessionResponse } from '@/types/api.types';

interface CalendarMonthViewProps {
  currentDate: Date;
  sessions: ProgramSessionResponse[];
  onSessionClick?: (session: ProgramSessionResponse) => void;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function CalendarMonthView({ currentDate, sessions, onSessionClick }: CalendarMonthViewProps) {
  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);
  const calendarStart = startOfWeek(monthStart);
  const calendarEnd = endOfWeek(monthEnd);
  const days = eachDayOfInterval({ start: calendarStart, end: calendarEnd });

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
            />
          );
        })}
      </div>
    </div>
  );
}
