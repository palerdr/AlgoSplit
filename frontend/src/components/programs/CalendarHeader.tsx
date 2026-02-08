import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui';
import { format, addMonths, subMonths, addWeeks, subWeeks } from 'date-fns';
import { useProgramStore } from '@/stores/programStore';

export function CalendarHeader() {
  const { calendarView, calendarDate, setCalendarView, setCalendarDate } = useProgramStore();
  const currentDate = new Date(calendarDate);

  const goBack = () => {
    const newDate = calendarView === 'month'
      ? subMonths(currentDate, 1)
      : subWeeks(currentDate, 1);
    setCalendarDate(format(newDate, 'yyyy-MM-dd'));
  };

  const goForward = () => {
    const newDate = calendarView === 'month'
      ? addMonths(currentDate, 1)
      : addWeeks(currentDate, 1);
    setCalendarDate(format(newDate, 'yyyy-MM-dd'));
  };

  const goToday = () => {
    setCalendarDate(format(new Date(), 'yyyy-MM-dd'));
  };

  const title = calendarView === 'month'
    ? format(currentDate, 'MMMM yyyy')
    : `Week of ${format(currentDate, 'MMM d, yyyy')}`;

  return (
    <div className="flex items-center justify-between mb-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={goBack}>
          <ChevronLeft className="w-4 h-4" />
        </Button>
        <h3 className="text-lg font-semibold text-foreground min-w-[200px] text-center">
          {title}
        </h3>
        <Button variant="ghost" size="sm" onClick={goForward}>
          <ChevronRight className="w-4 h-4" />
        </Button>
        <Button variant="ghost" size="sm" onClick={goToday} className="text-xs">
          Today
        </Button>
      </div>
      <div className="flex items-center gap-1 bg-steel rounded-md p-0.5">
        <button
          onClick={() => setCalendarView('month')}
          className={`px-3 py-1 text-xs rounded ${
            calendarView === 'month' ? 'bg-charcoal text-foreground' : 'text-muted hover:text-secondary'
          }`}
        >
          Month
        </button>
        <button
          onClick={() => setCalendarView('week')}
          className={`px-3 py-1 text-xs rounded ${
            calendarView === 'week' ? 'bg-charcoal text-foreground' : 'text-muted hover:text-secondary'
          }`}
        >
          Week
        </button>
      </div>
    </div>
  );
}
