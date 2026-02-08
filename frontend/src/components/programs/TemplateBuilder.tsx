import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { X, Plus, Trash2 } from 'lucide-react';
import { Button, Input, NumberInput } from '@/components/ui';
import { createTemplate, templateKeys } from '@/api/sessionTemplates.api';

interface TemplateBuilderProps {
  onClose: () => void;
  programId: string;
}

interface ExerciseRow {
  exercise_name: string;
  sets: number;
}

export function TemplateBuilder({ onClose }: TemplateBuilderProps) {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [exercises, setExercises] = useState<ExerciseRow[]>([
    { exercise_name: '', sets: 3 },
  ]);

  const createMutation = useMutation({
    mutationFn: () =>
      createTemplate({
        name,
        exercises: exercises
          .filter((e) => e.exercise_name.trim())
          .map((e, i) => ({
            exercise_name: e.exercise_name,
            sets: e.sets,
            order_index: i,
          })),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: templateKeys.lists() });
      onClose();
    },
  });

  const addExercise = () => {
    setExercises([...exercises, { exercise_name: '', sets: 3 }]);
  };

  const removeExercise = (index: number) => {
    if (exercises.length <= 1) return;
    setExercises(exercises.filter((_, i) => i !== index));
  };

  const updateExercise = (index: number, field: keyof ExerciseRow, value: string | number) => {
    setExercises(exercises.map((e, i) => (i === index ? { ...e, [field]: value } : e)));
  };

  const canSubmit = name.trim() && exercises.some((e) => e.exercise_name.trim());

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-charcoal border border-white/10 rounded-lg p-4 w-full max-w-md max-h-[80vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-foreground">New Template</h3>
          <button onClick={onClose} className="text-muted hover:text-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-xs text-secondary mb-1">Template Name</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Push Day A"
            />
          </div>

          <div>
            <label className="block text-xs text-secondary mb-2">Exercises</label>
            <div className="space-y-2">
              {exercises.map((ex, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input
                    value={ex.exercise_name}
                    onChange={(e) => updateExercise(i, 'exercise_name', e.target.value)}
                    placeholder="Exercise name"
                    className="flex-1"
                  />
                  <NumberInput
                    value={ex.sets}
                    onChange={(val) => updateExercise(i, 'sets', val)}
                    min={1}
                    max={10}
                    className="w-16"
                  />
                  <button
                    onClick={() => removeExercise(i)}
                    className="text-muted hover:text-red-400 p-1"
                    disabled={exercises.length <= 1}
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
            <Button variant="ghost" size="sm" onClick={addExercise} className="mt-2">
              <Plus className="w-3 h-3 mr-1" /> Add Exercise
            </Button>
          </div>

          <div className="flex items-center gap-2 pt-2 border-t border-white/5">
            <Button variant="ghost" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={() => createMutation.mutate()}
              disabled={!canSubmit || createMutation.isPending}
            >
              {createMutation.isPending ? 'Creating...' : 'Create Template'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
