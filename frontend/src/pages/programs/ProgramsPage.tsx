import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Plus, CalendarDays, Trash2 } from 'lucide-react';
import { Card, CardContent, Button, Spinner } from '@/components/ui';
import { getPrograms, deleteProgram, programKeys } from '@/api/programs.api';
import { formatDate } from '@/lib/utils';
import type { ProgramResponse } from '@/types/api.types';
import { useState } from 'react';

const statusBadgeColors: Record<string, string> = {
  draft: 'bg-gray-500/20 text-gray-400',
  active: 'bg-green-500/20 text-green-400',
  completed: 'bg-blue-500/20 text-blue-400',
  archived: 'bg-yellow-500/20 text-yellow-400',
};

function ProgramCard({ program }: { program: ProgramResponse }) {
  const queryClient = useQueryClient();
  const [showDelete, setShowDelete] = useState(false);

  const deleteMutation = useMutation({
    mutationFn: () => deleteProgram(program.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: programKeys.lists() });
    },
  });

  return (
    <Card className="relative group">
      <CardContent className="pt-4">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <Link to={`/programs/${program.id}`} className="hover:text-crimson transition-colors">
              <h3 className="font-semibold text-foreground text-lg truncate">{program.name}</h3>
            </Link>
            <div className="flex items-center gap-2 mt-1">
              <span className={`px-2 py-0.5 rounded text-[10px] font-medium uppercase ${statusBadgeColors[program.status] || statusBadgeColors.draft}`}>
                {program.status}
              </span>
              <span className="text-xs text-muted">{program.session_count} sessions</span>
            </div>
          </div>
          <div className="opacity-0 group-hover:opacity-100 transition-opacity">
            <Button variant="ghost" size="sm" onClick={() => setShowDelete(true)} className="hover:text-red-400">
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {program.goal && (
          <p className="text-sm text-secondary mt-2 line-clamp-2">{program.goal}</p>
        )}

        {(program.start_date || program.end_date) && (
          <div className="mt-3 text-xs text-muted">
            {program.start_date && <span>{formatDate(program.start_date)}</span>}
            {program.start_date && program.end_date && <span> — </span>}
            {program.end_date && <span>{formatDate(program.end_date)}</span>}
          </div>
        )}

        <div className="mt-3 text-xs text-muted">
          Updated {formatDate(program.updated_at)}
        </div>

        {showDelete && (
          <div className="absolute inset-0 bg-charcoal/95 rounded-lg flex items-center justify-center">
            <div className="text-center p-4">
              <p className="text-foreground mb-4">Delete "{program.name}"?</p>
              <div className="flex items-center gap-2 justify-center">
                <Button variant="ghost" size="sm" onClick={() => setShowDelete(false)}>Cancel</Button>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => deleteMutation.mutate()}
                  disabled={deleteMutation.isPending}
                  className="bg-red-600 hover:bg-red-700"
                >
                  {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
                </Button>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function ProgramsPage() {
  const { data, isLoading } = useQuery({
    queryKey: programKeys.list(),
    queryFn: getPrograms,
  });

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Programs</h1>
          <p className="text-secondary">Plan and periodize your training</p>
        </div>
        <Link to="/programs/new">
          <Button>
            <Plus className="w-4 h-4 mr-1" />
            New Program
          </Button>
        </Link>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Spinner />
        </div>
      ) : data?.programs.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-steel flex items-center justify-center">
              <CalendarDays className="w-8 h-8 text-muted" />
            </div>
            <h3 className="font-medium text-foreground mb-2">No Programs Yet</h3>
            <p className="text-sm text-muted max-w-sm mx-auto mb-4">
              Create a program to plan your training across weeks and months.
            </p>
            <Link to="/programs/new">
              <Button>Create Your First Program</Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {data?.programs.map((program) => (
            <ProgramCard key={program.id} program={program} />
          ))}
        </div>
      )}
    </div>
  );
}
