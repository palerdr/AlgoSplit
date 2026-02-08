import { useQuery } from '@tanstack/react-query';
import { Spinner } from '@/components/ui';
import { programKeys } from '@/api/programs.api';
import { apiClient } from '@/api/client';
import type { MacroDiagnosticsResponse } from '@/types/api.types';

interface MacroDiagnosticsProps {
  programId: string;
  macroId: string;
}

export function MacroDiagnostics({ programId, macroId }: MacroDiagnosticsProps) {
  const { data, isLoading, error } = useQuery({
    queryKey: programKeys.diagnostics(programId, `macro-${macroId}`),
    queryFn: async () => {
      const res = await apiClient.post<MacroDiagnosticsResponse>(
        `/api/programs/${programId}/diagnostics`,
        { level: 'macro', target_id: macroId }
      );
      return res.data;
    },
  });

  if (isLoading) return <div className="flex justify-center py-8"><Spinner size="sm" /></div>;
  if (error) return <p className="text-xs text-red-400">Failed to load macro diagnostics</p>;
  if (!data) return <p className="text-xs text-muted">No data available</p>;

  return (
    <div className="space-y-4">
      <h4 className="text-sm font-medium text-foreground">Phase Overview</h4>
      {data.meso_summaries.map((meso) => {
        const regions = Object.values(meso.avg_stimulus);
        const sorted = [...regions].sort((a, b) => b.avg_net_stimulus - a.avg_net_stimulus);
        const top5 = sorted.slice(0, 5);
        const bottom5 = sorted.filter(r => r.avg_net_stimulus > 0).slice(-5).reverse();

        return (
          <div key={meso.meso_id} className="p-3 bg-steel/30 rounded-lg">
            <div className="flex items-center justify-between mb-2">
              <h5 className="text-sm font-medium text-foreground">{meso.name}</h5>
              <span className="text-xs text-muted">{meso.week_count || 0} weeks</span>
            </div>

            {regions.length === 0 ? (
              <p className="text-xs text-muted">No data</p>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-[10px] text-green-400 mb-1">Top Muscles</p>
                  {top5.map(r => (
                    <div key={r.region_id} className="flex justify-between text-xs py-0.5">
                      <span className="text-secondary truncate">{r.display_name}</span>
                      <span className="text-foreground font-mono">{r.avg_net_stimulus.toFixed(1)}</span>
                    </div>
                  ))}
                </div>
                <div>
                  <p className="text-[10px] text-red-400 mb-1">Lowest Muscles</p>
                  {bottom5.map(r => (
                    <div key={r.region_id} className="flex justify-between text-xs py-0.5">
                      <span className="text-secondary truncate">{r.display_name}</span>
                      <span className="text-foreground font-mono">{r.avg_net_stimulus.toFixed(1)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
