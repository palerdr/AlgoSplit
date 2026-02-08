import { forwardRef, type InputHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, hint, type = 'text', id, ...props }, ref) => {
    const inputId = id || label?.toLowerCase().replace(/\s+/g, '-');

    return (
      <div className="w-full">
        {label && (
          <label
            htmlFor={inputId}
            className="block text-sm font-medium text-secondary mb-1.5"
          >
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          type={type}
          className={cn(
            'w-full h-9 px-3 bg-steel border border-white/8 rounded-sm text-foreground placeholder:text-muted',
            'focus:outline-none focus:border-crimson focus:ring-1 focus:ring-crimson',
            'disabled:opacity-50 disabled:cursor-not-allowed',
            'transition-colors duration-150',
            error && 'border-error focus:border-error focus:ring-error',
            className
          )}
          {...props}
        />
        {error && <p className="mt-1.5 text-xs text-error">{error}</p>}
        {hint && !error && (
          <p className="mt-1.5 text-xs text-muted">{hint}</p>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';

// Number input with increment/decrement for sets/reps
export interface NumberInputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'onChange'> {
  label?: string;
  error?: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
}

export const NumberInput = forwardRef<HTMLInputElement, NumberInputProps>(
  (
    { className, label, error, value, onChange, min = 0, max = 999, id, ...props },
    ref
  ) => {
    const inputId = id || label?.toLowerCase().replace(/\s+/g, '-');

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const num = parseInt(e.target.value, 10);
      if (!isNaN(num) && num >= min && num <= max) {
        onChange(num);
      }
    };

    const increment = () => {
      if (value < max) onChange(value + 1);
    };

    const decrement = () => {
      if (value > min) onChange(value - 1);
    };

    return (
      <div className="w-full">
        {label && (
          <label
            htmlFor={inputId}
            className="block text-sm font-medium text-secondary mb-1.5"
          >
            {label}
          </label>
        )}
        <div className="flex items-center">
          <button
            type="button"
            onClick={decrement}
            disabled={value <= min}
            className="h-9 w-9 flex items-center justify-center bg-steel border border-white/8 rounded-l-sm text-secondary hover:text-foreground hover:bg-graphite disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M5 12h14" />
            </svg>
          </button>
          <input
            ref={ref}
            id={inputId}
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            value={value}
            onChange={handleChange}
            className={cn(
              'h-9 w-14 px-2 bg-steel border-y border-white/8 text-center font-mono text-foreground tabular-nums',
              'focus:outline-none focus:border-crimson focus:ring-1 focus:ring-crimson',
              'disabled:opacity-50 disabled:cursor-not-allowed',
              error && 'border-error',
              className
            )}
            {...props}
          />
          <button
            type="button"
            onClick={increment}
            disabled={value >= max}
            className="h-9 w-9 flex items-center justify-center bg-steel border border-white/8 rounded-r-sm text-secondary hover:text-foreground hover:bg-graphite disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M5 12h14" />
              <path d="M12 5v14" />
            </svg>
          </button>
        </div>
        {error && <p className="mt-1.5 text-xs text-error">{error}</p>}
      </div>
    );
  }
);

NumberInput.displayName = 'NumberInput';
