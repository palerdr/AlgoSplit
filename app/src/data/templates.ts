// Seed workout templates. Exercise ids reference the generated catalog.

export interface TemplateExercise {
  exerciseId: string;
  sets: number;
}

export interface WorkoutTemplate {
  id: string;
  name: string;
  exercises: TemplateExercise[];
}

export const TEMPLATES: WorkoutTemplate[] = [
  {
    id: 'push',
    name: 'Push Day',
    exercises: [
      { exerciseId: 'barbell_bench_press', sets: 3 },
      { exerciseId: 'incline_dumbbell_press', sets: 3 },
      { exerciseId: 'overhead_press', sets: 3 },
      { exerciseId: 'lateral_raise', sets: 3 },
      { exerciseId: 'tricep_pushdown', sets: 3 },
    ],
  },
  {
    id: 'pull',
    name: 'Pull Day',
    exercises: [
      { exerciseId: 'pull_up', sets: 3 },
      { exerciseId: 'barbell_row', sets: 3 },
      { exerciseId: 'lat_pulldown', sets: 3 },
      { exerciseId: 'face_pull', sets: 3 },
      { exerciseId: 'barbell_curl', sets: 3 },
    ],
  },
  {
    id: 'legs',
    name: 'Leg Day',
    exercises: [
      { exerciseId: 'back_squat', sets: 3 },
      { exerciseId: 'romanian_deadlift', sets: 3 },
      { exerciseId: 'leg_press', sets: 3 },
      { exerciseId: 'lying_leg_curl', sets: 3 },
      { exerciseId: 'standing_calf_raise', sets: 3 },
    ],
  },
];
