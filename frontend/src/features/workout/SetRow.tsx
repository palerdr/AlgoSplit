import { Check, Trash2 } from 'lucide-react';
import { type SetData } from './workoutStore';
import { cn } from '@/lib/utils';

interface SetRowProps {
  setIndex: number;
  data: SetData;
  previousSet?: { reps: number; weight: number; rir?: number | null };
  sideLabel?: 'L' | 'R';
  variant?: 'row' | 'node';
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
  variant = 'row',
  onUpdate,
  onComplete,
  onRemove,
  canRemove,
}: SetRowProps) {
  const isNode = variant === 'node';
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

  const label = (text: string) =>
    isNode ? (
      <p className="text-[10px] text-secondary text-center mb-0.5 uppercase tracking-wide">{text}</p>
    ) : null;

  return (
    <div className={cn('flex justify-center', isNode ? 'px-2' : 'px-1')}>
      <div
        className={cn(
          'flex gap-2 py-2.5 px-3 rounded-lg transition-colors bg-steel/30',
          isNode ? 'items-end w-fit' : 'items-center w-full',
          data.completed ? 'ring-1 ring-crimson/20' : ''
        )}
      >
        {/* Set number */}
        <div className="w-8 flex-shrink-0">
          {label('Set')}
          <div className={cn('flex items-center justify-center', isNode && 'h-9')}>
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
        </div>

        {/* Weight input */}
        <div className={cn(isNode ? 'w-20 flex-shrink-0' : 'flex-1')}>
          {label('Weight')}
          <input
            type="number"
            inputMode="decimal"
            value={data.weight || ''}
            onChange={handleWeightChange}
            placeholder={previousSet ? String(previousSet.weight) : ''}
            className={cn(
              'w-full h-9 px-2 bg-steel border border-white/8 rounded-sm text-center font-mono text-foreground tabular-nums',
              'focus:outline-none focus:border-crimson',
              'placeholder:text-faint'
            )}
          />
        </div>

        {/* Reps input */}
        <div className={cn(isNode ? 'w-20 flex-shrink-0' : 'flex-1')}>
          {label('Reps')}
          <input
            type="number"
            inputMode="numeric"
            value={data.reps || ''}
            onChange={handleRepsChange}
            placeholder={previousSet ? String(previousSet.reps) : ''}
            className={cn(
              'w-full h-9 px-2 bg-steel border border-white/8 rounded-sm text-center font-mono text-foreground tabular-nums',
              'focus:outline-none focus:border-crimson',
              'placeholder:text-faint'
            )}
          />
        </div>

        {/* RIR input */}
        <div className="w-14 flex-shrink-0">
          {label('RIR')}
          <input
            type="number"
            inputMode="numeric"
            value={data.rir ?? ''}
            onChange={handleRirChange}
            placeholder={previousSet?.rir != null ? previousSet.rir.toString() : '-'}
            className={cn(
              'w-full h-9 px-2 bg-steel border border-white/8 rounded-sm text-center font-mono text-foreground tabular-nums',
              'focus:outline-none focus:border-crimson',
              'placeholder:text-faint'
            )}
          />
        </div>

        {/* Complete toggle button */}
        <button
          onClick={handleToggleComplete}
          disabled={!data.completed && data.reps === 0}
          className={cn(
            'w-9 h-9 flex items-center justify-center rounded-sm transition-colors flex-shrink-0',
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
            className="w-9 h-9 flex items-center justify-center text-muted hover:text-error transition-colors flex-shrink-0"
          >
            <Trash2 size={16} />
          </button>
        )}
      </div>
    </div>
  );
}
