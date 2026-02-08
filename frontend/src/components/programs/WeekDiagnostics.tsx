import { useQuery } from '@tanstack/react-query';
import { Spinner } from '@/components/ui';
import { runDiagnostics, programKeys } from '@/api/programs.api';
import { MuscleChart } from '@/components/analysis';
import { SuggestionsList } from '@/components/analysis';
import { AnalysisSummary } from '@/components/analysis';

interface WeekDiagnosticsProps {
  programId: string;
  microId: string;
}

export function WeekDiagnostics({ programId, microId }: WeekDiagnosticsProps) {
  const { data, isLoading, error } = useQuery({
    queryKey: programKeys.diagnostics(programId, `micro-${microId}`),
    queryFn: () => runDiagnostics(programId, { level: 'micro', target_id: microId }),
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-8">
        <Spinner size="sm" />
      </div>
    );
  }

  if (error) {
    return <p className="text-xs text-red-400">Failed to load week diagnostics</p>;
  }

  if (!data) {
    return <p className="text-xs text-muted">No data available</p>;
  }

  return (
    <div className="space-y-4">
      <AnalysisSummary summary={data.summary} muscles={data.muscles} />
      <div className="chart-fade-in">
        <MuscleChart muscles={data.muscles} height={400} showAll={false} />
      </div>
      {data.suggestions.length > 0 && (
        <SuggestionsList suggestions={data.suggestions} />
      )}
    </div>
  );
}
