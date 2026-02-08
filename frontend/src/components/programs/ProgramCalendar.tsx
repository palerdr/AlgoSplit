import { CalendarHeader } from './CalendarHeader';
import { CalendarMonthView } from './CalendarMonthView';
import { CalendarWeekView } from './CalendarWeekView';
import { useProgramStore } from '@/stores/programStore';
import type { ProgramSessionResponse } from '@/types/api.types';

interface ProgramCalendarProps {
  programId: string;
  sessions: ProgramSessionResponse[];
  onSessionClick?: (session: ProgramSessionResponse) => void;
}

export function ProgramCalendar({ programId, sessions, onSessionClick }: ProgramCalendarProps) {
  const { calendarView, calendarDate } = useProgramStore();
  const currentDate = new Date(calendarDate);

  return (
    <>
      <CalendarHeader />
      {calendarView === 'month' ? (
        <CalendarMonthView
          currentDate={currentDate}
          sessions={sessions}
          onSessionClick={onSessionClick}
        />
      ) : (
        <CalendarWeekView
          currentDate={currentDate}
          sessions={sessions}
          onSessionClick={onSessionClick}
        />
      )}
    </>
  );
}
