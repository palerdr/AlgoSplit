import { useDroppable } from '@dnd-kit/core';
import { format, isToday, isSameMonth } from 'date-fns';
import { cn } from '@/lib/utils';
import { SessionCard } from './SessionCard';
import { useProgramStore } from '@/stores/programStore';
import type { ProgramSessionResponse } from '@/types/api.types';

interface CalendarDayProps {
  date: Date;
  sessions: ProgramSessionResponse[];
  currentMonth: Date;
  onSessionClick?: (session: ProgramSessionResponse) => void;
  expanded?: boolean;
}

export function CalendarDay({ date, sessions, currentMonth, onSessionClick, expanded = false }: CalendarDayProps) {
  const dateStr = format(date, 'yyyy-MM-dd');
  const { selectedDates, toggleSelectedDate } = useProgramStore();
  const isSelected = selectedDates.includes(dateStr);

  const { setNodeRef, isOver } = useDroppable({
    id: `day-${dateStr}`,
    data: { date: dateStr },
  });

  const inMonth = isSameMonth(date, currentMonth);
  const today = isToday(date);

  return (
    <div
      ref={setNodeRef}
      onClick={(e) => {
        if (e.ctrlKey || e.metaKey) {
          toggleSelectedDate(dateStr);
        }
      }}
      className={cn(
        'border border-white/5 p-1 transition-colors',
        expanded ? 'min-h-[120px]' : 'min-h-[80px]',
        !inMonth && 'opacity-40',
        isOver && 'bg-crimson/10 border-crimson/30',
        isSelected && 'bg-blue-500/10 border-blue-500/30',
      )}
    >
      <div className="flex items-center justify-between mb-1">
        <span
          className={cn(
            'text-xs w-6 h-6 flex items-center justify-center rounded-full',
            today ? 'bg-crimson text-white font-bold' : 'text-muted'
          )}
        >
          {format(date, 'd')}
        </span>
        {sessions.length > 0 && (
          <span className="text-[10px] text-muted">{sessions.length}</span>
        )}
      </div>
      <div className="space-y-0.5">
        {sessions.slice(0, expanded ? 6 : 3).map((session) => (
          <SessionCard
            key={session.id}
            session={session}
            onClick={() => onSessionClick?.(session)}
            compact={!expanded}
          />
        ))}
        {sessions.length > (expanded ? 6 : 3) && (
          <p className="text-[10px] text-muted text-center">
            +{sessions.length - (expanded ? 6 : 3)} more
          </p>
        )}
      </div>
    </div>
  );
}
