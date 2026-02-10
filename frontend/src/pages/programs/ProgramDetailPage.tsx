import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { DndContext, PointerSensor, useSensor, useSensors, pointerWithin } from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core';
import { addDays, format } from 'date-fns';
import { ArrowLeft, Settings } from 'lucide-react';
import { Button, Card, CardContent, Spinner } from '@/components/ui';
import { getProgram, programKeys, scheduleSession, batchScheduleSessions } from '@/api/programs.api';
import { createTemplateFromSession } from '@/api/sessionTemplates.api';
import {
  ProgramCalendar, TemplateSidebar, SessionDetailModal,
  PeriodizationSidebar, WeekDiagnostics,
} from '@/components/programs';
import { useProgramStore } from '@/stores/programStore';
import type { ProgramSessionResponse, ProgramDetailResponse } from '@/types/api.types';

function makePlaceholderSession(programId: string, date: string, name: string): ProgramSessionResponse {
  return {
    id: `temp-${date}-${Date.now()}`,
    program_id: programId,
    micro_id: null,
    date,
    template_id: null,
    template_name: name,
    custom_name: null,
    status: 'planned',
    notes: null,
    workout_log_id: null,
    exercises: [],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

export function ProgramDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [selectedSession, setSelectedSession] = useState<ProgramSessionResponse | null>(null);
  const { activeTab, setActiveTab, diagnosticsLevel, diagnosticsTargetId, diagnosticsOpen, selectedDates, clearSelectedDates } = useProgramStore();
  const queryClient = useQueryClient();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { delay: 200, tolerance: 5 } })
  );

  const { data: program, isLoading } = useQuery({
    queryKey: programKeys.detail(id!),
    queryFn: () => getProgram(id!),
    enabled: !!id,
  });

  const scheduleMutation = useMutation({
    mutationFn: async (params: { sessionId: string; sessionName: string; dates: string[] }) => {
      const template = await createTemplateFromSession(params.sessionId, params.sessionName);
      if (params.dates.length === 1) {
        return scheduleSession(id!, { date: params.dates[0], template_id: template.id });
      }
      return batchScheduleSessions(
        id!,
        params.dates.map((d) => ({ date: d, template_id: template.id }))
      );
    },
    onMutate: async (params) => {
      await queryClient.cancelQueries({ queryKey: programKeys.detail(id!) });
      const prev = queryClient.getQueryData<ProgramDetailResponse>(programKeys.detail(id!));
      queryClient.setQueryData<ProgramDetailResponse>(programKeys.detail(id!), (old) => {
        if (!old) return old;
        const placeholders = params.dates.map((d) => makePlaceholderSession(id!, d, params.sessionName));
        return { ...old, sessions: [...old.sessions, ...placeholders] };
      });
      clearSelectedDates();
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(programKeys.detail(id!), ctx.prev);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: programKeys.detail(id!) });
    },
  });

  const splitScheduleMutation = useMutation({
    mutationFn: async (params: {
      sessions: Array<{ id: string; name: string; dayNumber: number }>;
      startDate: string;
    }) => {
      const start = new Date(params.startDate + 'T00:00:00');

      // Create all templates in parallel
      const templatesWithDates = await Promise.all(
        params.sessions.map(async (session) => {
          const template = await createTemplateFromSession(session.id, session.name);
          const sessionDate = addDays(start, session.dayNumber - 1);
          return { date: format(sessionDate, 'yyyy-MM-dd'), template_id: template.id };
        })
      );

      if (templatesWithDates.length === 1) {
        return scheduleSession(id!, templatesWithDates[0]);
      }
      return batchScheduleSessions(id!, templatesWithDates);
    },
    onMutate: async (params) => {
      await queryClient.cancelQueries({ queryKey: programKeys.detail(id!) });
      const prev = queryClient.getQueryData<ProgramDetailResponse>(programKeys.detail(id!));
      queryClient.setQueryData<ProgramDetailResponse>(programKeys.detail(id!), (old) => {
        if (!old) return old;
        const start = new Date(params.startDate + 'T00:00:00');
        const placeholders = params.sessions.map((s) => {
          const d = addDays(start, s.dayNumber - 1);
          return makePlaceholderSession(id!, format(d, 'yyyy-MM-dd'), s.name);
        });
        return { ...old, sessions: [...old.sessions, ...placeholders] };
      });
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(programKeys.detail(id!), ctx.prev);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: programKeys.detail(id!) });
    },
  });

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over) return;

    const dropDate = (over.data.current as { date: string })?.date;
    if (!dropDate) return;

    const dragData = active.data.current as Record<string, unknown> | undefined;

    if (dragData?.type === 'split') {
      // Dragged an entire split — schedule all its sessions starting from the drop date
      const sessions = dragData.sessions as Array<{ id: string; name: string; dayNumber: number }>;
      splitScheduleMutation.mutate({ sessions, startDate: dropDate });
    } else {
      // Dragged a single session
      const sessionId = active.id as string;
      const sessionName = (dragData as { name?: string })?.name || 'Session';
      const dates = selectedDates.length > 0 && selectedDates.includes(dropDate)
        ? selectedDates
        : [dropDate];
      scheduleMutation.mutate({ sessionId, sessionName, dates });
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Spinner />
      </div>
    );
  }

  if (!program) {
    return (
      <div className="p-4 md:p-6">
        <p className="text-muted">Program not found.</p>
        <Link to="/programs" className="text-crimson text-sm">Back to Programs</Link>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 sm:gap-4 min-w-0">
          <Link to="/programs">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="w-4 h-4" />
            </Button>
          </Link>
          <div className="min-w-0">
            <h1 className="text-lg sm:text-xl font-bold text-foreground truncate">{program.name}</h1>
            {program.goal && (
              <p className="text-xs sm:text-sm text-secondary truncate">{program.goal}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Tab toggle */}
          <div className="flex items-center gap-1 bg-steel rounded-md p-0.5">
            <button
              onClick={() => setActiveTab('calendar')}
              className={`px-2 sm:px-3 py-1 text-xs rounded ${
                activeTab === 'calendar' ? 'bg-charcoal text-foreground' : 'text-muted hover:text-secondary'
              }`}
            >
              Calendar
            </button>
            <button
              onClick={() => setActiveTab('periodization')}
              className={`px-2 sm:px-3 py-1 text-xs rounded ${
                activeTab === 'periodization' ? 'bg-charcoal text-foreground' : 'text-muted hover:text-secondary'
              }`}
            >
              Periodization
            </button>
          </div>
          <Button variant="ghost" size="sm">
            <Settings className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* 3-column layout */}
      <DndContext sensors={sensors} collisionDetection={pointerWithin} onDragEnd={handleDragEnd}>
        <div className="grid lg:grid-cols-[220px,1fr] xl:grid-cols-[220px,1fr,280px] gap-4">
          {/* Left sidebar - hidden on mobile */}
          <Card className="hidden lg:block">
            <CardContent className="pt-4">
              {activeTab === 'calendar' ? (
                <TemplateSidebar programId={program.id} />
              ) : (
                <PeriodizationSidebar programId={program.id} />
              )}
            </CardContent>
          </Card>

          {/* Calendar (always visible) */}
          <Card>
            <CardContent className="pt-4">
              <ProgramCalendar
                programId={program.id}
                sessions={program.sessions}
                onSessionClick={(s) => setSelectedSession(s)}
              />
            </CardContent>
          </Card>

          {/* Right panel - diagnostics */}
          <Card className="hidden xl:block">
            <CardContent className="pt-4">
              {diagnosticsOpen && diagnosticsLevel === 'micro' && diagnosticsTargetId ? (
                <div>
                  <h3 className="font-medium text-foreground text-sm mb-3">Week Diagnostics</h3>
                  <WeekDiagnostics programId={program.id} microId={diagnosticsTargetId} />
                </div>
              ) : (
                <div>
                  <h3 className="font-medium text-foreground text-sm mb-3">Diagnostics</h3>
                  <p className="text-xs text-muted">
                    {activeTab === 'periodization'
                      ? 'Select a week from the periodization tree to view its analysis.'
                      : 'Click a session on the calendar to view its muscle stimulus analysis.'}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </DndContext>

      {/* Session detail modal */}
      {selectedSession && (
        <SessionDetailModal
          session={selectedSession}
          programId={program.id}
          onClose={() => setSelectedSession(null)}
        />
      )}
    </div>
  );
}
