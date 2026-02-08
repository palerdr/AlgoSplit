import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, X, ChevronRight } from 'lucide-react';
import { Modal } from '@/components/ui';
import { cn } from '@/lib/utils';
import { getExercisesByCategory, searchExercises } from '@/data/exercises';
import { listCustomExercises, customExerciseKeys } from '@/api/customExercises.api';

// Lazily cache categorized exercises (computed once on first access)
let _exerciseCategories: Record<string, string[]> | null = null;
function getCategories(): Record<string, string[]> {
  if (!_exerciseCategories) _exerciseCategories = getExercisesByCategory();
  return _exerciseCategories;
}

interface ExercisePickerProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (exerciseName: string) => void;
}

export function ExercisePicker({
  isOpen,
  onClose,
  onSelect,
}: ExercisePickerProps) {
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  // Fetch user's custom exercises
  const { data: customExercises } = useQuery({
    queryKey: customExerciseKeys.list(),
    queryFn: listCustomExercises,
    staleTime: 5 * 60 * 1000,
  });

  // Filter exercises based on search, merging custom + built-in
  const filteredExercises = useMemo(() => {
    if (!search.trim()) return null;
    const lowerQuery = search.toLowerCase();

    // Search built-in exercises
    const builtIn = searchExercises(search, 10).map((e) => ({ name: e.name, isCustom: false }));

    // Search custom exercises
    const custom = (customExercises?.exercises || [])
      .filter((ce) => ce.exercise_name.toLowerCase().includes(lowerQuery))
      .slice(0, 4)
      .map((ce) => ({ name: ce.exercise_name, isCustom: true }));

    // Merge: custom first, then built-in, deduplicate by name
    const seen = new Set<string>();
    const merged: Array<{ name: string; isCustom: boolean }> = [];
    for (const ex of [...custom, ...builtIn]) {
      const key = ex.name.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        merged.push(ex);
      }
    }
    return merged.slice(0, 10);
  }, [search, customExercises]);

  const handleSelect = (name: string) => {
    onSelect(name);
    setSearch('');
    setSelectedCategory(null);
    onClose();
  };

  const handleCustomExercise = () => {
    if (search.trim()) {
      handleSelect(search.trim());
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Add Exercise" size="md">
      {/* Search input */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search exercises..."
          className="w-full h-10 pl-10 pr-10 bg-steel border border-white/8 rounded-md text-foreground placeholder:text-muted focus:outline-none focus:border-crimson"
          autoFocus
        />
        {search && (
          <button
            onClick={() => setSearch('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-foreground"
          >
            <X size={16} />
          </button>
        )}
      </div>

      {/* Search results */}
      {search.trim() && (
        <div className="mb-4">
          {filteredExercises && filteredExercises.length > 0 ? (
            <div className="space-y-1">
              {filteredExercises.map((exercise) => (
                <button
                  key={exercise.name}
                  onClick={() => handleSelect(exercise.name)}
                  className="w-full text-left px-3 py-2 rounded-md hover:bg-steel transition-colors flex items-center justify-between"
                >
                  <span>{exercise.name}</span>
                  {exercise.isCustom && (
                    <span className="text-xs px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-400">Custom</span>
                  )}
                </button>
              ))}
            </div>
          ) : (
            <div className="text-center py-4">
              <p className="text-muted text-sm mb-2">No matching exercises</p>
              <button
                onClick={handleCustomExercise}
                className="text-crimson hover:text-crimson-hover text-sm"
              >
                Add "{search}" as custom exercise
              </button>
            </div>
          )}
        </div>
      )}

      {/* Category browser (when not searching) */}
      {!search.trim() && (
        <>
          {selectedCategory ? (
            <>
              <button
                onClick={() => setSelectedCategory(null)}
                className="flex items-center gap-2 text-sm text-muted hover:text-foreground mb-3"
              >
                <ChevronRight className="rotate-180" size={16} />
                Back to categories
              </button>
              <div className="space-y-1 max-h-64 overflow-y-auto">
                {selectedCategory === '__custom__' ? (
                  (customExercises?.exercises || []).length > 0 ? (
                    (customExercises?.exercises || []).map((ce) => (
                      <button
                        key={ce.id}
                        onClick={() => handleSelect(ce.exercise_name)}
                        className="w-full text-left px-3 py-2 rounded-md hover:bg-steel transition-colors flex items-center justify-between"
                      >
                        <span>{ce.exercise_name}</span>
                        <span className="text-xs px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-400">Custom</span>
                      </button>
                    ))
                  ) : (
                    <p className="text-muted text-sm text-center py-4">No custom exercises yet</p>
                  )
                ) : (
                  getCategories()[selectedCategory]?.map((exercise) => (
                    <button
                      key={exercise}
                      onClick={() => handleSelect(exercise)}
                      className="w-full text-left px-3 py-2 rounded-md hover:bg-steel transition-colors"
                    >
                      {exercise}
                    </button>
                  ))
                )}
              </div>
            </>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {(customExercises?.exercises || []).length > 0 && (
                <button
                  onClick={() => setSelectedCategory('__custom__')}
                  className={cn(
                    'flex items-center justify-between px-4 py-3 rounded-md col-span-2',
                    'bg-purple-500/10 border border-purple-500/20 hover:bg-purple-500/20 transition-colors'
                  )}
                >
                  <span className="font-medium text-purple-400">Custom Exercises</span>
                  <ChevronRight size={16} className="text-purple-400" />
                </button>
              )}
              {Object.keys(getCategories()).map((category) => (
                <button
                  key={category}
                  onClick={() => setSelectedCategory(category)}
                  className={cn(
                    'flex items-center justify-between px-4 py-3 rounded-md',
                    'bg-steel hover:bg-graphite transition-colors'
                  )}
                >
                  <span className="font-medium">{category}</span>
                  <ChevronRight size={16} className="text-muted" />
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </Modal>
  );
}
