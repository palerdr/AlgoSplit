import { Award, TrendingUp, Dumbbell } from 'lucide-react';
import { useSettingsStore, formatWeightWithUnit } from '@/stores/settingsStore';

interface PRDisplayProps {
  max1RM: number;
  maxWeight: number;
  maxVolume: number;
  exerciseName?: string;
}

export function PRDisplay({ max1RM, maxWeight, maxVolume, exerciseName }: PRDisplayProps) {
  const units = useSettingsStore((s) => s.units);

  return (
    <div className="space-y-3">
      {exerciseName && (
        <h3 className="font-medium text-foreground">{exerciseName} PRs</h3>
      )}
      <div className="grid grid-cols-3 gap-4">
        <div className="text-center">
          <Award className="w-6 h-6 mx-auto mb-1 text-crimson" />
          <p className="text-xl font-bold text-foreground">
            {formatWeightWithUnit(max1RM, units)}
          </p>
          <p className="text-xs text-muted">Est. 1RM</p>
        </div>
        <div className="text-center">
          <TrendingUp className="w-6 h-6 mx-auto mb-1 text-blue-400" />
          <p className="text-xl font-bold text-foreground">
            {formatWeightWithUnit(maxWeight, units)}
          </p>
          <p className="text-xs text-muted">Max Weight</p>
        </div>
        <div className="text-center">
          <Dumbbell className="w-6 h-6 mx-auto mb-1 text-green-400" />
          <p className="text-xl font-bold text-foreground">
            {formatWeightWithUnit(maxVolume, units)}
          </p>
          <p className="text-xs text-muted">Max Volume</p>
        </div>
      </div>
    </div>
  );
}
