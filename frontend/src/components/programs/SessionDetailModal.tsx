import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { X, Unlink, BarChart3 } from 'lucide-react';
import { Button, Spinner } from '@/components/ui';
import { detachSession, deleteProgramSession, runDiagnostics, programKeys } from '@/api/programs.api';
import { useProgramStore } from '@/stores/programStore';
import type { ProgramSessionResponse, AnalysisResponse } from '@/types/api.types';
import { MuscleChart } from '@/components/analysis';

interface SessionDetailModalProps {
  session: ProgramSessionResponse;
  programId: string;
  onClose: () => void;
}

export function SessionDetailModal({ session, programId, onClose }: SessionDetailModalProps) {
  const queryClient = useQueryClient();
  const { openDiagnostics } = useProgramStore();

  const { data: diagnostics, isLoading: diagLoading } = useQuery({
    queryKey: programKeys.diagnostics(programId, session.id),
    queryFn: () => runDiagnostics(programId, { level: 'session', target_id: session.id }),
    enabled: session.exercises.length > 0 || !!session.template_id,
  });

  const detachMutation = useMutation({
    mutationFn: () => detachSession(programId, session.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: programKeys.detail(programId) });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteProgramSession(programId, session.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: programKeys.detail(programId) });
      onClose();
    },
  });

  const displayName = session.custom_name || session.template_name || 'Untitled Session';
  const hasTemplate = !!session.template_id;
  const hasExercises = session.exercises.length > 0 || hasTemplate;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-charcoal border border-white/10 rounded-lg w-full max-w-lg max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b border-white/5">
          <div>
            <h3 className="font-semibold text-foreground">{displayName}</h3>
            <p className="text-xs text-muted">{session.date} · {session.status}</p>
          </div>
          <button onClick={onClose} className="text-muted hover:text-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {/* Template info */}
          {hasTemplate && (
            <div className="flex items-center justify-between">
              <p className="text-xs text-secondary">
                Using template: <span className="text-foreground">{session.template_name}</span>
              </p>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => detachMutation.mutate()}
                disabled={detachMutation.isPending}
              >
                <Unlink className="w-3 h-3 mr-1" />
                Detach
              </Button>
            </div>
          )}

          {/* Exercises list */}
          {session.exercises.length > 0 && (
            <div>
              <h4 className="text-xs text-secondary mb-2">Exercises</h4>
              <div className="space-y-1">
                {session.exercises.map((ex) => (
                  <div key={ex.id} className="flex items-center justify-between py-1 px-2 bg-steel/50 rounded text-sm">
                    <span className="text-foreground">{ex.exercise_name}</span>
                    <span className="text-muted">{ex.sets} sets</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Diagnostics */}
          {hasExercises && (
            <div>
              <h4 className="text-xs text-secondary mb-2 flex items-center gap-1">
                <BarChart3 className="w-3 h-3" />
                Session Diagnostics
              </h4>
              {diagLoading ? (
                <div className="flex justify-center py-4"><Spinner size="sm" /></div>
              ) : diagnostics ? (
                <div className="chart-fade-in">
                  <MuscleChart muscles={diagnostics.muscles} height={300} showAll={false} />
                </div>
              ) : (
                <p className="text-xs text-muted">No diagnostics available</p>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-2 pt-2 border-t border-white/5">
            <Button variant="ghost" size="sm" onClick={onClose}>Close</Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => deleteMutation.mutate()}
              disabled={deleteMutation.isPending}
              className="text-red-400 hover:text-red-300"
            >
              {deleteMutation.isPending ? 'Removing...' : 'Remove Session'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
