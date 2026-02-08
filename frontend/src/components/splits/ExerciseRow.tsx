import { useState, useEffect, useRef, memo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { X, GripVertical, Search, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { searchExercises, findExercise, type Exercise } from '@/data/exercises';
import { listCustomExercises, customExerciseKeys } from '@/api/customExercises.api';

type ResistanceProfile = 'ascending' | 'mid' | 'descending' | null;

interface ExerciseRowProps {
  name: string;
  sets: number;
  unilateral?: boolean;
  resistanceProfile?: ResistanceProfile;
  index: number;
  onNameChange: (name: string, unilateral?: boolean) => void;
  onSetsChange: (sets: number) => void;
  onUnilateralChange?: (unilateral: boolean) => void;
  onResistanceProfileChange?: (profile: ResistanceProfile) => void;
  onRemove: () => void;
  dragHandleProps?: Record<string, unknown>;
}

export const ExerciseRow = memo(function ExerciseRow({
  name,
  sets,
  unilateral = false,
  resistanceProfile = null,
  onNameChange,
  onSetsChange,
  onUnilateralChange,
  onResistanceProfileChange,
  onRemove,
  dragHandleProps,
}: ExerciseRowProps) {
  const [inputValue, setInputValue] = useState(name);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [suggestions, setSuggestions] = useState<Array<Exercise & { isCustom?: boolean }>>([]);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [isUnilateral, setIsUnilateral] = useState(unilateral);
  const inputRef = useRef<HTMLInputElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const justSelectedRef = useRef(false); // Track if exercise was just selected via click
  const latestInputValueRef = useRef(inputValue); // Track latest inputValue for blur handler

  // Fetch user's custom exercises
  const { data: customExercises } = useQuery({
    queryKey: customExerciseKeys.list(),
    queryFn: listCustomExercises,
    staleTime: 5 * 60 * 1000,
  });

  // Keep ref in sync with state
  latestInputValueRef.current = inputValue;

  // Sync inputValue when name prop changes (e.g., from store rehydration)
  useEffect(() => {
    if (name !== inputValue && !showSuggestions) {
      setInputValue(name);
    }
  }, [name]);

  // Auto-enable unilateral if exercise from database is marked as such
  useEffect(() => {
    if (name) {
      const exercise = findExercise(name);
      if (exercise?.unilateral && !isUnilateral) {
        setIsUnilateral(true);
        onUnilateralChange?.(true);
      }
    }
  }, [name]);

  useEffect(() => {
    if (inputValue.length >= 2) {
      const lowerQuery = inputValue.toLowerCase();

      // Search built-in exercises
      const builtIn = searchExercises(inputValue).slice(0, 6);

      // Search custom exercises
      const custom: Array<Exercise & { isCustom: boolean }> = (customExercises?.exercises || [])
        .filter((ce) => ce.exercise_name.toLowerCase().includes(lowerQuery))
        .slice(0, 4)
        .map((ce) => ({
          name: ce.exercise_name,
          pattern: 'custom',
          equipment: 'custom',
          unilateral: !ce.is_bilateral,
          isCustom: true,
        }));

      // Merge: custom first, then built-in, deduplicate by name
      const seen = new Set<string>();
      const merged: Array<Exercise & { isCustom?: boolean }> = [];
      for (const ex of [...custom, ...builtIn]) {
        const key = ex.name.toLowerCase();
        if (!seen.has(key)) {
          seen.add(key);
          merged.push(ex);
        }
      }

      setSuggestions(merged.slice(0, 8));
      setSelectedIndex(-1);
    } else {
      setSuggestions([]);
    }
  }, [inputValue, customExercises]);

  // Close suggestions when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        suggestionsRef.current &&
        !suggestionsRef.current.contains(e.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(e.target as Node)
      ) {
        setShowSuggestions(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!showSuggestions || suggestions.length === 0) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex(prev => Math.min(prev + 1, suggestions.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex(prev => Math.max(prev - 1, -1));
        break;
      case 'Enter':
        e.preventDefault();
        if (selectedIndex >= 0 && suggestions[selectedIndex]) {
          selectExercise(suggestions[selectedIndex]);
        } else if (inputValue.trim()) {
          onNameChange(inputValue.trim());
          setShowSuggestions(false);
        }
        break;
      case 'Escape':
        setShowSuggestions(false);
        break;
    }
  }

  function selectExercise(exercise: Exercise) {
    console.log('[ExerciseRow] selectExercise called with:', exercise.name);
    justSelectedRef.current = true; // Mark that we selected via click
    // Update ref DIRECTLY before state update to prevent race condition with blur handler
    latestInputValueRef.current = exercise.name;
    setInputValue(exercise.name);
    // Auto-set unilateral if exercise is marked as such in database
    const isUni = exercise.unilateral || false;
    setIsUnilateral(isUni);
    console.log('[ExerciseRow] Calling onNameChange with:', exercise.name);
    onNameChange(exercise.name, isUni);
    onUnilateralChange?.(isUni);
    setShowSuggestions(false);
    setSuggestions([]);
    // Reset flag after a short delay
    setTimeout(() => { justSelectedRef.current = false; }, 200);
  }

  function handleBlur() {
    // Delay to allow click on suggestion
    setTimeout(() => {
      // Use ref to get latest value, not stale closure
      const currentValue = latestInputValueRef.current;
      console.log('[ExerciseRow] handleBlur callback - justSelectedRef:', justSelectedRef.current, 'currentValue:', currentValue, 'name prop:', name);
      // Skip if exercise was just selected via click
      if (justSelectedRef.current) {
        console.log('[ExerciseRow] Skipping blur - exercise was just selected');
        setShowSuggestions(false);
        return;
      }
      if (currentValue.trim() && currentValue !== name) {
        console.log('[ExerciseRow] handleBlur calling onNameChange with:', currentValue.trim());
        onNameChange(currentValue.trim());
      }
      setShowSuggestions(false);
    }, 150);
  }

  function toggleUnilateral() {
    const newValue = !isUnilateral;
    setIsUnilateral(newValue);
    onUnilateralChange?.(newValue);
  }

  return (
    <div ref={containerRef} className="flex items-center gap-2 group">
      {/* Drag handle */}
      <div
        {...dragHandleProps}
        className="p-1 text-muted hover:text-secondary cursor-grab opacity-0 group-hover:opacity-100 transition-opacity"
      >
        <GripVertical className="w-4 h-4" />
      </div>

      {/* Exercise name input with autocomplete */}
      <div className="relative flex-1" style={{ zIndex: showSuggestions ? 100 : 1 }}>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
          <input
            ref={inputRef}
            type="text"
            value={inputValue}
            onChange={(e) => {
              setInputValue(e.target.value);
              setShowSuggestions(true);
            }}
            onFocus={() => setShowSuggestions(true)}
            onBlur={handleBlur}
            onKeyDown={handleKeyDown}
            placeholder="Exercise name..."
            className="w-full bg-charcoal border border-white/10 rounded-md pl-9 pr-3 py-2 text-sm text-foreground placeholder:text-muted focus:outline-none focus:border-crimson/50"
          />
        </div>

        {/* Autocomplete suggestions - use fixed positioning to avoid clipping */}
        {showSuggestions && suggestions.length > 0 && (
          <div
            ref={suggestionsRef}
            className="absolute left-0 right-0 mt-1 bg-charcoal border border-white/10 rounded-md shadow-xl overflow-hidden max-h-64 overflow-y-auto"
            style={{ zIndex: 9999 }}
          >
            {suggestions.map((exercise, idx) => (
              <button
                key={exercise.name}
                type="button"
                onMouseDown={(e) => {
                  // Prevent blur from firing before we handle the selection
                  e.preventDefault();
                  selectExercise(exercise);
                }}
                className={cn(
                  'w-full px-3 py-2 text-left flex items-center justify-between gap-2 text-sm transition-colors',
                  idx === selectedIndex
                    ? 'bg-crimson/10 text-foreground'
                    : 'text-secondary hover:bg-steel hover:text-foreground'
                )}
              >
                <span className="truncate">{exercise.name}</span>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {exercise.unilateral && (
                    <span className="text-xs text-crimson">UNI</span>
                  )}
                  {'isCustom' in exercise && exercise.isCustom ? (
                    <span className="text-xs px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-400">Custom</span>
                  ) : (
                    <span className="text-xs text-muted capitalize">
                      {exercise.equipment || 'various'}
                    </span>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Unilateral toggle - always visible since most exercises have unilateral variants */}
      <button
        type="button"
        onClick={toggleUnilateral}
        title="Unilateral exercise (+5% stimulus)"
        className={cn(
          'px-2 py-1.5 rounded text-xs font-medium transition-colors',
          isUnilateral
            ? 'bg-crimson/20 text-crimson border border-crimson/30'
            : 'bg-steel text-muted hover:text-secondary'
        )}
      >
        UNI
      </button>

      {/* Resistance profile selector */}
      <div className="relative">
        <select
          value={resistanceProfile || ''}
          onChange={(e) => {
            const val = e.target.value as ResistanceProfile;
            onResistanceProfileChange?.(val || null);
          }}
          title="Resistance profile (affects leverage matching)"
          className={cn(
            'appearance-none pl-2 pr-6 py-1.5 rounded text-xs font-medium transition-colors cursor-pointer',
            resistanceProfile
              ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
              : 'bg-steel text-muted hover:text-secondary'
          )}
        >
          <option value="">Auto</option>
          <option value="ascending">Asc</option>
          <option value="mid">Mid</option>
          <option value="descending">Desc</option>
        </select>
        <ChevronDown className="absolute right-1 top-1/2 -translate-y-1/2 w-3 h-3 text-muted pointer-events-none" />
      </div>

      {/* Sets input */}
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => onSetsChange(Math.max(1, sets - 1))}
          className="w-7 h-7 flex items-center justify-center rounded bg-steel hover:bg-charcoal text-secondary hover:text-foreground transition-colors"
        >
          -
        </button>
        <input
          type="number"
          value={sets}
          onChange={(e) => onSetsChange(Math.max(1, parseInt(e.target.value) || 1))}
          min={1}
          max={20}
          className="w-12 bg-charcoal border border-white/10 rounded-md px-2 py-2 text-sm text-center text-foreground focus:outline-none focus:border-crimson/50"
        />
        <button
          type="button"
          onClick={() => onSetsChange(Math.min(20, sets + 1))}
          className="w-7 h-7 flex items-center justify-center rounded bg-steel hover:bg-charcoal text-secondary hover:text-foreground transition-colors"
        >
          +
        </button>
        <span className="text-xs text-muted w-8">sets</span>
      </div>

      {/* Remove button */}
      <button
        type="button"
        onClick={onRemove}
        className="p-1.5 text-muted hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
});
