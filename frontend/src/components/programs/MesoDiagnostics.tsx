import { useQuery } from '@tanstack/react-query';
import { Spinner } from '@/components/ui';
import { programKeys } from '@/api/programs.api';
import { apiClient } from '@/api/client';
import { ProgressionChart } from './ProgressionChart';
import { MuscleChart } from '@/components/analysis';
import type { MesoDiagnosticsResponse } from '@/types/api.types';

interface MesoDiagnosticsProps {
  programId: string;
  mesoId: string;
}

export function MesoDiagnostics({ programId, mesoId }: MesoDiagnosticsProps) {
  const { data, isLoading, error } = useQuery({
    queryKey: programKeys.diagnostics(programId, `meso-${mesoId}`),
    queryFn: async () => {
      const res = await apiClient.post<MesoDiagnosticsResponse>(
        `/api/programs/${programId}/diagnostics`,
        { level: 'meso', target_id: mesoId }
      );
      return res.data;
    },
  });

  if (isLoading) return <div className="flex justify-center py-8"><Spinner size="sm" /></div>;
  if (error) return <p className="text-xs text-red-400">Failed to load meso diagnostics</p>;
  if (!data) return <p className="text-xs text-muted">No data available</p>;

  // Find the last week with valid analysis for a snapshot chart
  const lastWeek = [...data.weeks].reverse().find(w => w.analysis !== null);

  return (
    <div className="space-y-6">
      <div>
        <h4 className="text-sm font-medium text-foreground mb-2">Volume Progression</h4>
        <p className="text-xs text-muted mb-3">Net stimulus per muscle across weeks</p>
        <ProgressionChart progression={data.progression} height={300} />
      </div>

      {lastWeek?.analysis && (
        <div>
          <h4 className="text-sm font-medium text-foreground mb-2">Latest Week Snapshot</h4>
          <div className="chart-fade-in">
            <MuscleChart muscles={lastWeek.analysis.muscles} height={300} showAll={false} />
          </div>
        </div>
      )}
    </div>
  );
}
