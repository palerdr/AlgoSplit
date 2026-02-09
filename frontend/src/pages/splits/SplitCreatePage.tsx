import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Save, Settings2, ChevronDown, RotateCcw, Loader2, BarChart3, Check } from 'lucide-react';
import { Card, CardContent, Button } from '@/components/ui';
import { createSplit, splitKeys } from '@/api/splits.api';
import { analyzeSplit as analyzeInput } from '@/api/analysis.api';
import { SessionBuilder, SessionTemplates } from '@/components/splits';
import { MuscleChart, AnalysisSummary, SuggestionsList } from '@/components/analysis';
import { useSplitCreateStore, getNextDayNumber } from '@/stores/splitCreateStore';
import { cn } from '@/lib/utils';
import type { SessionInput, SplitRequest } from '@/types/api.types';

export function SplitCreatePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // Use persisted store
  const {
    splitName,
    sessions,
    cycleLength,
    stimulusDuration,
    maintenanceVolume,
    dataset,
    preview,
    setSplitName,
    setSession,
    addSession: storeAddSession,
    removeSession: storeRemoveSession,
    setCycleLength,
    setStimulusDuration,
    setMaintenanceVolume,
    setDataset,
    setPreview,
    reset,
  } = useSplitCreateStore();

  const [saveSuccess, setSaveSuccess] = useState(false);

  const createMutation = useMutation({
    mutationFn: createSplit,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: splitKeys.lists() });
      setSaveSuccess(true);
      setTimeout(() => {
        reset(); // Clear form after successful save
        navigate(`/splits/${data.id}`);
      }, 800);
    },
    onError: (error: any) => {
      console.error('Save failed:', error);
      const detail = error?.response?.data?.detail || error?.message || 'Unknown error';
      alert(`Failed to save split: ${detail}`);
    },
  });

  const previewMutation = useMutation({
    mutationFn: analyzeInput,
    onSuccess: (data) => setPreview(data),
    onError: (error: any) => {
      console.error('Preview failed:', error);
      // Don't alert on auto-preview errors, just log them
    },
  });

  // Auto-preview with debouncing
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const runAutoPreview = useCallback(() => {
    const validSessions = sessions
      .filter((s) => s.name.trim() || s.exercises.some((e) => e.name.trim()))
      .map((s) => ({
        ...s,
        name: s.name.trim() || `Day ${s.day}`,
        exercises: s.exercises.filter((e) => e.name.trim()),
      }))
      .filter((s) => s.exercises.length > 0);

    if (validSessions.length === 0) return;

    const request: SplitRequest = {
      name: splitName.trim() || 'Preview',
      sessions: validSessions,
      cycle_length: cycleLength ?? undefined,
      stimulus_duration: stimulusDuration ?? 48,
      maintenance_volume: maintenanceVolume ?? 3,
      dataset,
    };

    previewMutation.mutate(request);
  }, [sessions, splitName, cycleLength, stimulusDuration, maintenanceVolume, dataset]);

  // Debounced auto-preview effect
  useEffect(() => {
    // Clear previous timeout
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    // Set new debounced call (800ms delay)
    debounceRef.current = setTimeout(() => {
      runAutoPreview();
    }, 800);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [sessions, stimulusDuration, maintenanceVolume, dataset, runAutoPreview]);

  function addSession(template?: SessionInput) {
    const nextDay = getNextDayNumber(sessions);

    if (template) {
      // Add IDs to template exercises if missing
      const exercisesWithIds = template.exercises.map(ex =>
        ex.id ? ex : { ...ex, id: crypto.randomUUID() }
      );
      storeAddSession({ ...template, day: nextDay, exercises: exercisesWithIds });
    } else {
      storeAddSession({
        name: '',
        day: nextDay,
        exercises: [{ id: crypto.randomUUID(), name: '', sets: 1, unilateral: false }],
      });
    }
  }

  function updateSession(index: number, session: SessionInput) {
    setSession(index, session);
  }

  function removeSession(index: number) {
    storeRemoveSession(index);
  }

  function getValidRequest(): SplitRequest | null {
    const validSessions = sessions
      .filter((s) => s.name.trim() || s.exercises.some((e) => e.name.trim()))
      .map((s) => ({
        ...s,
        name: s.name.trim() || `Day ${s.day}`,
        exercises: s.exercises.filter((e) => e.name.trim()),
      }))
      .filter((s) => s.exercises.length > 0);

    if (validSessions.length === 0 || !splitName.trim()) {
      return null;
    }

    return {
      name: splitName.trim(),
      sessions: validSessions,
      cycle_length: cycleLength ?? undefined,
      stimulus_duration: stimulusDuration ?? 48,
      maintenance_volume: maintenanceVolume ?? 3,
      dataset,
    };
  }

  function handleSave() {
    const request = getValidRequest();
    if (request) {
      createMutation.mutate(request);
    }
  }

  const totalExercises = sessions.reduce(
    (sum, s) => sum + s.exercises.filter((e) => e.name.trim()).length,
    0
  );

  const canSave = splitName.trim() && totalExercises > 0;

  return (
    <div className="p-4 md:p-6 space-y-6 pb-20">
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
            <h1 className="text-2xl font-bold text-foreground">Create Split</h1>
            <p className="text-secondary">Build your training program</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={reset}>
            <RotateCcw className="w-4 h-4 mr-1" />
            Reset
          </Button>
          {previewMutation.isPending && (
            <Loader2 className="w-4 h-4 animate-spin text-muted" />
          )}
          <Button
            onClick={handleSave}
            disabled={!canSave || createMutation.isPending || saveSuccess}
            className={saveSuccess ? 'bg-green-600 hover:bg-green-600' : ''}
          >
            {saveSuccess ? (
              <Check className="w-4 h-4 mr-1" />
            ) : (
              <Save className="w-4 h-4 mr-1" />
            )}
            {createMutation.isPending ? 'Saving...' : saveSuccess ? 'Saved' : 'Save Split'}
          </Button>
        </div>
      </div>

      <div className="grid lg:grid-cols-[1fr,400px] gap-6">
        {/* Left - Form */}
        <div className="space-y-6">
          {/* Name */}
          <Card>
            <CardContent className="pt-4">
              <label className="block text-sm text-secondary mb-2">Split Name</label>
              <input
                type="text"
                value={splitName}
                onChange={(e) => setSplitName(e.target.value)}
                placeholder="e.g., Push/Pull/Legs"
                className="w-full bg-charcoal border border-white/10 rounded-md px-3 py-2 text-foreground placeholder:text-muted focus:outline-none focus:border-crimson/50"
              />
            </CardContent>
          </Card>

          {/* Sessions */}
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-foreground">Sessions</h2>

            {sessions.map((session, index) => (
              <SessionBuilder
                key={index}
                session={session}
                onUpdate={(s) => updateSession(index, s)}
                onRemove={() => removeSession(index)}
                canRemove={sessions.length > 1}
              />
            ))}

            <div className="space-y-3">
              <Button
                variant="secondary"
                onClick={() => addSession()}
                className="w-full"
              >
                + Add Empty Session
              </Button>
              <div>
                <p className="text-xs text-muted mb-2">Or add from template:</p>
                <SessionTemplates onSelect={(t) => addSession(t)} />
              </div>
            </div>
          </div>

          {/* Advanced Settings */}
          <Card>
            <CardContent className="pt-4">
              <AdvancedSettings
                cycleLength={cycleLength}
                stimulusDuration={stimulusDuration}
                maintenanceVolume={maintenanceVolume}
                dataset={dataset}
                sessions={sessions}
                onCycleLengthChange={setCycleLength}
                onStimulusDurationChange={setStimulusDuration}
                onMaintenanceVolumeChange={setMaintenanceVolume}
                onDatasetChange={setDataset}
              />
            </CardContent>
          </Card>
        </div>

        {/* Right - Preview */}
        <div className="lg:sticky lg:top-4 space-y-4">
          {preview ? (
            <>
              <Card>
                <CardContent className="pt-4">
                  <h3 className="font-semibold text-foreground mb-4">Preview</h3>
                  <AnalysisSummary summary={preview.summary} muscles={preview.muscles} />
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-4">
                  <h3 className="font-medium text-foreground mb-4">Muscle Coverage</h3>
                  <MuscleChart muscles={preview.muscles} height={300} showAll={false} />
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-4">
                  <h3 className="font-medium text-foreground mb-4">Suggestions</h3>
                  <SuggestionsList suggestions={preview.suggestions} maxItems={3} />
                </CardContent>
              </Card>

            </>
          ) : (
            <Card>
              <CardContent className="py-12 text-center">
                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-steel flex items-center justify-center">
                  {previewMutation.isPending ? (
                    <Loader2 className="w-8 h-8 text-muted animate-spin" />
                  ) : (
                    <BarChart3 className="w-8 h-8 text-muted" />
                  )}
                </div>
                <h3 className="font-medium text-foreground mb-2">
                  {previewMutation.isPending ? 'Analyzing...' : 'Add Exercises to Preview'}
                </h3>
                <p className="text-sm text-muted">
                  Analysis will update automatically as you add exercises.
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

// Advanced settings component
function AdvancedSettings({
  cycleLength,
  stimulusDuration,
  maintenanceVolume,
  dataset,
  sessions,
  onCycleLengthChange,
  onStimulusDurationChange,
  onMaintenanceVolumeChange,
  onDatasetChange,
}: {
  cycleLength: number | null;
  stimulusDuration: number | null;
  maintenanceVolume: number | null;
  dataset: 'schoenfeld' | 'pelland' | 'average';
  sessions: SessionInput[];
  onCycleLengthChange: (v: number | null) => void;
  onStimulusDurationChange: (v: number | null) => void;
  onMaintenanceVolumeChange: (v: number | null) => void;
  onDatasetChange: (v: 'schoenfeld' | 'pelland' | 'average') => void;
}) {
  const [showAdvanced, setShowAdvanced] = useState(true);
  const autoCycleLength = sessions.length > 0 ? Math.max(...sessions.map(s => s.day)) : 1;

  return (
    <>
      <button
        type="button"
        onClick={() => setShowAdvanced(!showAdvanced)}
        className="w-full flex items-center justify-between"
      >
        <div className="flex items-center gap-2">
          <Settings2 className="w-4 h-4 text-muted" />
          <span className="text-sm font-medium text-foreground">Analysis Settings</span>
        </div>
        <ChevronDown className={cn('w-4 h-4 text-muted transition-transform', showAdvanced && 'rotate-180')} />
      </button>

      {showAdvanced && (
        <div className="mt-4 pt-4 border-t border-white/5 grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label className="block text-xs text-muted mb-1">
              Cycle Length (days)
            </label>
            <input
              type="number"
              value={cycleLength ?? ''}
              onChange={(e) => {
                const val = e.target.value;
                onCycleLengthChange(val === '' ? null : parseInt(val) || 1);
              }}
              placeholder={`Auto (${autoCycleLength})`}
              min={1}
              max={14}
              className="w-full bg-charcoal border border-white/10 rounded px-3 py-2 text-sm text-foreground focus:outline-none focus:border-crimson/50 placeholder:text-muted/50"
            />
            <p className="text-[10px] text-muted mt-1">
              {cycleLength ? `${(7 / cycleLength).toFixed(1)}x/week` : `${(7 / autoCycleLength).toFixed(1)}x/week (auto)`}
            </p>
          </div>
          <div>
            <label className="block text-xs text-muted mb-1">
              Stimulus Duration (hours)
            </label>
            <input
              type="number"
              value={stimulusDuration ?? ''}
              onChange={(e) => {
                const val = e.target.value;
                onStimulusDurationChange(val === '' ? null : parseInt(val) || null);
              }}
              placeholder="Auto (48)"
              min={12}
              max={72}
              className="w-full bg-charcoal border border-white/10 rounded px-3 py-2 text-sm text-foreground focus:outline-none focus:border-crimson/50 placeholder:text-muted/50"
            />
          </div>
          <div>
            <label className="block text-xs text-muted mb-1">
              Maintenance Volume (sets)
            </label>
            <input
              type="number"
              value={maintenanceVolume ?? ''}
              onChange={(e) => {
                const val = e.target.value;
                onMaintenanceVolumeChange(val === '' ? null : parseInt(val) || null);
              }}
              placeholder="Auto (3)"
              min={1}
              max={10}
              className="w-full bg-charcoal border border-white/10 rounded px-3 py-2 text-sm text-foreground focus:outline-none focus:border-crimson/50 placeholder:text-muted/50"
            />
          </div>
          <div>
            <label className="block text-xs text-muted mb-1">
              Dataset
            </label>
            <select
              value={dataset}
              onChange={(e) => onDatasetChange(e.target.value as typeof dataset)}
              className="w-full bg-charcoal border border-white/10 rounded px-3 py-2 text-sm text-foreground focus:outline-none focus:border-crimson/50"
            >
              <option value="pelland">Pelland (Recommended)</option>
              <option value="schoenfeld">Schoenfeld</option>
              <option value="average">Average</option>
            </select>
          </div>
        </div>
      )}
    </>
  );
}
