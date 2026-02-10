import { useState, useEffect } from 'react';
import { Plus, Trash2, ChevronDown, ChevronUp } from 'lucide-react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ExerciseRow } from './ExerciseRow';
import type { SessionInput, ExerciseInput } from '@/types/api.types';

interface SessionBuilderProps {
  session: SessionInput;
  onUpdate: (session: SessionInput) => void;
  onRemove: () => void;
  canRemove: boolean;
}

// Wrapper component for sortable exercise rows
function SortableExerciseRow({
  id,
  exercise,
  index,
  onUpdate,
  onRemove,
}: {
  id: string;
  exercise: ExerciseInput;
  index: number;
  onUpdate: (exercise: ExerciseInput) => void;
  onRemove: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 100 : 1,
  };

  return (
    <div ref={setNodeRef} style={style}>
      <ExerciseRow
        index={index}
        name={exercise.name}
        sets={exercise.sets}
        unilateral={exercise.unilateral}
        resistanceProfile={exercise.resistance_profile}
        onNameChange={(name, unilateral) => {
          console.log('[SessionBuilder] onNameChange received:', name, 'for exercise:', exercise.id);
          onUpdate({ ...exercise, name, unilateral });
        }}
        onSetsChange={(sets) => onUpdate({ ...exercise, sets })}
        onUnilateralChange={(unilateral) => onUpdate({ ...exercise, unilateral })}
        onResistanceProfileChange={(profile) => onUpdate({ ...exercise, resistance_profile: profile })}
        onRemove={onRemove}
        dragHandleProps={{ ...attributes, ...listeners }}
      />
    </div>
  );
}

export function SessionBuilder({ session, onUpdate, onRemove, canRemove }: SessionBuilderProps) {
  const [isExpanded, setIsExpanded] = useState(true);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8, // Require 8px movement before drag starts
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  function updateName(name: string) {
    onUpdate({ ...session, name });
  }

  function updateDay(day: number) {
    onUpdate({ ...session, day });
  }

  function updateExercise(index: number, exercise: ExerciseInput) {
    const newExercises = [...session.exercises];
    newExercises[index] = exercise;
    onUpdate({ ...session, exercises: newExercises });
  }

  function addExercise() {
    onUpdate({
      ...session,
      exercises: [...session.exercises, { id: crypto.randomUUID(), name: '', sets: 1, unilateral: false }],
    });
  }

  function removeExercise(index: number) {
    const newExercises = session.exercises.filter((_, i) => i !== index);
    onUpdate({ ...session, exercises: newExercises });
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = session.exercises.findIndex((ex) => ex.id === active.id);
      const newIndex = session.exercises.findIndex((ex) => ex.id === over.id);

      if (oldIndex !== -1 && newIndex !== -1) {
        const newExercises = arrayMove(session.exercises, oldIndex, newIndex);
        onUpdate({ ...session, exercises: newExercises });
      }
    }
  }

  const totalSets = session.exercises.reduce((sum, ex) => sum + ex.sets, 0);
  const exerciseCount = session.exercises.filter(ex => ex.name.trim()).length;

  // Ensure all exercises have stable IDs (generate if missing)
  // Use useEffect to avoid state updates during render
  useEffect(() => {
    const needsIds = session.exercises.some(ex => !ex.id);
    if (needsIds) {
      const exercisesWithIds = session.exercises.map((ex) =>
        ex.id ? ex : { ...ex, id: crypto.randomUUID() }
      );
      onUpdate({ ...session, exercises: exercisesWithIds });
    }
  }, [session.exercises.length]); // Only run when exercises are added/removed

  // Get exercise IDs for drag-and-drop (use existing or generate temp ones for render)
  const exerciseIds = session.exercises.map((ex) => ex.id || crypto.randomUUID());

  return (
    <div className="bg-steel rounded-lg border border-white/5 overflow-visible">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-2 sm:gap-3 p-3 sm:p-4 border-b border-white/5">
        <button
          type="button"
          onClick={() => setIsExpanded(!isExpanded)}
          className="p-1 text-muted hover:text-foreground transition-colors"
        >
          {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>

        <div className="flex items-center gap-2">
          <span className="text-xs text-muted">Day</span>
          <input
            type="number"
            value={session.day}
            onChange={(e) => updateDay(parseInt(e.target.value) || 1)}
            min={1}
            max={14}
            className="w-12 bg-charcoal border border-white/10 rounded px-2 py-1 text-sm text-center text-foreground focus:outline-none focus:border-crimson/50"
          />
        </div>

        <input
          type="text"
          value={session.name}
          onChange={(e) => updateName(e.target.value)}
          placeholder="Session name (e.g., Push, Pull)"
          className="flex-1 min-w-[120px] bg-charcoal border border-white/10 rounded px-3 py-1.5 text-sm text-foreground placeholder:text-muted focus:outline-none focus:border-crimson/50"
        />

        <div className="flex items-center gap-2 sm:gap-3">
          <span className="text-xs text-muted whitespace-nowrap">
            {exerciseCount} ex | {totalSets} sets
          </span>
          {canRemove && (
            <button
              type="button"
              onClick={onRemove}
              className="p-1.5 text-muted hover:text-red-400 transition-colors"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Exercises */}
      {isExpanded && (
        <div className="p-4 space-y-2 overflow-visible">
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext items={exerciseIds} strategy={verticalListSortingStrategy}>
              {session.exercises.map((exercise, index) => (
                <SortableExerciseRow
                  key={exerciseIds[index]}
                  id={exerciseIds[index]}
                  exercise={exercise}
                  index={index}
                  onUpdate={(ex) => updateExercise(index, ex)}
                  onRemove={() => removeExercise(index)}
                />
              ))}
            </SortableContext>
          </DndContext>

          <button
            type="button"
            onClick={addExercise}
            className="w-full py-2 px-3 flex items-center justify-center gap-2 text-sm text-secondary hover:text-foreground border border-dashed border-white/10 hover:border-white/20 rounded-md transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add Exercise
          </button>
        </div>
      )}
    </div>
  );
}

// Quick add session templates
interface SessionTemplateProps {
  onSelect: (session: SessionInput) => void;
}

const sessionTemplates: SessionInput[] = [
  {
    name: 'Push',
    day: 1,
    exercises: [
      { name: 'Bench Press', sets: 3, unilateral: false },
      { name: 'Incline Dumbbell Press', sets: 3, unilateral: false },
      { name: 'Lateral Raise', sets: 3, unilateral: false },
      { name: 'Tricep Pushdown', sets: 3, unilateral: false },
    ],
  },
  {
    name: 'Pull',
    day: 2,
    exercises: [
      { name: 'Lat Pulldown', sets: 3, unilateral: false },
      { name: 'Barbell Row', sets: 3, unilateral: false },
      { name: 'Face Pull', sets: 3, unilateral: false },
      { name: 'Barbell Curl', sets: 3, unilateral: false },
    ],
  },
  {
    name: 'Legs',
    day: 3,
    exercises: [
      { name: 'Squat', sets: 4, unilateral: false },
      { name: 'Romanian Deadlift', sets: 3, unilateral: false },
      { name: 'Leg Extension', sets: 3, unilateral: false },
      { name: 'Leg Curl', sets: 3, unilateral: false },
      { name: 'Calf Raise', sets: 3, unilateral: false },
    ],
  },
  {
    name: 'Upper',
    day: 1,
    exercises: [
      { name: 'Bench Press', sets: 3, unilateral: false },
      { name: 'Barbell Row', sets: 3, unilateral: false },
      { name: 'Overhead Press', sets: 3, unilateral: false },
      { name: 'Lat Pulldown', sets: 3, unilateral: false },
      { name: 'Lateral Raise', sets: 2, unilateral: false },
    ],
  },
  {
    name: 'Lower',
    day: 2,
    exercises: [
      { name: 'Squat', sets: 4, unilateral: false },
      { name: 'Romanian Deadlift', sets: 3, unilateral: false },
      { name: 'Leg Press', sets: 3, unilateral: false },
      { name: 'Leg Curl', sets: 3, unilateral: false },
      { name: 'Calf Raise', sets: 4, unilateral: false },
    ],
  },
  {
    name: 'Full Body',
    day: 1,
    exercises: [
      { name: 'Squat', sets: 3, unilateral: false },
      { name: 'Bench Press', sets: 3, unilateral: false },
      { name: 'Barbell Row', sets: 3, unilateral: false },
      { name: 'Romanian Deadlift', sets: 2, unilateral: false },
      { name: 'Overhead Press', sets: 2, unilateral: false },
    ],
  },
  {
    name: 'Rest',
    day: 4,
    exercises: [],
  },
];

export function SessionTemplates({ onSelect }: SessionTemplateProps) {
  return (
    <div className="flex flex-wrap gap-2">
      {sessionTemplates.map((template) => (
        <button
          key={template.name}
          type="button"
          onClick={() => onSelect(template)}
          className="px-3 py-1.5 bg-steel hover:bg-charcoal border border-white/10 hover:border-crimson/30 rounded-md text-sm text-secondary hover:text-foreground transition-colors"
        >
          {template.name}
        </button>
      ))}
    </div>
  );
}
