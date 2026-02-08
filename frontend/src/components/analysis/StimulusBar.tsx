import { cn, getStimulusLevel, getStimulusColorClass } from '@/lib/utils';

interface StimulusBarProps {
  value: number;
  maxValue?: number;
  showValue?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function StimulusBar({
  value,
  maxValue = 7,
  showValue = true,
  size = 'md',
  className,
}: StimulusBarProps) {
  const percentage = Math.min(100, (value / maxValue) * 100);
  const level = getStimulusLevel(value);
  const colorClass = getStimulusColorClass(level);

  const heightClass = {
    sm: 'h-1.5',
    md: 'h-2',
    lg: 'h-3',
  }[size];

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <div className={cn('flex-1 bg-steel rounded-full overflow-hidden', heightClass)}>
        <div
          className={cn('h-full rounded-full transition-all duration-300', colorClass)}
          style={{ width: `${percentage}%` }}
        />
      </div>
      {showValue && (
        <span className="text-sm text-muted w-10 text-right">{value.toFixed(1)}</span>
      )}
    </div>
  );
}

// Segmented stimulus indicator (shows discrete levels)
interface StimulusIndicatorProps {
  value: number;
  segments?: number;
  size?: 'sm' | 'md';
  className?: string;
}

export function StimulusIndicator({
  value,
  segments = 7,
  size = 'md',
  className,
}: StimulusIndicatorProps) {
  const level = getStimulusLevel(value);

  const sizeClasses = {
    sm: 'w-2 h-4 gap-0.5',
    md: 'w-3 h-5 gap-1',
  }[size];

  const [width] = sizeClasses.split(' ');

  return (
    <div className={cn('flex items-end', sizeClasses.split(' ')[2], className)}>
      {Array.from({ length: segments }).map((_, i) => {
        const segmentLevel = i + 1;
        const isActive = level >= segmentLevel;
        const colorClass = isActive ? getStimulusColorClass(segmentLevel) : 'bg-steel';

        return (
          <div
            key={i}
            className={cn(
              'rounded-sm transition-colors',
              width,
              colorClass
            )}
            style={{ height: `${((i + 1) / segments) * 100}%` }}
          />
        );
      })}
    </div>
  );
}

// Text-based stimulus display with color
interface StimulusTextProps {
  value: number;
  showLabel?: boolean;
  className?: string;
}

const stimulusLabels = [
  'None',
  'Minimal',
  'Low',
  'Moderate',
  'Good',
  'High',
  'Very High',
  'Excellent',
];

const stimulusTextColors = [
  'text-gray-500',
  'text-red-800',
  'text-red-500',
  'text-orange-500',
  'text-amber-500',
  'text-lime-600',
  'text-green-500',
  'text-emerald-500',
];

export function StimulusText({ value, showLabel = false, className }: StimulusTextProps) {
  const level = getStimulusLevel(value);
  const colorClass = stimulusTextColors[level];
  const label = stimulusLabels[level];

  return (
    <span className={cn('font-medium', colorClass, className)}>
      {value.toFixed(1)}
      {showLabel && <span className="ml-1 text-sm opacity-80">({label})</span>}
    </span>
  );
}
