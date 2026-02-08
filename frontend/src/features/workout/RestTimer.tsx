import { useEffect, useRef } from 'react';
import { X, Play, SkipForward } from 'lucide-react';
import { useWorkoutStore } from './workoutStore';
import { cn } from '@/lib/utils';

export function RestTimer() {
  const {
    restTimer,
    stopRestTimer,
    tickRestTimer,
    startRestTimer,
    defaultRestDuration,
  } = useWorkoutStore();
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Tick the timer every second
  useEffect(() => {
    if (!restTimer.isRunning) return;

    const interval = setInterval(tickRestTimer, 1000);
    return () => clearInterval(interval);
  }, [restTimer.isRunning, tickRestTimer]);

  // Play sound when timer ends
  useEffect(() => {
    if (restTimer.isRunning && restTimer.remaining === 0) {
      // Vibrate if available
      if ('vibrate' in navigator) {
        navigator.vibrate([200, 100, 200]);
      }
      // Play audio
      audioRef.current?.play().catch(() => {
        // Audio play failed, likely no user interaction
      });
    }
  }, [restTimer.isRunning, restTimer.remaining]);

  if (!restTimer.isRunning && restTimer.remaining === 0) {
    return null;
  }

  const minutes = Math.floor(restTimer.remaining / 60);
  const seconds = restTimer.remaining % 60;
  const progress = (restTimer.remaining / restTimer.duration) * 100;
  const isExpired = restTimer.remaining === 0;

  return (
    <>
      {/* Hidden audio element for timer alarm */}
      <audio ref={audioRef} preload="auto">
        <source
          src="data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2teleHl11+7XrHwmLHDK5s6VWEVLgt7dwo1YSXLP4MaHUD5dod7GjEk6YqXdwIVENmOp28GDQDZ1t9i5fTwvebvXtXQ8MH2+1bJyOy6Bwte0dDkvgsXWsnM5L4bI1q9yOS6Jy9etcDkvjc7WqW44LpHS1aZtNyyU1dOjay0rmNfRn2gpKZvZ0ZtlJyee29CYYyUnouDNlWEjJqbizpJfIianJOG"
          type="audio/wav"
        />
      </audio>

      {/* Timer UI */}
      <div
        className={cn(
          'fixed bottom-20 md:bottom-4 right-4 z-40',
          'bg-charcoal border rounded-lg p-4 min-w-[140px]',
          isExpired
            ? 'border-crimson animate-pulse'
            : 'border-white/8'
        )}
      >
        {/* Progress bar */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-steel rounded-t-lg overflow-hidden">
          <div
            className="h-full bg-crimson transition-all duration-1000 ease-linear"
            style={{ width: `${progress}%` }}
          />
        </div>

        <div className="flex items-center justify-between gap-4 pt-1">
          <div>
            <p className="text-sm text-secondary font-medium mb-1">Rest</p>
            <p
              className={cn(
                'text-2xl font-mono font-bold tabular-nums',
                isExpired ? 'text-crimson' : 'text-foreground'
              )}
            >
              {minutes}:{seconds.toString().padStart(2, '0')}
            </p>
          </div>

          <div className="flex items-center gap-1">
            {isExpired ? (
              <button
                onClick={() => startRestTimer(defaultRestDuration)}
                className="p-2 text-muted hover:text-foreground transition-colors"
                title="Restart timer"
              >
                <Play size={18} />
              </button>
            ) : (
              <button
                onClick={() => startRestTimer(restTimer.remaining + 30)}
                className="p-2 text-muted hover:text-foreground transition-colors"
                title="Add 30 seconds"
              >
                <SkipForward size={18} />
              </button>
            )}
            <button
              onClick={stopRestTimer}
              className="p-2 text-muted hover:text-foreground transition-colors"
              title="Dismiss"
            >
              <X size={18} />
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
