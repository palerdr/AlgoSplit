import { useState, useEffect, useMemo } from 'react';
import { Plus, Trash2, AlertCircle, Check } from 'lucide-react';
import { Modal, Button, Input } from '@/components/ui';
import { getMuscleRegions } from '@/api/customExercises.api';
import type {
  CustomExerciseCreate,
  CustomExerciseResponse,
  MuscleRegionInfo
} from '@/types/api.types';
import { cn } from '@/lib/utils';

interface MuscleTarget {
  muscleId: string;
  weight: number | '';
}

interface CustomExerciseEditorProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: CustomExerciseCreate) => Promise<void>;
  existingExercise?: CustomExerciseResponse | null;
}

const TIERS = ['prime', 'secondary', 'tertiary', 'quaternary'] as const;
type Tier = typeof TIERS[number];

const TIER_LABELS: Record<Tier, { label: string; description: string; color: string }> = {
  prime: {
    label: 'Prime Movers',
    description: 'Main muscles targeted (full diminishing returns)',
    color: 'text-crimson'
  },
  secondary: {
    label: 'Secondary Movers',
    description: 'Supporting muscles (55% DR penalty)',
    color: 'text-yellow-400'
  },
  tertiary: {
    label: 'Tertiary Movers',
    description: 'Minor contribution (35% DR penalty)',
    color: 'text-blue-400'
  },
  quaternary: {
    label: 'Quaternary Movers',
    description: 'Minimal involvement (15% DR penalty)',
    color: 'text-muted'
  },
};

const RESISTANCE_PROFILES = [
  { value: 'ascending', label: 'Ascending', description: 'Hardest at top (cables, bands)' },
  { value: 'mid', label: 'Mid-Range', description: 'Hardest at mid-point (free weights)' },
  { value: 'descending', label: 'Descending', description: 'Hardest at bottom (flyes, preacher)' },
] as const;

export function CustomExerciseEditor({
  isOpen,
  onClose,
  onSave,
  existingExercise
}: CustomExerciseEditorProps) {
  const [exerciseName, setExerciseName] = useState('');
  const [targets, setTargets] = useState<Record<Tier, MuscleTarget[]>>({
    prime: [],
    secondary: [],
    tertiary: [],
    quaternary: [],
  });
  const [axialLoad, setAxialLoad] = useState(0);
  const [resistanceProfile, setResistanceProfile] = useState<'ascending' | 'mid' | 'descending'>('mid');
  const [isBilateral, setIsBilateral] = useState(true);
  const [muscleRegions, setMuscleRegions] = useState<MuscleRegionInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load muscle regions
  useEffect(() => {
    if (isOpen && muscleRegions.length === 0) {
      setLoading(true);
      getMuscleRegions()
        .then((res) => {
          setMuscleRegions(res.regions);
        })
        .catch((err) => {
          setError('Failed to load muscle regions');
          console.error(err);
        })
        .finally(() => setLoading(false));
    }
  }, [isOpen, muscleRegions.length]);

  // Reset form when opening/closing or when existingExercise changes
  useEffect(() => {
    if (isOpen) {
      if (existingExercise) {
        setExerciseName(existingExercise.exercise_name);
        setTargets({
          prime: Object.entries(existingExercise.prime_targets || {}).map(([muscleId, weight]) => ({ muscleId, weight })),
          secondary: Object.entries(existingExercise.secondary_targets || {}).map(([muscleId, weight]) => ({ muscleId, weight })),
          tertiary: Object.entries(existingExercise.tertiary_targets || {}).map(([muscleId, weight]) => ({ muscleId, weight })),
          quaternary: Object.entries(existingExercise.quaternary_targets || {}).map(([muscleId, weight]) => ({ muscleId, weight })),
        });
        setAxialLoad(existingExercise.axial_load);
        setResistanceProfile(existingExercise.resistance_profile);
        setIsBilateral(existingExercise.is_bilateral);
      } else {
        // Reset to defaults
        setExerciseName('');
        setTargets({ prime: [], secondary: [], tertiary: [], quaternary: [] });
        setAxialLoad(0);
        setResistanceProfile('mid');
        setIsBilateral(true);
      }
      setError(null);
    }
  }, [isOpen, existingExercise]);

  // Calculate total weight
  const totalWeight = useMemo(() => {
    return TIERS.reduce((sum, tier) => {
      return sum + targets[tier].reduce((tierSum, t) => tierSum + (typeof t.weight === 'number' ? t.weight : 0), 0);
    }, 0);
  }, [targets]);

  const weightError = totalWeight > 0 && Math.abs(totalWeight - 1) > 0.001;

  // Group muscles by parent for dropdown
  const musclesByGroup = useMemo(() => {
    const groups: Record<string, MuscleRegionInfo[]> = {};
    muscleRegions.forEach((m) => {
      if (!groups[m.parent_group]) groups[m.parent_group] = [];
      groups[m.parent_group].push(m);
    });
    return groups;
  }, [muscleRegions]);

  // Get all used muscle IDs to prevent duplicates
  const usedMuscleIds = useMemo(() => {
    const ids = new Set<string>();
    TIERS.forEach((tier) => {
      targets[tier].forEach((t) => ids.add(t.muscleId));
    });
    return ids;
  }, [targets]);

  const addTarget = (tier: Tier) => {
    // Find first unused muscle
    const availableMuscle = muscleRegions.find((m) => !usedMuscleIds.has(m.region_id));
    if (availableMuscle) {
      setTargets((prev) => ({
        ...prev,
        [tier]: [...prev[tier], { muscleId: availableMuscle.region_id, weight: '' }],
      }));
    }
  };

  const removeTarget = (tier: Tier, index: number) => {
    setTargets((prev) => ({
      ...prev,
      [tier]: prev[tier].filter((_, i) => i !== index),
    }));
  };

  const updateTarget = (tier: Tier, index: number, field: 'muscleId' | 'weight', value: string | number) => {
    setTargets((prev) => ({
      ...prev,
      [tier]: prev[tier].map((t, i) =>
        i === index ? { ...t, [field]: value } : t
      ),
    }));
  };

  const handleSave = async () => {
    if (!exerciseName.trim()) {
      setError('Exercise name is required');
      return;
    }

    if (totalWeight === 0) {
      setError('At least one muscle target is required');
      return;
    }

    if (weightError) {
      setError('Weights must sum to 1.0');
      return;
    }

    const toNum = (w: number | '') => typeof w === 'number' ? w : 0;
    const data: CustomExerciseCreate = {
      exercise_name: exerciseName.trim(),
      prime_targets: Object.fromEntries(targets.prime.map((t) => [t.muscleId, toNum(t.weight)])),
      secondary_targets: Object.fromEntries(targets.secondary.map((t) => [t.muscleId, toNum(t.weight)])),
      tertiary_targets: Object.fromEntries(targets.tertiary.map((t) => [t.muscleId, toNum(t.weight)])),
      quaternary_targets: Object.fromEntries(targets.quaternary.map((t) => [t.muscleId, toNum(t.weight)])),
      axial_load: axialLoad,
      resistance_profile: resistanceProfile,
      is_bilateral: isBilateral,
    };

    setSaving(true);
    setError(null);
    try {
      await onSave(data);
      onClose();
    } catch (err: any) {
      const detail = err.response?.data?.detail;
      const status = err.response?.status;
      if (detail) {
        setError(detail);
      } else if (!err.response) {
        setError('Network error - is the backend server running?');
      } else {
        setError(`Server error (${status || 'unknown'}). Check backend logs.`);
      }
    } finally {
      setSaving(false);
    }
  };

  const getMuscleDisplayName = (muscleId: string) => {
    return muscleRegions.find((m) => m.region_id === muscleId)?.display_name || muscleId;
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={existingExercise ? 'Edit Custom Exercise' : 'Create Custom Exercise'}
      description="Define muscle targets with weights that sum to 1.0"
      size="2xl"
    >
      {loading ? (
        <div className="py-8 text-center text-muted">Loading muscle regions...</div>
      ) : (
        <div className="space-y-6 max-h-[70vh] overflow-y-auto pr-2">
          {/* Exercise Name */}
          <Input
            label="Exercise Name"
            value={exerciseName}
            onChange={(e) => setExerciseName(e.target.value)}
            placeholder="e.g., Meadows Row"
            error={!exerciseName.trim() && error ? 'Required' : undefined}
          />

          {/* Weight Sum Indicator */}
          <div className={cn(
            'flex items-center justify-between p-3 rounded-lg border',
            weightError
              ? 'bg-error/10 border-error/30'
              : totalWeight === 1
                ? 'bg-success/10 border-success/30'
                : 'bg-steel border-white/8'
          )}>
            <span className="text-sm text-secondary">Total Weight</span>
            <div className="flex items-center gap-2">
              <span className={cn(
                'font-mono font-semibold',
                weightError ? 'text-error' : totalWeight === 1 ? 'text-success' : 'text-foreground'
              )}>
                {totalWeight.toFixed(2)}
              </span>
              {totalWeight === 1 && <Check className="w-4 h-4 text-success" />}
              {weightError && <AlertCircle className="w-4 h-4 text-error" />}
              <span className="text-xs text-muted">/ 1.00</span>
            </div>
          </div>

          {/* Muscle Targets by Tier */}
          {TIERS.map((tier) => (
            <div key={tier} className="space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className={cn('font-medium', TIER_LABELS[tier].color)}>
                    {TIER_LABELS[tier].label}
                  </h4>
                  <p className="text-xs text-muted">{TIER_LABELS[tier].description}</p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => addTarget(tier)}
                  disabled={usedMuscleIds.size >= muscleRegions.length}
                >
                  <Plus className="w-4 h-4 mr-1" />
                  Add
                </Button>
              </div>

              {targets[tier].length === 0 ? (
                <div className="text-xs text-muted italic py-2">No muscles added</div>
              ) : (
                <div className="space-y-2">
                  {targets[tier].map((target, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      {/* Muscle Selector */}
                      <select
                        value={target.muscleId}
                        onChange={(e) => updateTarget(tier, idx, 'muscleId', e.target.value)}
                        className="flex-1 h-9 px-3 bg-steel border border-white/8 rounded-sm text-foreground text-sm focus:outline-none focus:border-crimson"
                      >
                        {Object.entries(musclesByGroup).map(([group, muscles]) => (
                          <optgroup key={group} label={group.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}>
                            {muscles.map((m) => (
                              <option
                                key={m.region_id}
                                value={m.region_id}
                                disabled={usedMuscleIds.has(m.region_id) && m.region_id !== target.muscleId}
                              >
                                {m.display_name}
                              </option>
                            ))}
                          </optgroup>
                        ))}
                      </select>

                      {/* Weight Input */}
                      <input
                        type="number"
                        min="0"
                        max="1"
                        step="0.05"
                        value={target.weight}
                        placeholder="0.00"
                        onChange={(e) => {
                          const val = e.target.value;
                          updateTarget(tier, idx, 'weight', val === '' ? '' : parseFloat(val) || 0);
                        }}
                        onBlur={(e) => {
                          if (e.target.value === '') updateTarget(tier, idx, 'weight', 0);
                        }}
                        className="w-20 h-9 px-2 bg-steel border border-white/8 rounded-sm text-foreground text-sm font-mono text-center focus:outline-none focus:border-crimson"
                      />

                      {/* Remove Button */}
                      <button
                        onClick={() => removeTarget(tier, idx)}
                        className="p-2 text-muted hover:text-error transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}

          {/* Properties */}
          <div className="grid grid-cols-2 gap-4 pt-4 border-t border-white/8">
            {/* Axial Load */}
            <div>
              <label className="block text-sm font-medium text-secondary mb-1.5">
                Axial Load (Spinal Stress)
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.1"
                  value={axialLoad}
                  onChange={(e) => setAxialLoad(parseFloat(e.target.value))}
                  className="flex-1 h-2 bg-steel rounded-lg appearance-none cursor-pointer accent-crimson"
                />
                <span className="w-12 text-sm font-mono text-foreground text-right">
                  {axialLoad.toFixed(1)}
                </span>
              </div>
              <p className="text-xs text-muted mt-1">
                0 = None (curls), 1 = Max (deadlifts)
              </p>
            </div>

            {/* Resistance Profile */}
            <div>
              <label className="block text-sm font-medium text-secondary mb-1.5">
                Resistance Profile
              </label>
              <select
                value={resistanceProfile}
                onChange={(e) => setResistanceProfile(e.target.value as any)}
                className="w-full h-9 px-3 bg-steel border border-white/8 rounded-sm text-foreground text-sm focus:outline-none focus:border-crimson"
              >
                {RESISTANCE_PROFILES.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label} - {p.description}
                  </option>
                ))}
              </select>
            </div>

            {/* Bilateral Toggle */}
            <div className="col-span-2">
              <label className="block text-sm font-medium text-secondary mb-1.5">
                Movement Type
              </label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setIsBilateral(true)}
                  className={cn(
                    'flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors',
                    isBilateral
                      ? 'bg-crimson text-foreground'
                      : 'bg-steel text-secondary hover:text-foreground'
                  )}
                >
                  Bilateral (-5%)
                </button>
                <button
                  type="button"
                  onClick={() => setIsBilateral(false)}
                  className={cn(
                    'flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors',
                    !isBilateral
                      ? 'bg-crimson text-foreground'
                      : 'bg-steel text-secondary hover:text-foreground'
                  )}
                >
                  Unilateral (+5%)
                </button>
              </div>
            </div>
          </div>

          {/* Error Message */}
          {error && (
            <div className="flex items-center gap-2 p-3 bg-error/10 border border-error/30 rounded-lg text-sm text-error">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-4 border-t border-white/8">
            <Button variant="ghost" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              loading={saving}
              disabled={weightError || !exerciseName.trim() || totalWeight === 0}
            >
              {existingExercise ? 'Update Exercise' : 'Create Exercise'}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
