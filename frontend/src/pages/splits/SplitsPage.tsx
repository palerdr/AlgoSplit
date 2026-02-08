import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Plus, Trash2, BarChart3, Edit2 } from 'lucide-react';
import { Card, CardContent, Button, Spinner } from '@/components/ui';
import { getSplits, deleteSplit, splitKeys, analyzeSplit } from '@/api/splits.api';
import { formatDate } from '@/lib/utils';
import { SplitStatsRow, SuggestionsSummary } from '@/components/analysis';
import type { SplitResponse } from '@/types/api.types';
import { useState } from 'react';

function SplitCard({ split }: { split: SplitResponse }) {
  const queryClient = useQueryClient();
  const [showDelete, setShowDelete] = useState(false);

  const { data: analysis, isLoading: analysisLoading, error: analysisError } = useQuery({
    queryKey: splitKeys.analysis(split.id),
    queryFn: () => analyzeSplit(split.id),
    retry: 1, // Only retry once
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });

  // Log errors for debugging
  if (analysisError) {
    console.error(`Analysis failed for split ${split.id}:`, analysisError);
  }

  const deleteMutation = useMutation({
    mutationFn: () => deleteSplit(split.id),
    onMutate: async () => {
      // Cancel outgoing refetches so they don't overwrite our optimistic update
      await queryClient.cancelQueries({ queryKey: splitKeys.lists() });
      // Snapshot previous value for rollback
      const previous = queryClient.getQueryData(splitKeys.list());
      // Optimistically remove the split from cache
      queryClient.setQueryData(splitKeys.list(), (old: any) => {
        if (!old) return old;
        return {
          ...old,
          splits: old.splits.filter((s: any) => s.id !== split.id),
          total: old.total - 1,
        };
      });
      return { previous };
    },
    onError: (_err: any, _vars: any, context: any) => {
      // Roll back to snapshot on error
      if (context?.previous) {
        queryClient.setQueryData(splitKeys.list(), context.previous);
      }
    },
    onSettled: () => {
      // Refetch after mutation settles (success or error) to ensure server state
      queryClient.invalidateQueries({ queryKey: splitKeys.lists() });
    },
  });

  return (
    <Card className="relative group">
      <CardContent className="pt-4">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <Link to={`/splits/${split.id}`} className="hover:text-crimson transition-colors">
              <h3 className="font-semibold text-foreground text-lg truncate">
                {split.name}
              </h3>
            </Link>
            <SplitStatsRow
              sessions={split.sessions.length}
              avgStimulus={analysis?.summary.avg_net_stimulus}
              musclesTrained={analysis?.summary.muscles_trained}
            />
          </div>

          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <Link to={`/splits/${split.id}`}>
              <Button variant="ghost" size="sm">
                <Edit2 className="w-4 h-4" />
              </Button>
            </Link>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowDelete(true)}
              className="hover:text-red-400"
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Analysis preview */}
        <div className="mt-4 pt-4 border-t border-white/5">
          {analysisLoading ? (
            <div className="flex justify-center py-2">
              <Spinner size="sm" />
            </div>
          ) : analysis ? (
            <div className="flex items-center justify-between">
              <div className="text-sm">
                <span className="text-muted">Avg Stimulus: </span>
                <span className="text-foreground font-medium">
                  {analysis.summary.avg_net_stimulus.toFixed(1)}
                </span>
              </div>
              <SuggestionsSummary suggestions={analysis.suggestions} />
            </div>
          ) : analysisError ? (
            <p className="text-sm text-red-400">Analysis error (check console)</p>
          ) : (
            <p className="text-sm text-muted">No analysis available</p>
          )}
        </div>

        {/* Sessions preview */}
        <div className="mt-4 flex flex-wrap gap-2">
          {split.sessions.map((session) => (
            <span
              key={session.id}
              className="px-2 py-1 bg-steel rounded text-xs text-secondary"
            >
              {session.name} ({session.exercises.length})
            </span>
          ))}
        </div>

        <div className="mt-4 text-xs text-muted">
          Updated {formatDate(split.updated_at)}
        </div>

        {/* Delete confirmation */}
        {showDelete && (
          <div className="absolute inset-0 bg-charcoal/95 rounded-lg flex items-center justify-center">
            <div className="text-center p-4">
              <p className="text-foreground mb-4">Delete "{split.name}"?</p>
              <div className="flex items-center gap-2 justify-center">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowDelete(false)}
                >
                  Cancel
                </Button>
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

export function SplitsPage() {
  const { data, isLoading } = useQuery({
    queryKey: splitKeys.list(),
    queryFn: getSplits,
  });

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Your Splits</h1>
          <p className="text-secondary">Manage your training programs</p>
        </div>
        <Link to="/splits/new">
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            Create Split
          </Button>
        </Link>
      </div>

      {/* Splits list */}
      {isLoading ? (
        <div className="flex justify-center py-12">
          <Spinner />
        </div>
      ) : data?.splits.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-steel flex items-center justify-center">
              <BarChart3 className="w-8 h-8 text-muted" />
            </div>
            <h3 className="font-medium text-foreground mb-2">No Splits Yet</h3>
            <p className="text-sm text-muted max-w-sm mx-auto mb-4">
              Create your first training split to start tracking and optimizing your workout program.
            </p>
            <Link to="/splits/new">
              <Button>Create Your First Split</Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {data?.splits.map((split) => (
            <SplitCard key={split.id} split={split} />
          ))}
        </div>
      )}
    </div>
  );
}
