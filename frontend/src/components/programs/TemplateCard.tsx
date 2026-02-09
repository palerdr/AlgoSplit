import { useDraggable } from '@dnd-kit/core';
import { GripVertical } from 'lucide-react';
import { cn } from '@/lib/utils';

interface TemplateCardProps {
  id: string;
  name: string;
  exerciseCount: number;
  splitName?: string;
}

export function TemplateCard({ id, name, exerciseCount }: TemplateCardProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id,
    data: { sessionId: id, name },
  });

  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'flex items-center gap-2 p-2 rounded border border-white/8 bg-steel/50 hover:bg-steel transition-colors cursor-grab',
        isDragging && 'opacity-50 shadow-lg'
      )}
    >
      <div {...listeners} {...attributes} className="text-muted cursor-grab">
        <GripVertical className="w-3 h-3" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-foreground truncate">{name}</p>
        <p className="text-xs text-muted">{exerciseCount} exercises</p>
      </div>
    </div>
  );
}
