import { ChevronLeft, ChevronRight, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

interface MobileExerciseNavProps {
  currentIndex: number;
  totalExercises: number;
  onPrev: () => void;
  onNext: () => void;
  onFinish: () => void;
}

export function MobileExerciseNav({
  currentIndex,
  totalExercises,
  onPrev,
  onNext,
  onFinish,
}: MobileExerciseNavProps) {
  const isLastExercise = currentIndex === totalExercises - 1;
  const isSummary = currentIndex === totalExercises;

  return (
    <div className="fixed bottom-16 left-0 right-0 z-30 bg-charcoal border-t border-white/8 pb-safe">
      <div className="flex items-center justify-between px-4 py-3">
        {/* Prev button */}
        <button
          onClick={onPrev}
          disabled={currentIndex === 0}
          className={cn(
            'flex items-center gap-1 px-3 py-2 rounded-md text-sm font-medium transition-colors',
            currentIndex === 0
              ? 'text-faint cursor-not-allowed'
              : 'text-secondary hover:text-foreground hover:bg-steel'
          )}
        >
          <ChevronLeft size={18} />
          Prev
        </button>

        {/* Page indicator */}
        <div className="flex items-center gap-1.5">
          {Array.from({ length: totalExercises + 1 }).map((_, idx) => (
            <div
              key={idx}
              className={cn(
                'w-2 h-2 rounded-full transition-colors',
                idx === currentIndex ? 'bg-crimson' : 'bg-white/20'
              )}
            />
          ))}
        </div>

        {/* Next / Finish button */}
        {isSummary ? (
          <button
            onClick={onFinish}
            className="flex items-center gap-1 px-4 py-2 bg-crimson text-white rounded-md text-sm font-medium hover:bg-crimson/90 transition-colors"
          >
            <Check size={16} />
            Save
          </button>
        ) : isLastExercise ? (
          <button
            onClick={onNext}
            className="flex items-center gap-1 px-3 py-2 bg-crimson text-white rounded-md text-sm font-medium hover:bg-crimson/90 transition-colors"
          >
            Review
            <ChevronRight size={18} />
          </button>
        ) : (
          <button
            onClick={onNext}
            className="flex items-center gap-1 px-3 py-2 rounded-md text-sm font-medium text-secondary hover:text-foreground hover:bg-steel transition-colors"
          >
            Next
            <ChevronRight size={18} />
          </button>
        )}
      </div>
    </div>
  );
}
