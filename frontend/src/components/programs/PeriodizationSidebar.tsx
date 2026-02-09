import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, ChevronRight, ChevronDown, Layers } from 'lucide-react';
import { Button, Spinner, Input } from '@/components/ui';
import { getMacros, createMacro, createMeso, createMicro, periodizationKeys } from '@/api/periodization.api';
import { useProgramStore } from '@/stores/programStore';
import { cn } from '@/lib/utils';
import type { MicroCycleResponse } from '@/types/api.types';

interface PeriodizationSidebarProps {
  programId: string;
}

export function PeriodizationSidebar({ programId }: PeriodizationSidebarProps) {
  const queryClient = useQueryClient();
  const { selectedMicroId, setSelectedMicroId, openDiagnostics } = useProgramStore();
  const [expandedMacros, setExpandedMacros] = useState<Set<string>>(new Set());
  const [expandedMesos, setExpandedMesos] = useState<Set<string>>(new Set());
  const [newMacroName, setNewMacroName] = useState('');
  const [addingMacro, setAddingMacro] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: periodizationKeys.macros(programId),
    queryFn: () => getMacros(programId),
  });

  const createMacroMut = useMutation({
    mutationFn: (name: string) => createMacro(programId, { name }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: periodizationKeys.macros(programId) });
      setNewMacroName('');
      setAddingMacro(false);
    },
  });

  const createMesoMut = useMutation({
    mutationFn: ({ macroId, name }: { macroId: string; name: string }) =>
      createMeso(programId, macroId, { name }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: periodizationKeys.macros(programId) }),
  });

  const createMicroMut = useMutation({
    mutationFn: ({ mesoId, weekIndex }: { mesoId: string; weekIndex: number }) =>
      createMicro(programId, mesoId, { week_index: weekIndex }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: periodizationKeys.macros(programId) }),
  });

  const toggleMacro = (id: string) => {
    setExpandedMacros(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleMeso = (id: string) => {
    setExpandedMesos(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleMicroClick = (micro: MicroCycleResponse) => {
    setSelectedMicroId(micro.id);
    openDiagnostics('micro', micro.id);
  };

  if (isLoading) {
    return <div className="flex justify-center py-4"><Spinner size="sm" /></div>;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-medium text-foreground text-sm">Periodization</h3>
        <Button variant="ghost" size="sm" onClick={() => setAddingMacro(true)}>
          <Plus className="w-3 h-3" />
        </Button>
      </div>

      {addingMacro && (
        <div className="flex items-center gap-1">
          <Input
            value={newMacroName}
            onChange={(e) => setNewMacroName(e.target.value)}
            placeholder="Phase name"
            className="text-xs"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && newMacroName.trim()) createMacroMut.mutate(newMacroName.trim());
              if (e.key === 'Escape') setAddingMacro(false);
            }}
          />
        </div>
      )}

      {(!data?.macros.length && !addingMacro) ? (
        <div className="text-center py-4">
          <Layers className="w-6 h-6 text-muted mx-auto mb-2" />
          <p className="text-xs text-muted mb-2">No periodization yet</p>
          <Button variant="secondary" size="sm" onClick={() => setAddingMacro(true)}>
            Add Phase
          </Button>
        </div>
      ) : (
        <div className="space-y-1">
          {data?.macros.map((macro) => (
            <div key={macro.id}>
              {/* Macro row */}
              <button
                onClick={() => toggleMacro(macro.id)}
                className="w-full flex items-center gap-1 px-2 py-1.5 rounded hover:bg-steel/50 text-left group"
              >
                {expandedMacros.has(macro.id) ? <ChevronDown className="w-3 h-3 text-muted" /> : <ChevronRight className="w-3 h-3 text-muted" />}
                <span className="text-sm text-foreground font-medium flex-1 truncate">{macro.name}</span>
                <span className="text-[10px] text-muted">{macro.mesos.length}m</span>
              </button>

              {/* Mesos */}
              {expandedMacros.has(macro.id) && (
                <div className="ml-4 space-y-0.5">
                  {macro.mesos.map((meso) => (
                    <div key={meso.id}>
                      <button
                        onClick={() => toggleMeso(meso.id)}
                        className="w-full flex items-center gap-1 px-2 py-1 rounded hover:bg-steel/50 text-left"
                      >
                        {expandedMesos.has(meso.id) ? <ChevronDown className="w-2.5 h-2.5 text-muted" /> : <ChevronRight className="w-2.5 h-2.5 text-muted" />}
                        <span className="text-xs text-secondary flex-1 truncate">{meso.name}</span>
                        <span className="text-[10px] text-muted">{meso.micros.length}w</span>
                      </button>

                      {/* Micros */}
                      {expandedMesos.has(meso.id) && (
                        <div className="ml-4 space-y-0.5">
                          {meso.micros.map((micro) => (
                            <button
                              key={micro.id}
                              onClick={() => handleMicroClick(micro)}
                              className={cn(
                                'w-full flex items-center gap-2 px-2 py-1 rounded text-left text-xs',
                                selectedMicroId === micro.id ? 'bg-crimson/10 text-crimson' : 'text-muted hover:bg-steel/50 hover:text-secondary'
                              )}
                            >
                              <span className="flex-1">
                                Week {micro.week_index + 1}
                                {micro.deload && <span className="text-amber-400 ml-1">(deload)</span>}
                              </span>
                              <span className="text-[10px]">{micro.session_ids.length}s</span>
                            </button>
                          ))}
                          <button
                            onClick={() => createMicroMut.mutate({ mesoId: meso.id, weekIndex: meso.micros.length })}
                            className="w-full text-left px-2 py-1 text-[10px] text-muted hover:text-secondary"
                          >
                            + Add Week
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                  <button
                    onClick={() => createMesoMut.mutate({ macroId: macro.id, name: `Block ${macro.mesos.length + 1}` })}
                    className="w-full text-left px-2 py-1 text-[10px] text-muted hover:text-secondary"
                  >
                    + Add Block
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
