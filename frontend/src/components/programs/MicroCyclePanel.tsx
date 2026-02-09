import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Tag } from 'lucide-react';
import { Button } from '@/components/ui';
import { assignSessions, periodizationKeys } from '@/api/periodization.api';
import { programKeys } from '@/api/programs.api';
import { useProgramStore } from '@/stores/programStore';
import type { ProgramSessionResponse, MicroCycleResponse } from '@/types/api.types';

interface MicroCyclePanelProps {
  programId: string;
  micro: MicroCycleResponse;
  sessions: ProgramSessionResponse[];
}

export function MicroCyclePanel({ programId, micro, sessions }: MicroCyclePanelProps) {
  const queryClient = useQueryClient();
  const { selectedDates, clearSelectedDates } = useProgramStore();

  // Find sessions that belong to this micro
  const microSessions = sessions.filter(s => micro.session_ids.includes(s.id));
  // Find unassigned sessions on selected dates
  const unassignedOnDates = sessions.filter(
    s => selectedDates.includes(s.date) && !s.micro_id
  );

  const assignMut = useMutation({
    mutationFn: (sessionIds: string[]) => assignSessions(programId, micro.id, sessionIds),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: periodizationKeys.macros(programId) });
      queryClient.invalidateQueries({ queryKey: programKeys.detail(programId) });
      clearSelectedDates();
    },
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h4 className="text-sm font-medium text-foreground">
            Week {micro.week_index + 1}
            {micro.deload && <span className="text-amber-400 ml-1 text-xs">(Deload)</span>}
          </h4>
          <p className="text-xs text-muted">{microSessions.length} sessions assigned</p>
        </div>
      </div>

      {/* Assigned sessions */}
      {microSessions.length > 0 && (
        <div className="space-y-1">
          {microSessions.map(s => (
            <div key={s.id} className="flex items-center justify-between px-2 py-1 bg-steel/50 rounded text-xs">
              <span className="text-foreground">{s.custom_name || s.template_name || 'Untitled'}</span>
              <span className="text-muted">{s.date}</span>
            </div>
          ))}
        </div>
      )}

      {/* Assign unassigned sessions */}
      {unassignedOnDates.length > 0 && (
        <Button
          variant="secondary"
          size="sm"
          onClick={() => assignMut.mutate(unassignedOnDates.map(s => s.id))}
          disabled={assignMut.isPending}
          className="w-full"
        >
          <Tag className="w-3 h-3 mr-1" />
          Assign {unassignedOnDates.length} Selected Session{unassignedOnDates.length > 1 ? 's' : ''}
        </Button>
      )}
    </div>
  );
}
