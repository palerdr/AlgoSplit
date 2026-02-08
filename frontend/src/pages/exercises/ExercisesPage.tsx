import { useState, useMemo, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Search, Filter, ChevronDown, ChevronRight, Dumbbell, Plus, Pencil, Trash2, BookOpen, Sparkles } from 'lucide-react';
import { Card, CardContent, Button, ConfirmDialog } from '@/components/ui';
import { CustomExerciseEditor } from '@/components/exercises';
import { EXERCISE_DATABASE, searchExercises, type Exercise, type ExerciseCategory } from '@/data/exercises';
import {
  listCustomExercises,
  createCustomExercise,
  updateCustomExercise,
  deleteCustomExercise,
  customExerciseKeys,
} from '@/api/customExercises.api';
import type { CustomExerciseCreate, CustomExerciseResponse } from '@/types/api.types';
import { cn } from '@/lib/utils';
import { useAuth } from '@/features/auth';

type Equipment = 'all' | 'barbell' | 'dumbbell' | 'cable' | 'machine' | 'bodyweight';
type Tab = 'library' | 'custom';

const equipmentOptions: { value: Equipment; label: string }[] = [
  { value: 'all', label: 'All Equipment' },
  { value: 'barbell', label: 'Barbell' },
  { value: 'dumbbell', label: 'Dumbbell' },
  { value: 'cable', label: 'Cable' },
  { value: 'machine', label: 'Machine' },
  { value: 'bodyweight', label: 'Bodyweight' },
];

function ExerciseCard({ exercise }: { exercise: Exercise }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <button
      onClick={() => setExpanded(!expanded)}
      className={cn(
        'w-full text-left p-3 rounded-lg transition-all border',
        expanded
          ? 'bg-steel border-crimson/30'
          : 'bg-charcoal border-white/5 hover:border-white/10'
      )}
    >
      <div className="flex items-center justify-between">
        <div>
          <p className="font-medium text-foreground">{exercise.name}</p>
          <p className="text-xs text-muted capitalize mt-0.5">
            {exercise.equipment || 'Various'}
            {exercise.unilateral && ' | Unilateral'}
          </p>
        </div>
        {expanded ? (
          <ChevronDown className="w-4 h-4 text-muted" />
        ) : (
          <ChevronRight className="w-4 h-4 text-muted" />
        )}
      </div>
      {expanded && (
        <div className="mt-3 pt-3 border-t border-white/5 text-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-secondary">Pattern:</span>
            <span className="text-foreground font-mono text-xs">
              {exercise.pattern.replace(/_/g, ' ')}
            </span>
          </div>
          {exercise.unilateral && (
            <div className="flex items-center justify-between">
              <span className="text-secondary">Type:</span>
              <span className="text-foreground">Unilateral (+5% stimulus)</span>
            </div>
          )}
        </div>
      )}
    </button>
  );
}

function CategorySection({ category, equipment }: { category: ExerciseCategory; equipment: Equipment }) {
  const [expanded, setExpanded] = useState(true);

  const filteredExercises = useMemo(() => {
    if (equipment === 'all') return category.exercises;
    return category.exercises.filter(e => e.equipment === equipment);
  }, [category.exercises, equipment]);

  if (filteredExercises.length === 0) return null;

  return (
    <div className="space-y-3">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between py-2"
      >
        <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
          {expanded ? <ChevronDown className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
          {category.name}
        </h2>
        <span className="text-sm text-muted">{filteredExercises.length} exercises</span>
      </button>
      {expanded && (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
          {filteredExercises.map((exercise) => (
            <ExerciseCard key={exercise.name} exercise={exercise} />
          ))}
        </div>
      )}
    </div>
  );
}

function CustomExerciseCard({
  exercise,
  onEdit,
  onDelete,
}: {
  exercise: CustomExerciseResponse;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [expanded, setExpanded] = useState(false);

  const totalTargets = Object.keys(exercise.prime_targets || {}).length +
    Object.keys(exercise.secondary_targets || {}).length +
    Object.keys(exercise.tertiary_targets || {}).length +
    Object.keys(exercise.quaternary_targets || {}).length;

  return (
    <div
      className={cn(
        'p-3 rounded-lg transition-all border',
        expanded
          ? 'bg-steel border-crimson/30'
          : 'bg-charcoal border-white/5 hover:border-white/10'
      )}
    >
      <div className="flex items-start justify-between">
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex-1 text-left"
        >
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-crimson" />
            <p className="font-medium text-foreground">{exercise.exercise_name}</p>
          </div>
          <p className="text-xs text-muted mt-0.5">
            {totalTargets} muscles | {exercise.is_bilateral ? 'Bilateral' : 'Unilateral'} | {exercise.resistance_profile}
          </p>
        </button>
        <div className="flex items-center gap-1">
          <button
            onClick={onEdit}
            className="p-1.5 text-muted hover:text-foreground transition-colors"
            title="Edit"
          >
            <Pencil className="w-4 h-4" />
          </button>
          <button
            onClick={onDelete}
            className="p-1.5 text-muted hover:text-error transition-colors"
            title="Delete"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {expanded && (
        <div className="mt-3 pt-3 border-t border-white/5 text-sm space-y-3">
          {/* Prime Movers */}
          {Object.keys(exercise.prime_targets || {}).length > 0 && (
            <div>
              <span className="text-xs text-crimson font-medium">Prime:</span>
              <div className="flex flex-wrap gap-1 mt-1">
                {Object.entries(exercise.prime_targets).map(([muscle, weight]) => (
                  <span key={muscle} className="px-2 py-0.5 bg-crimson/10 text-crimson text-xs rounded">
                    {muscle.replace(/_/g, ' ')} ({(weight * 100).toFixed(0)}%)
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Secondary Movers */}
          {Object.keys(exercise.secondary_targets || {}).length > 0 && (
            <div>
              <span className="text-xs text-yellow-400 font-medium">Secondary:</span>
              <div className="flex flex-wrap gap-1 mt-1">
                {Object.entries(exercise.secondary_targets).map(([muscle, weight]) => (
                  <span key={muscle} className="px-2 py-0.5 bg-yellow-400/10 text-yellow-400 text-xs rounded">
                    {muscle.replace(/_/g, ' ')} ({(weight * 100).toFixed(0)}%)
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Tertiary Movers */}
          {Object.keys(exercise.tertiary_targets || {}).length > 0 && (
            <div>
              <span className="text-xs text-blue-400 font-medium">Tertiary:</span>
              <div className="flex flex-wrap gap-1 mt-1">
                {Object.entries(exercise.tertiary_targets).map(([muscle, weight]) => (
                  <span key={muscle} className="px-2 py-0.5 bg-blue-400/10 text-blue-400 text-xs rounded">
                    {muscle.replace(/_/g, ' ')} ({(weight * 100).toFixed(0)}%)
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Quaternary Movers */}
          {Object.keys(exercise.quaternary_targets || {}).length > 0 && (
            <div>
              <span className="text-xs text-muted font-medium">Quaternary:</span>
              <div className="flex flex-wrap gap-1 mt-1">
                {Object.entries(exercise.quaternary_targets).map(([muscle, weight]) => (
                  <span key={muscle} className="px-2 py-0.5 bg-white/5 text-muted text-xs rounded">
                    {muscle.replace(/_/g, ' ')} ({(weight * 100).toFixed(0)}%)
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Properties */}
          <div className="flex items-center gap-4 pt-2 text-xs text-muted">
            <span>Axial Load: {(exercise.axial_load * 100).toFixed(0)}%</span>
            <span>Profile: {exercise.resistance_profile}</span>
          </div>
        </div>
      )}
    </div>
  );
}

export function ExercisesPage() {
  const { isAuthenticated } = useAuth();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>('library');
  const [searchQuery, setSearchQuery] = useState('');
  const [equipment, setEquipment] = useState<Equipment>('all');

  // Custom exercises state
  const [customExercises, setCustomExercises] = useState<CustomExerciseResponse[]>([]);
  const [loadingCustom, setLoadingCustom] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingExercise, setEditingExercise] = useState<CustomExerciseResponse | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingExercise, setDeletingExercise] = useState<CustomExerciseResponse | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Load custom exercises
  useEffect(() => {
    if (isAuthenticated && tab === 'custom') {
      setLoadingCustom(true);
      listCustomExercises()
        .then((res) => setCustomExercises(res.exercises))
        .catch((err) => console.error('Failed to load custom exercises:', err))
        .finally(() => setLoadingCustom(false));
    }
  }, [isAuthenticated, tab]);

  const searchResults = useMemo(() => {
    if (searchQuery.length < 2) return null;
    return searchExercises(searchQuery, 20);
  }, [searchQuery]);

  const totalExercises = EXERCISE_DATABASE.reduce(
    (sum, cat) => sum + cat.exercises.length,
    0
  );

  const handleCreateExercise = () => {
    setEditingExercise(null);
    setEditorOpen(true);
  };

  const handleEditExercise = (exercise: CustomExerciseResponse) => {
    setEditingExercise(exercise);
    setEditorOpen(true);
  };

  const handleSaveExercise = async (data: CustomExerciseCreate) => {
    if (editingExercise) {
      const updated = await updateCustomExercise(editingExercise.id, data);
      setCustomExercises((prev) =>
        prev.map((ex) => (ex.id === editingExercise.id ? updated : ex))
      );
    } else {
      const created = await createCustomExercise(data);
      setCustomExercises((prev) => [...prev, created]);
    }
    // Invalidate cached list so ExerciseRow dropdowns pick up the change
    queryClient.invalidateQueries({ queryKey: customExerciseKeys.list() });
  };

  const handleDeleteClick = (exercise: CustomExerciseResponse) => {
    setDeletingExercise(exercise);
    setDeleteDialogOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!deletingExercise) return;
    setDeleting(true);
    try {
      await deleteCustomExercise(deletingExercise.id);
      setCustomExercises((prev) => prev.filter((ex) => ex.id !== deletingExercise.id));
      queryClient.invalidateQueries({ queryKey: customExerciseKeys.list() });
      setDeleteDialogOpen(false);
      setDeletingExercise(null);
    } catch (err) {
      console.error('Failed to delete exercise:', err);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Exercise Library</h1>
          <p className="text-secondary">
            {tab === 'library'
              ? `${totalExercises} exercises mapped to movement patterns`
              : `${customExercises.length} custom exercises`}
          </p>
        </div>
        {tab === 'custom' && isAuthenticated && (
          <Button onClick={handleCreateExercise}>
            <Plus className="w-4 h-4 mr-2" />
            New Exercise
          </Button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-white/8">
        <button
          onClick={() => setTab('library')}
          className={cn(
            'flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors',
            tab === 'library'
              ? 'border-crimson text-foreground'
              : 'border-transparent text-secondary hover:text-foreground'
          )}
        >
          <BookOpen className="w-4 h-4" />
          Library
        </button>
        <button
          onClick={() => setTab('custom')}
          className={cn(
            'flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors',
            tab === 'custom'
              ? 'border-crimson text-foreground'
              : 'border-transparent text-secondary hover:text-foreground'
          )}
        >
          <Sparkles className="w-4 h-4" />
          Custom Exercises
        </button>
      </div>

      {/* Library Tab */}
      {tab === 'library' && (
        <>
          {/* Filters */}
          <Card>
            <CardContent className="pt-4">
              <div className="flex flex-col sm:flex-row gap-4">
                {/* Search */}
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search exercises..."
                    className="w-full bg-charcoal border border-white/10 rounded-md pl-10 pr-3 py-2 text-foreground placeholder:text-muted focus:outline-none focus:border-crimson/50"
                  />
                </div>

                {/* Equipment filter */}
                <div className="relative">
                  <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
                  <select
                    value={equipment}
                    onChange={(e) => setEquipment(e.target.value as Equipment)}
                    className="w-full sm:w-48 bg-charcoal border border-white/10 rounded-md pl-10 pr-3 py-2 text-foreground focus:outline-none focus:border-crimson/50 appearance-none cursor-pointer"
                  >
                    {equipmentOptions.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Search Results */}
          {searchResults ? (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-foreground">
                Search Results ({searchResults.length})
              </h2>
              {searchResults.length === 0 ? (
                <Card>
                  <CardContent className="py-8 text-center">
                    <Dumbbell className="w-12 h-12 mx-auto mb-3 text-muted" />
                    <p className="text-foreground font-medium">No exercises found</p>
                    <p className="text-sm text-muted mt-1">Try a different search term</p>
                  </CardContent>
                </Card>
              ) : (
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
                  {searchResults.map((exercise) => (
                    <ExerciseCard key={exercise.name} exercise={exercise} />
                  ))}
                </div>
              )}
            </div>
          ) : (
            /* Category Sections */
            <div className="space-y-8">
              {EXERCISE_DATABASE.map((category) => (
                <CategorySection
                  key={category.name}
                  category={category}
                  equipment={equipment}
                />
              ))}
            </div>
          )}
        </>
      )}

      {/* Custom Exercises Tab */}
      {tab === 'custom' && (
        <>
          {!isAuthenticated ? (
            <Card>
              <CardContent className="py-12 text-center">
                <Sparkles className="w-12 h-12 mx-auto mb-3 text-muted" />
                <p className="text-foreground font-medium">Sign in to create custom exercises</p>
                <p className="text-sm text-muted mt-1">
                  Custom exercises let you define your own muscle targets and properties
                </p>
              </CardContent>
            </Card>
          ) : loadingCustom ? (
            <Card>
              <CardContent className="py-12 text-center text-muted">
                Loading custom exercises...
              </CardContent>
            </Card>
          ) : customExercises.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <Sparkles className="w-12 h-12 mx-auto mb-3 text-muted" />
                <p className="text-foreground font-medium">No custom exercises yet</p>
                <p className="text-sm text-muted mt-1 mb-4">
                  Create exercises with custom muscle targets and weights
                </p>
                <Button onClick={handleCreateExercise}>
                  <Plus className="w-4 h-4 mr-2" />
                  Create Your First Exercise
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {customExercises.map((exercise) => (
                <CustomExerciseCard
                  key={exercise.id}
                  exercise={exercise}
                  onEdit={() => handleEditExercise(exercise)}
                  onDelete={() => handleDeleteClick(exercise)}
                />
              ))}
            </div>
          )}
        </>
      )}

      {/* Custom Exercise Editor Modal */}
      <CustomExerciseEditor
        isOpen={editorOpen}
        onClose={() => setEditorOpen(false)}
        onSave={handleSaveExercise}
        existingExercise={editingExercise}
      />

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        isOpen={deleteDialogOpen}
        onClose={() => setDeleteDialogOpen(false)}
        onConfirm={handleConfirmDelete}
        title="Delete Custom Exercise"
        description={`Are you sure you want to delete "${deletingExercise?.exercise_name}"? This action cannot be undone.`}
        confirmText="Delete"
        variant="destructive"
        loading={deleting}
      />
    </div>
  );
}
