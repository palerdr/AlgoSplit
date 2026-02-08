import { Check, Trash2 } from 'lucide-react';
import { type SetData } from './workoutStore';
import { cn } from '@/lib/utils';

interface SetRowProps {
  setIndex: number;
  data: SetData;
  previousSet?: { reps: number; weight: number };
  sideLabel?: 'L' | 'R';
  onUpdate: (data: Partial<SetData>) => void;
  onComplete: () => void;
  onRemove: () => void;
  canRemove: boolean;
}

export function SetRow({
  setIndex,
  data,
  previousSet,
  sideLabel,
  onUpdate,
  onComplete,
  onRemove,
  canRemove,
}: SetRowProps) {
  const handleRepsChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value, 10);
    if (!isNaN(value) && value >= 0 && value <= 999) {
      onUpdate({ reps: value });
    } else if (e.target.value === '') {
      onUpdate({ reps: 0 });
    }
  };

  const handleWeightChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseFloat(e.target.value);
    if (!isNaN(value) && value >= 0 && value <= 9999) {
      onUpdate({ weight: value });
    } else if (e.target.value === '') {
      onUpdate({ weight: 0 });
    }
  };

  const handleRirChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value, 10);
    if (!isNaN(value) && value >= 0 && value <= 5) {
      onUpdate({ rir: value });
    } else if (e.target.value === '') {
      onUpdate({ rir: undefined });
    }
  };

  const handleToggleComplete = () => {
    // Toggle completion state - can always be toggled back
    if (data.completed || data.reps > 0) {
      onComplete();
    }
  };

  return (
    <div
      className={cn(
        'flex items-center gap-2 py-2 px-3 rounded-md transition-colors',
        data.completed ? 'bg-crimson/5' : 'hover:bg-steel/50'
      )}
    >
      {/* Set number or L/R label */}
      <div className="w-8 text-center">
        {sideLabel ? (
          <span
            className={cn(
              'text-sm font-mono font-medium',
              data.completed ? 'text-crimson' : 'text-secondary'
            )}
          >
            {sideLabel === 'L' ? `${setIndex + 1}L` : 'R'}
          </span>
        ) : (
          <span
            className={cn(
              'text-sm font-mono font-medium',
              data.completed ? 'text-crimson' : 'text-secondary'
            )}
          >
            {setIndex + 1}
          </span>
        )}
      </div>

      {/* Previous set reference */}
      <div className="w-20 text-center">
        {previousSet ? (
          <span className="text-xs text-secondary font-mono">
            {previousSet.weight}x{previousSet.reps}
          </span>
        ) : (
          <span className="text-xs text-faint">-</span>
        )}
      </div>

      {/* Weight input */}
      <div className="flex-1">
        <input
          type="number"
          inputMode="decimal"
          value={data.weight || ''}
          onChange={handleWeightChange}
          placeholder={previousSet?.weight.toString() || '0'}
          className={cn(
            'w-full h-9 px-2 bg-steel border border-white/8 rounded-sm text-center font-mono text-foreground tabular-nums',
            'focus:outline-none focus:border-crimson',
            'placeholder:text-faint'
          )}
        />
        <p className="text-xs text-secondary text-center mt-0.5">lbs</p>
      </div>

      {/* Reps input */}
      <div className="flex-1">
        <input
          type="number"
          inputMode="numeric"
          value={data.reps || ''}
          onChange={handleRepsChange}
          placeholder={previousSet?.reps.toString() || '0'}
          className={cn(
            'w-full h-9 px-2 bg-steel border border-white/8 rounded-sm text-center font-mono text-foreground tabular-nums',
            'focus:outline-none focus:border-crimson',
            'placeholder:text-faint'
          )}
        />
        <p className="text-xs text-secondary text-center mt-0.5">reps</p>
      </div>

      {/* RIR input */}
      <div className="w-14">
        <input
          type="number"
          inputMode="numeric"
          value={data.rir ?? ''}
          onChange={handleRirChange}
          placeholder="-"
          className={cn(
            'w-full h-9 px-2 bg-steel border border-white/8 rounded-sm text-center font-mono text-foreground tabular-nums',
            'focus:outline-none focus:border-crimson',
            'placeholder:text-faint'
          )}
        />
        <p className="text-xs text-secondary text-center mt-0.5">RIR</p>
      </div>

      {/* Complete toggle button */}
      <button
        onClick={handleToggleComplete}
        disabled={!data.completed && data.reps === 0}
        className={cn(
          'w-9 h-9 flex items-center justify-center rounded-sm transition-colors',
          data.completed
            ? 'bg-crimson text-foreground hover:bg-crimson/80'
            : data.reps > 0
            ? 'bg-steel text-muted hover:bg-crimson hover:text-foreground'
            : 'bg-steel text-faint cursor-not-allowed'
        )}
        title={data.completed ? 'Click to edit' : 'Mark as complete'}
      >
        <Check size={18} />
      </button>

      {/* Remove button - always visible if canRemove */}
      {canRemove && (
        <button
          onClick={onRemove}
          className="w-9 h-9 flex items-center justify-center text-muted hover:text-error transition-colors"
        >
          <Trash2 size={16} />
        </button>
      )}
    </div>
  );
}
