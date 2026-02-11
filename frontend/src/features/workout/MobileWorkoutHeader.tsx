import { useState, useEffect } from 'react';
import { Clock, CalendarClock, MoreVertical } from 'lucide-react';
import { MobileGlobalMenu } from './MobileGlobalMenu';

interface MobileWorkoutHeaderProps {
  sessionName: string;
  startedAt: string;
  isRetro: boolean;
  totalSetsWithData: number;
  onAddExercise: () => void;
  onReorder: () => void;
  onSwitchToList: () => void;
  onCancel: () => void;
}

export function MobileWorkoutHeader({
  sessionName,
  startedAt,
  isRetro,
  totalSetsWithData,
  onAddExercise,
  onReorder,
  onSwitchToList,
  onCancel,
}: MobileWorkoutHeaderProps) {
  const [showMenu, setShowMenu] = useState(false);
  const [, setTick] = useState(0);

  // Tick every second for live elapsed time
  useEffect(() => {
    if (isRetro) return;
    const interval = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(interval);
  }, [isRetro]);

  const startDate = new Date(startedAt);
  const startTimeStr = isRetro
    ? startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : startDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

  const elapsedMs = Date.now() - startDate.getTime();
  const elapsedSec = Math.floor(elapsedMs / 1000);
  const elapsedH = Math.floor(elapsedSec / 3600);
  const elapsedM = Math.floor((elapsedSec % 3600) / 60);
  const elapsedS = elapsedSec % 60;
  const elapsedStr = isRetro
    ? 'Past workout'
    : elapsedH > 0
      ? `${elapsedH}:${String(elapsedM).padStart(2, '0')}:${String(elapsedS).padStart(2, '0')}`
      : `${elapsedM}:${String(elapsedS).padStart(2, '0')}`;

  return (
    <div className="sticky top-0 z-30 bg-charcoal border-b border-white/8">
      <div className="flex items-center justify-between p-4">
        <div className="min-w-0 flex-1">
          <h1 className="text-lg font-semibold text-foreground truncate">
            {sessionName}
          </h1>
          <div className="flex items-center gap-3 text-sm text-secondary">
            <span className="flex items-center gap-1">
              {isRetro ? <CalendarClock size={14} /> : <Clock size={14} />}
              <span className="font-mono tabular-nums">{startTimeStr} · {elapsedStr}</span>
            </span>
            <span>{totalSetsWithData} sets</span>
          </div>
        </div>

        <button
          onClick={() => setShowMenu(true)}
          className="p-2 text-muted hover:text-foreground transition-colors"
        >
          <MoreVertical size={20} />
        </button>
      </div>

      <MobileGlobalMenu
        isOpen={showMenu}
        onClose={() => setShowMenu(false)}
        onAddExercise={() => { onAddExercise(); setShowMenu(false); }}
        onReorder={() => { onReorder(); setShowMenu(false); }}
        onSwitchToList={() => { onSwitchToList(); setShowMenu(false); }}
        onCancel={() => { onCancel(); setShowMenu(false); }}
      />
    </div>
  );
}
