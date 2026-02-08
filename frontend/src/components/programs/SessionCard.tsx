import { Dumbbell, CheckCircle2, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ProgramSessionResponse } from '@/types/api.types';

interface SessionCardProps {
  session: ProgramSessionResponse;
  onClick?: () => void;
  compact?: boolean;
}

// Consistent color from session name so the same session always looks the same
const SESSION_COLORS = [
  { bg: 'bg-blue-500/20', border: 'border-blue-400/40', text: 'text-blue-300', dot: 'bg-blue-400' },
  { bg: 'bg-emerald-500/20', border: 'border-emerald-400/40', text: 'text-emerald-300', dot: 'bg-emerald-400' },
  { bg: 'bg-violet-500/20', border: 'border-violet-400/40', text: 'text-violet-300', dot: 'bg-violet-400' },
  { bg: 'bg-amber-500/20', border: 'border-amber-400/40', text: 'text-amber-300', dot: 'bg-amber-400' },
  { bg: 'bg-rose-500/20', border: 'border-rose-400/40', text: 'text-rose-300', dot: 'bg-rose-400' },
  { bg: 'bg-cyan-500/20', border: 'border-cyan-400/40', text: 'text-cyan-300', dot: 'bg-cyan-400' },
  { bg: 'bg-orange-500/20', border: 'border-orange-400/40', text: 'text-orange-300', dot: 'bg-orange-400' },
  { bg: 'bg-pink-500/20', border: 'border-pink-400/40', text: 'text-pink-300', dot: 'bg-pink-400' },
];

function getColorForName(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return SESSION_COLORS[Math.abs(hash) % SESSION_COLORS.length];
}

export function SessionCard({ session, onClick, compact = false }: SessionCardProps) {
  const displayName = session.custom_name || session.template_name || 'Untitled';
  const color = getColorForName(displayName);
  const exerciseCount = session.exercises?.length ?? 0;

  if (compact) {
    return (
      <button
        onClick={onClick}
        className={cn(
          'w-full text-left rounded-md px-1.5 py-0.5 flex items-center gap-1 transition-all',
          'hover:brightness-125',
          color.bg, color.border, 'border',
        )}
      >
        <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', color.dot)} />
        <span className={cn('text-[10px] truncate', color.text)}>{displayName}</span>
      </button>
    );
  }

  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full text-left rounded-md px-2 py-1.5 flex items-center gap-1.5 transition-all',
        'hover:brightness-125',
        color.bg, color.border, 'border',
      )}
    >
      {session.status === 'completed' ? (
        <CheckCircle2 className="w-3 h-3 text-green-400 shrink-0" />
      ) : session.status === 'skipped' ? (
        <XCircle className="w-3 h-3 text-gray-400 shrink-0" />
      ) : (
        <Dumbbell className={cn('w-3 h-3 shrink-0', color.text)} />
      )}
      <span className={cn('text-xs font-medium truncate flex-1', color.text)}>
        {displayName}
      </span>
      {exerciseCount > 0 && (
        <span className="text-[9px] text-muted bg-white/5 rounded px-1 py-0.5 shrink-0">
          {exerciseCount}
        </span>
      )}
    </button>
  );
}
