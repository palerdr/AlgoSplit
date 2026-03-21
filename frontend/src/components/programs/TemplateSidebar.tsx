import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useDraggable } from '@dnd-kit/core';
import { ChevronRight, ChevronDown, Layers, GripVertical } from 'lucide-react';
import { Spinner } from '@/components/ui';
import { getSplits, splitKeys } from '@/api/splits.api';
import { TemplateCard } from './TemplateCard';
import { cn } from '@/lib/utils';
import type { SplitResponse } from '@/types/api.types';

interface TemplateSidebarProps {
  programId: string;
}

function SplitRow({
  split,
  isExpanded,
  onToggle,
}: {
  split: SplitResponse;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `split-${split.id}`,
    data: {
      type: 'split' as const,
      splitId: split.id,
      sessions: split.sessions.map((s) => ({
        id: s.id,
        name: s.name,
        dayNumber: s.day_number,
      })),
    },
  });

  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn('flex items-center gap-0.5', isDragging && 'opacity-50')}
    >
      <div {...listeners} {...attributes} className="text-muted cursor-grab p-0.5 shrink-0">
        <GripVertical className="w-3 h-3" />
      </div>
      <button
        onClick={onToggle}
        className="flex-1 flex items-center gap-1.5 px-1 py-1.5 rounded hover:bg-steel/50 text-left min-w-0"
      >
        {isExpanded
          ? <ChevronDown className="w-3 h-3 text-muted shrink-0" />
          : <ChevronRight className="w-3 h-3 text-muted shrink-0" />
        }
        <span className="text-sm text-foreground font-medium flex-1 truncate">{split.name}</span>
        <span className="text-[10px] text-muted shrink-0">{split.sessions.length}d</span>
      </button>
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function TemplateSidebar({ programId: _programId }: TemplateSidebarProps) {
  const [expandedSplits, setExpandedSplits] = useState<Set<string>>(new Set());

  const { data, isLoading } = useQuery({
    queryKey: splitKeys.list(),
    queryFn: getSplits,
  });

  const toggleSplit = (id: string) => {
    setExpandedSplits(prev => {
      const next = new Set(prev);
      if (next.has(id)) { next.delete(id); } else { next.add(id); }
      return next;
    });
  };

  return (
    <div className="space-y-3">
      <div>
        <h3 className="font-medium text-foreground text-sm">Session Templates</h3>
        <p className="text-[11px] text-muted mt-1">Drag a split or individual sessions onto the calendar</p>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-4">
          <Spinner size="sm" />
        </div>
      ) : !data?.splits.length ? (
        <div className="text-center py-4">
          <Layers className="w-6 h-6 text-muted mx-auto mb-2" />
          <p className="text-xs text-muted">No splits yet</p>
          <p className="text-[10px] text-muted mt-1">Create a split first to use its sessions here</p>
        </div>
      ) : (
        <div className="space-y-1">
          {data.splits.map((split) => (
            <div key={split.id}>
              <SplitRow
                split={split}
                isExpanded={expandedSplits.has(split.id)}
                onToggle={() => toggleSplit(split.id)}
              />

              {expandedSplits.has(split.id) && (
                <div className="ml-5 mt-0.5 space-y-1">
                  {split.sessions.map((session) => (
                    <TemplateCard
                      key={session.id}
                      id={session.id}
                      name={session.name}
                      exerciseCount={session.exercises.length}
                      splitName={split.name}
                    />
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
