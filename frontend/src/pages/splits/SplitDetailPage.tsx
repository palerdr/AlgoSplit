import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Trash2, BarChart3, Pencil, Copy } from 'lucide-react';
import { Card, CardContent, Button, Spinner } from '@/components/ui';
import { getSplit, deleteSplit, duplicateSplit, splitKeys, analyzeSplit } from '@/api/splits.api';
import {
  MuscleChart,
  AnalysisSummary,
  GroupSummaryCards,
  SuggestionsList,
  StimulusBreakdown,
} from '@/components/analysis';

export function SplitDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: split, isLoading } = useQuery({
    queryKey: splitKeys.detail(id!),
    queryFn: () => getSplit(id!),
    enabled: !!id,
  });

  const { data: analysis, isLoading: analysisLoading } = useQuery({
    queryKey: splitKeys.analysis(id!),
    queryFn: () => analyzeSplit(id!),
    enabled: !!id,
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteSplit(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: splitKeys.lists() });
      navigate('/splits');
    },
  });

  const duplicateMutation = useMutation({
    mutationFn: () => duplicateSplit(id!),
    onSuccess: (newSplit) => {
      queryClient.invalidateQueries({ queryKey: splitKeys.lists() });
      navigate(`/splits/${newSplit.id}`);
    },
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Spinner />
      </div>
    );
  }

  if (!split) {
    return (
      <div className="p-4 md:p-6 text-center">
        <p className="text-muted">Split not found</p>
        <Link to="/splits">
          <Button variant="ghost" className="mt-4">
            Back to Splits
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link to="/splits">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="w-4 h-4 mr-1" />
              Back
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-foreground">{split.name}</h1>
            <p className="text-secondary">
              {split.sessions.length} sessions | {split.dataset} dataset
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link to={`/splits/${id}/edit`}>
            <Button variant="secondary">
              <Pencil className="w-4 h-4 mr-1" />
              Edit
            </Button>
          </Link>
          <Button
            variant="secondary"
            onClick={() => duplicateMutation.mutate()}
            disabled={duplicateMutation.isPending}
          >
            <Copy className="w-4 h-4 mr-1" />
            {duplicateMutation.isPending ? 'Copying...' : 'Duplicate'}
          </Button>
          <Button
            variant="ghost"
            onClick={() => deleteMutation.mutate()}
            disabled={deleteMutation.isPending}
            className="hover:text-red-400"
          >
            <Trash2 className="w-4 h-4 mr-1" />
            Delete
          </Button>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Left Column - Sessions & Stimulus Breakdown */}
        <div className="space-y-6">
          {/* Sessions */}
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-foreground">Sessions</h2>
            {split.sessions.map((session) => (
              <Card key={session.id}>
                <CardContent className="pt-4">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-medium text-foreground">
                      Day {session.day_number}: {session.name}
                    </h3>
                    <span className="text-sm text-muted">
                      {session.exercises.length} exercises
                    </span>
                  </div>
                  <div className="space-y-1">
                    {session.exercises.map((exercise) => (
                      <div
                        key={exercise.id}
                        className="flex items-center justify-between py-1 text-sm"
                      >
                        <span className="text-secondary">{exercise.exercise_name}</span>
                        <span className="text-muted">{exercise.sets} sets</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Stimulus Breakdown - on left side */}
          {analysis?.session_breakdowns && analysis.session_breakdowns.length > 0 && (
            <div className="space-y-4">
              <Card>
                <CardContent className="pt-4">
                  <StimulusBreakdown sessionBreakdowns={analysis.session_breakdowns} />
                </CardContent>
              </Card>
            </div>
          )}
        </div>

        {/* Right Column - Analysis Summary */}
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-crimson" />
            Analysis
          </h2>

          {analysisLoading ? (
            <Card>
              <CardContent className="py-8 flex justify-center">
                <Spinner />
              </CardContent>
            </Card>
          ) : analysis ? (
            <>
              <Card>
                <CardContent className="pt-4">
                  <AnalysisSummary summary={analysis.summary} muscles={analysis.muscles} />
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-4">
                  <h3 className="font-medium text-foreground mb-4">Muscle Stimulus</h3>
                  <MuscleChart muscles={analysis.muscles} height={400} showAll={false} />
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-4">
                  <h3 className="font-medium text-foreground mb-4">Group Summary</h3>
                  <GroupSummaryCards groups={analysis.group_summaries} />
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-4">
                  <h3 className="font-medium text-foreground mb-4">Suggestions</h3>
                  <SuggestionsList suggestions={analysis.suggestions} />
                </CardContent>
              </Card>
            </>
          ) : (
            <Card>
              <CardContent className="py-8 text-center text-muted">
                Unable to analyze split
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
