import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  customExerciseKeys,
  listCustomExercises,
  createCustomExercise,
  updateCustomExercise,
  deleteCustomExercise,
} from '../api/customExercises.api';
import type { CustomExerciseCreate, CustomExerciseUpdate } from '../types/api.types';

export function useCustomExercises() {
  return useQuery({
    queryKey: customExerciseKeys.list(),
    queryFn: listCustomExercises,
    staleTime: 10 * 60 * 1000,
  });
}

export function useCreateCustomExercise() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CustomExerciseCreate) => createCustomExercise(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: customExerciseKeys.all });
    },
  });
}

export function useUpdateCustomExercise() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: CustomExerciseUpdate }) =>
      updateCustomExercise(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: customExerciseKeys.all });
    },
  });
}

export function useDeleteCustomExercise() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteCustomExercise(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: customExerciseKeys.all });
    },
  });
}
