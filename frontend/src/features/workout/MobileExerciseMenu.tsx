import { RefreshCw, BarChart3, RotateCcw, Trash2 } from 'lucide-react';

interface MobileExerciseMenuProps {
  isOpen: boolean;
  onClose: () => void;
  onReplace: () => void;
  onViewStats: () => void;
  onReset: () => void;
  onRemove: () => void;
  showReplace: boolean;
}

export function MobileExerciseMenu({
  isOpen,
  onClose,
  onReplace,
  onViewStats,
  onReset,
  onRemove,
  showReplace,
}: MobileExerciseMenuProps) {
  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40" onClick={onClose} />

      {/* Menu */}
      <div className="absolute right-4 top-12 z-50 bg-charcoal border border-white/10 rounded-lg shadow-xl overflow-hidden min-w-[200px]">
        {showReplace && (
          <button
            onClick={() => { onReplace(); onClose(); }}
            className="w-full flex items-center gap-3 px-4 py-3 text-sm text-foreground hover:bg-steel transition-colors"
          >
            <RefreshCw size={16} className="text-secondary" />
            Replace Exercise
          </button>
        )}
        <button
          onClick={() => { onViewStats(); onClose(); }}
          className="w-full flex items-center gap-3 px-4 py-3 text-sm text-foreground hover:bg-steel transition-colors"
        >
          <BarChart3 size={16} className="text-secondary" />
          View Stats
        </button>
        <button
          onClick={() => { onReset(); onClose(); }}
          className="w-full flex items-center gap-3 px-4 py-3 text-sm text-foreground hover:bg-steel transition-colors"
        >
          <RotateCcw size={16} className="text-secondary" />
          Reset History
        </button>
        <div className="border-t border-white/8" />
        <button
          onClick={() => { onRemove(); onClose(); }}
          className="w-full flex items-center gap-3 px-4 py-3 text-sm text-error hover:bg-steel transition-colors"
        >
          <Trash2 size={16} />
          Remove Exercise
        </button>
      </div>
    </>
  );
}
