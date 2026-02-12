import { useState, useEffect, useRef, useCallback } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Save, RotateCcw, Settings2, ChevronDown, FolderOpen, Loader2, BarChart3, Check } from 'lucide-react';
import { analyzeSplit } from '@/api/analysis.api';
import { createSplit, getSplits, splitKeys, replaceSplit } from '@/api/splits.api';
import { SessionBuilder, SessionTemplates } from '@/components/splits';
import {
  MuscleChart,
  AnalysisSummary,

  SuggestionsList,
  StimulusBreakdown,
} from '@/components/analysis';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { useAnalysisStore, getNextDayNumber } from '@/stores/analysisStore';
import { useShallow } from 'zustand/react/shallow';
import type { SplitRequest, SessionInput } from '@/types/api.types';
import { cn } from '@/lib/utils';

export function AnalysisPage() {
  // Use persisted store with shallow comparison to prevent unnecessary re-renders
  const {
    splitName,
    sessions,
    cycleLength,
    stimulusDuration,
    maintenanceVolume,
    dataset,
    lastResults,
    loadedSplitId,
  } = useAnalysisStore(useShallow((state) => ({
    splitName: state.splitName,
    sessions: state.sessions,
    cycleLength: state.cycleLength,
    stimulusDuration: state.stimulusDuration,
    maintenanceVolume: state.maintenanceVolume,
    dataset: state.dataset,
    lastResults: state.lastResults,
    loadedSplitId: state.loadedSplitId,
  })));

  // Actions don't cause re-renders (stable references)
  const setSplitName = useAnalysisStore((s) => s.setSplitName);
  const setSession = useAnalysisStore((s) => s.setSession);
  const storeAddSession = useAnalysisStore((s) => s.addSession);
  const storeRemoveSession = useAnalysisStore((s) => s.removeSession);
  const setCycleLength = useAnalysisStore((s) => s.setCycleLength);
  const setStimulusDuration = useAnalysisStore((s) => s.setStimulusDuration);
  const setMaintenanceVolume = useAnalysisStore((s) => s.setMaintenanceVolume);
  const setDataset = useAnalysisStore((s) => s.setDataset);
  const setLastResults = useAnalysisStore((s) => s.setLastResults);
  const setLoadedSplitId = useAnalysisStore((s) => s.setLoadedSplitId);
  const reset = useAnalysisStore((s) => s.reset);

  const [showLoadSplitDropdown, setShowLoadSplitDropdown] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [resultsView, setResultsView] = useState<'chart' | 'breakdown'>('chart');

  const queryClient = useQueryClient();

  // Fetch user's saved splits for loading
  const { data: savedSplits } = useQuery({
    queryKey: splitKeys.list(),
    queryFn: getSplits,
  });

  const analyzeMutation = useMutation({
    mutationFn: analyzeSplit,
    onSuccess: (data) => {
      setLastResults(data);
    },
    onError: (error: any) => {
      console.error('Preview failed:', error);
      // Don't alert on auto-preview errors
    },
  });

  const saveMutation = useMutation({
    mutationFn: (data: SplitRequest) => {
      if (loadedSplitId) {
        return replaceSplit(loadedSplitId, data);
      }
      return createSplit(data);
    },
    onSuccess: (data) => {
      // Track the new split ID so subsequent saves update in place
      if (!loadedSplitId && data.id) {
        setLoadedSplitId(data.id);
      }
      queryClient.invalidateQueries({ queryKey: splitKeys.lists() });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
    },
    onError: (error: any) => {
      console.error('Save failed:', error);
      const detail = error?.response?.data?.detail;
      if (detail && typeof detail === 'object' && detail.unrecognized_exercises) {
        alert(`Cannot save split - unrecognized exercises:\n\n${detail.unrecognized_exercises.join('\n')}\n\nCheck spelling or try different exercise names.`);
      } else {
        alert(`Failed to save split: ${error.message}`);
      }
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
        exercises: s.exercises
          .filter((e) => e.name.trim())
          .map(({ id, ...ex }) => ex), // Strip client-only id field
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

    analyzeMutation.mutate(request);
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

  // Load a saved split into the form
  function loadSplit(splitId: string) {
    const split = savedSplits?.splits.find((s) => s.id === splitId);
    if (!split) return;

    // Reset and populate with the loaded split's data
    reset();
    setLoadedSplitId(splitId);
    setSplitName(split.name);
    setCycleLength(split.cycle_length ?? null);
    setStimulusDuration(split.stimulus_duration);
    setMaintenanceVolume(split.maintenance_volume);
    setDataset(split.dataset as 'schoenfeld' | 'pelland' | 'average');

    // Convert sessions to SessionInput format
    split.sessions.forEach((session, index) => {
      const sessionInput: SessionInput = {
        name: session.name,
        day: session.day_number,
        exercises: session.exercises.map((ex) => ({
          id: crypto.randomUUID(),
          name: ex.exercise_name,
          sets: ex.sets,
          unilateral: ex.unilateral ?? false,
          resistance_profile: ex.resistance_profile ?? null,
        })),
      };
      if (index === 0) {
        // Replace the default first session
        setSession(0, sessionInput);
      } else {
        storeAddSession(sessionInput);
      }
    });

    setShowLoadSplitDropdown(false);
  }

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
        exercises: [{ id: crypto.randomUUID(), name: '', sets: 1 }],
      });
    }
  }

  function updateSession(index: number, session: SessionInput) {
    setSession(index, session);
  }

  function removeSession(index: number) {
    storeRemoveSession(index);
  }

  function resetForm() {
    reset();
  }

  function handleSave() {
    const validSessions = sessions
      .filter(s => s.name.trim() || s.exercises.some(e => e.name.trim()))
      .map(s => ({
        ...s,
        name: s.name.trim() || `Day ${s.day}`,
        exercises: s.exercises
          .filter(e => e.name.trim())
          .map(({ id, ...ex }) => ex), // Strip client-only id field
      }))
      .filter(s => s.exercises.length > 0);

    const request: SplitRequest = {
      name: splitName,
      sessions: validSessions,
      cycle_length: cycleLength ?? undefined,
      stimulus_duration: stimulusDuration ?? 48,
      maintenance_volume: maintenanceVolume ?? 3,
      dataset,
    };

    saveMutation.mutate(request);
  }

  const totalSets = sessions.reduce(
    (sum, s) => sum + s.exercises.reduce((eSum, e) => eSum + e.sets, 0),
    0
  );
  const totalExercises = sessions.reduce(
    (sum, s) => sum + s.exercises.filter(e => e.name.trim()).length,
    0
  );

  return (
    <div className="min-h-screen pb-20 p-4 md:p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6 gap-3">
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold text-foreground">Analyze a Split</h1>
            <p className="text-secondary mt-1 text-xs sm:text-sm">
              Enter your training split to calculate net weekly stimulus per muscle
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {/* Load Split Dropdown */}
            {savedSplits && savedSplits.splits.length > 0 && (
              <div className="relative">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setShowLoadSplitDropdown(!showLoadSplitDropdown)}
                >
                  <FolderOpen className="w-4 h-4 md:mr-1" />
                  <span className="hidden md:inline">Load Split</span>
                  <ChevronDown className={cn('w-3 h-3 ml-1 transition-transform hidden md:block', showLoadSplitDropdown && 'rotate-180')} />
                </Button>
                {showLoadSplitDropdown && (
                  <>
                    <div
                      className="fixed inset-0 z-40"
                      onClick={() => setShowLoadSplitDropdown(false)}
                    />
                    <div className="absolute right-0 top-full mt-1 z-50 w-64 bg-charcoal border border-white/10 rounded-lg shadow-lg py-1">
                      {savedSplits.splits.map((split) => (
                        <button
                          key={split.id}
                          onClick={() => loadSplit(split.id)}
                          className="w-full px-3 py-2 text-left text-sm text-foreground hover:bg-steel transition-colors"
                        >
                          <div className="font-medium">{split.name}</div>
                          <div className="text-xs text-muted">
                            {split.sessions.length} sessions
                          </div>
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}
            <Button variant="ghost" size="sm" onClick={resetForm}>
              <RotateCcw className="w-4 h-4 md:mr-1" />
              <span className="hidden md:inline">Reset</span>
            </Button>
            {analyzeMutation.isPending && (
              <Loader2 className="w-4 h-4 animate-spin text-muted" />
            )}
          </div>
        </div>

        <div className="grid lg:grid-cols-[1fr,400px] gap-6">
          {/* Left column - Input */}
          <div className="space-y-6">
            {/* Split name */}
            <Card>
              <div className="flex items-center gap-4">
                <label className="text-sm text-secondary">Split Name</label>
                <input
                  type="text"
                  value={splitName}
                  onChange={(e) => setSplitName(e.target.value)}
                  placeholder="e.g., Push/Pull/Legs"
                  className="flex-1 bg-charcoal border border-white/10 rounded-md px-3 py-2 text-foreground placeholder:text-muted focus:outline-none focus:border-crimson/50"
                />
              </div>
            </Card>

            {/* Sessions */}
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-lg font-semibold text-foreground">Sessions</h2>
                <div className="text-xs sm:text-sm text-muted">
                  {sessions.length} session{sessions.length !== 1 ? 's' : ''} | {totalExercises} exercises | {totalSets} sets
                </div>
              </div>

              {sessions.map((session, index) => (
                <SessionBuilder
                  key={index}
                  session={session}
                  onUpdate={(s) => updateSession(index, s)}
                  onRemove={() => removeSession(index)}
                  canRemove={sessions.length > 1}
                />
              ))}

              {/* Add session */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Button
                    variant="secondary"
                    onClick={() => addSession()}
                    className="flex-1"
                  >
                    + Add Empty Session
                  </Button>
                </div>
                <div>
                  <p className="text-xs text-muted mb-2">Or add from template:</p>
                  <SessionTemplates onSelect={(t) => addSession(t)} />
                </div>
              </div>
            </div>

            {/* Advanced settings */}
            <Card>
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
            </Card>

            {/* Analysis runs automatically - no button needed */}
          </div>

          {/* Right column - Results preview */}
          <div className="lg:sticky lg:top-4 space-y-4">
            {lastResults ? (
              <>
                <Card>
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-foreground">Analysis Results</h3>
                      <div className="flex gap-0.5 bg-steel rounded-lg p-0.5">
                        <button
                          onClick={() => setResultsView('chart')}
                          className={`px-2 py-0.5 rounded text-xs font-medium transition-colors ${
                            resultsView === 'chart'
                              ? 'bg-crimson text-white'
                              : 'text-muted hover:text-foreground'
                          }`}
                        >
                          Chart
                        </button>
                        <button
                          onClick={() => setResultsView('breakdown')}
                          className={`px-2 py-0.5 rounded text-xs font-medium transition-colors ${
                            resultsView === 'breakdown'
                              ? 'bg-crimson text-white'
                              : 'text-muted hover:text-foreground'
                          }`}
                        >
                          Breakdown
                        </button>
                      </div>
                    </div>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={handleSave}
                      disabled={saveMutation.isPending || saveSuccess}
                      className={saveSuccess ? 'text-green-400 border-green-400/30' : ''}
                    >
                      {saveSuccess ? (
                        <Check className="w-4 h-4 mr-1" />
                      ) : (
                        <Save className="w-4 h-4 mr-1" />
                      )}
                      {saveMutation.isPending ? 'Saving...' : saveSuccess ? 'Saved' : loadedSplitId ? 'Save Split' : 'Save as New'}
                    </Button>
                  </div>
                  {/* Show actual params used by backend for debugging */}
                  <div className="mb-4 p-2 bg-charcoal rounded text-xs text-muted flex flex-wrap gap-x-4 gap-y-1">
                    <span>Cycle: <span className="text-foreground">{lastResults.cycle_length}d</span> ({(7 / lastResults.cycle_length).toFixed(1)}x/wk)</span>
                    <span>Stim: <span className="text-foreground">{lastResults.stimulus_duration}h</span></span>
                    <span>Maint: <span className="text-foreground">{lastResults.maintenance_volume} sets</span></span>
                    <span>Data: <span className="text-foreground">{lastResults.dataset}</span></span>
                  </div>
                  {resultsView === 'chart' ? (
                    <div className="overflow-x-auto -mx-4 px-4">
                      <MuscleChart muscles={lastResults.muscles} height={400} truncate={false} />
                    </div>
                  ) : (
                    <AnalysisSummary summary={lastResults.summary} muscles={lastResults.muscles} />
                  )}
                </Card>

                {resultsView === 'breakdown' && (
                  <>
                    {lastResults.session_breakdowns && lastResults.session_breakdowns.length > 0 && (
                      <Card>
                        <StimulusBreakdown sessionBreakdowns={lastResults.session_breakdowns} />
                      </Card>
                    )}

                    {lastResults.suggestions.length > 0 && (
                      <Card>
                        <SuggestionsList suggestions={lastResults.suggestions} maxItems={5} />
                      </Card>
                    )}
                  </>
                )}
              </>
            ) : (
              <Card className="text-center py-12">
                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-steel flex items-center justify-center">
                  {analyzeMutation.isPending ? (
                    <Loader2 className="w-8 h-8 text-muted animate-spin" />
                  ) : (
                    <BarChart3 className="w-8 h-8 text-muted" />
                  )}
                </div>
                <h3 className="font-medium text-foreground mb-2">
                  {analyzeMutation.isPending ? 'Analyzing...' : 'Add Exercises to Preview'}
                </h3>
                <p className="text-sm text-muted max-w-xs mx-auto">
                  Analysis will update automatically as you add exercises, or load one of your saved splits.
                </p>
              </Card>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}

// Separate component for advanced settings to manage its own open state
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
  // Calculate auto cycle length (max day from sessions)
  const autoCycleLength = sessions.length > 0 ? Math.max(...sessions.map(s => s.day)) : 1;
  const [showAdvanced, setShowAdvanced] = useState(true);

  return (
    <>
      <button
        type="button"
        onClick={() => setShowAdvanced(!showAdvanced)}
        className="w-full flex items-center justify-between"
      >
        <div className="flex items-center gap-2">
          <Settings2 className="w-4 h-4 text-muted" />
          <span className="text-sm font-medium text-foreground">Advanced Settings</span>
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
                onStimulusDurationChange(val === '' ? null : parseInt(val) || 1);
              }}
              placeholder="Auto (48)"
              min={12}
              max={96}
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
                onMaintenanceVolumeChange(val === '' ? null : parseInt(val) || 1);
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
              <option value="pelland">Pelland</option>
              <option value="schoenfeld">Schoenfeld (Recommended)</option>
              <option value="average">Average</option>
            </select>
          </div>
        </div>
      )}
    </>
  );
}
