import { Plus, ArrowUpDown, List, X } from 'lucide-react';

interface MobileGlobalMenuProps {
  isOpen: boolean;
  onClose: () => void;
  onAddExercise: () => void;
  onReorder: () => void;
  onSwitchToList: () => void;
  onCancel: () => void;
}

export function MobileGlobalMenu({
  isOpen,
  onClose,
  onAddExercise,
  onReorder,
  onSwitchToList,
  onCancel,
}: MobileGlobalMenuProps) {
  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40" onClick={onClose} />

      {/* Menu */}
      <div className="absolute right-4 top-full mt-1 z-50 bg-charcoal border border-white/10 rounded-lg shadow-xl overflow-hidden min-w-[200px]">
        <button
          onClick={onAddExercise}
          className="w-full flex items-center gap-3 px-4 py-3 text-sm text-foreground hover:bg-steel transition-colors"
        >
          <Plus size={16} className="text-secondary" />
          Add Exercise
        </button>
        <button
          onClick={onReorder}
          className="w-full flex items-center gap-3 px-4 py-3 text-sm text-foreground hover:bg-steel transition-colors"
        >
          <ArrowUpDown size={16} className="text-secondary" />
          Reorder
        </button>
        <button
          onClick={onSwitchToList}
          className="w-full flex items-center gap-3 px-4 py-3 text-sm text-foreground hover:bg-steel transition-colors"
        >
          <List size={16} className="text-secondary" />
          Switch to List View
        </button>
        <div className="border-t border-white/8" />
        <button
          onClick={onCancel}
          className="w-full flex items-center gap-3 px-4 py-3 text-sm text-error hover:bg-steel transition-colors"
        >
          <X size={16} />
          Cancel Workout
        </button>
      </div>
    </>
  );
}
