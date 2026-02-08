import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Save, Upload, Trash2, X } from 'lucide-react';
import { Button, Card, CardContent, Spinner, Input } from '@/components/ui';
import {
  getMesoTemplates,
  saveMesoAsTemplate,
  applyMesoTemplate,
  deleteMesoTemplate,
  mesoTemplateKeys,
} from '@/api/mesoTemplates.api';
import { periodizationKeys } from '@/api/periodization.api';
import type { MesoTemplateListResponse } from '@/types/api.types';

interface MesoTemplateManagerProps {
  programId: string;
  selectedMesoId?: string;
  macros: { id: string; name: string }[];
}

export function MesoTemplateManager({ programId, selectedMesoId, macros }: MesoTemplateManagerProps) {
  const queryClient = useQueryClient();

  // UI state
  const [showSaveForm, setShowSaveForm] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [saveNotes, setSaveNotes] = useState('');
  const [applyingId, setApplyingId] = useState<string | null>(null);
  const [applyMacroId, setApplyMacroId] = useState('');
  const [applyStartDate, setApplyStartDate] = useState('');
  const [applyName, setApplyName] = useState('');

  // Fetch templates
  const { data: templates, isLoading } = useQuery({
    queryKey: mesoTemplateKeys.list(),
    queryFn: getMesoTemplates,
  });

  // Save mutation
  const saveMut = useMutation({
    mutationFn: saveMesoAsTemplate,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: mesoTemplateKeys.all });
      setShowSaveForm(false);
      setSaveName('');
      setSaveNotes('');
    },
  });

  // Delete mutation
  const deleteMut = useMutation({
    mutationFn: deleteMesoTemplate,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: mesoTemplateKeys.all });
    },
  });

  // Apply mutation
  const applyMut = useMutation({
    mutationFn: ({ templateId, body }: { templateId: string; body: { macro_id: string; start_date: string; name?: string } }) =>
      applyMesoTemplate(templateId, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: periodizationKeys.macros(programId) });
      setApplyingId(null);
      setApplyMacroId('');
      setApplyStartDate('');
      setApplyName('');
    },
  });

  const handleSave = () => {
    if (!selectedMesoId || !saveName.trim()) return;
    saveMut.mutate({
      name: saveName.trim(),
      source_meso_id: selectedMesoId,
      notes: saveNotes.trim() || undefined,
    });
  };

  const handleApply = (templateId: string) => {
    if (!applyMacroId || !applyStartDate) return;
    applyMut.mutate({
      templateId,
      body: {
        macro_id: applyMacroId,
        start_date: applyStartDate,
        name: applyName.trim() || undefined,
      },
    });
  };

  const formatDate = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-medium text-foreground text-sm">Meso Templates</h3>
        {selectedMesoId && !showSaveForm && (
          <Button variant="ghost" size="sm" onClick={() => setShowSaveForm(true)}>
            <Save className="w-3 h-3 mr-1" />
            Save Current
          </Button>
        )}
      </div>

      {/* Save Form */}
      {showSaveForm && selectedMesoId && (
        <Card>
          <CardContent className="p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-foreground">Save Meso as Template</span>
              <button onClick={() => setShowSaveForm(false)} className="text-muted hover:text-secondary">
                <X className="w-3 h-3" />
              </button>
            </div>
            <Input
              value={saveName}
              onChange={(e) => setSaveName(e.target.value)}
              placeholder="Template name"
              className="text-xs"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && saveName.trim()) handleSave();
                if (e.key === 'Escape') setShowSaveForm(false);
              }}
            />
            <Input
              value={saveNotes}
              onChange={(e) => setSaveNotes(e.target.value)}
              placeholder="Notes (optional)"
              className="text-xs"
            />
            <Button
              size="sm"
              onClick={handleSave}
              disabled={!saveName.trim() || saveMut.isPending}
              className="w-full"
            >
              {saveMut.isPending ? <Spinner size="sm" /> : 'Save Template'}
            </Button>
            {saveMut.isError && (
              <p className="text-xs text-red-400">Failed to save template</p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Template List */}
      {isLoading ? (
        <div className="flex justify-center py-4">
          <Spinner size="sm" />
        </div>
      ) : !templates?.length ? (
        <p className="text-xs text-muted text-center py-4">No saved templates yet</p>
      ) : (
        <div className="space-y-2">
          {templates.map((t: MesoTemplateListResponse) => (
            <Card key={t.id}>
              <CardContent className="p-3">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{t.name}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      {t.focus && (
                        <span className="text-[10px] text-muted bg-steel/50 px-1.5 py-0.5 rounded">{t.focus}</span>
                      )}
                      <span className="text-[10px] text-muted">{t.week_count} week{t.week_count !== 1 ? 's' : ''}</span>
                      <span className="text-[10px] text-muted">{formatDate(t.created_at)}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 ml-2 shrink-0">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setApplyingId(applyingId === t.id ? null : t.id)}
                      title="Apply template"
                    >
                      <Upload className="w-3 h-3" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => deleteMut.mutate(t.id)}
                      disabled={deleteMut.isPending}
                      title="Delete template"
                    >
                      <Trash2 className="w-3 h-3 text-red-400" />
                    </Button>
                  </div>
                </div>

                {/* Apply Form */}
                {applyingId === t.id && (
                  <div className="mt-3 pt-3 border-t border-steel/30 space-y-2">
                    <span className="text-xs font-medium text-foreground">Apply to Program</span>
                    <select
                      value={applyMacroId}
                      onChange={(e) => setApplyMacroId(e.target.value)}
                      className="w-full text-xs bg-background border border-steel/50 rounded px-2 py-1.5 text-foreground"
                    >
                      <option value="">Select phase...</option>
                      {macros.map((m) => (
                        <option key={m.id} value={m.id}>{m.name}</option>
                      ))}
                    </select>
                    <Input
                      type="date"
                      value={applyStartDate}
                      onChange={(e) => setApplyStartDate(e.target.value)}
                      className="text-xs"
                    />
                    <Input
                      value={applyName}
                      onChange={(e) => setApplyName(e.target.value)}
                      placeholder="Custom name (optional)"
                      className="text-xs"
                    />
                    <div className="flex gap-1">
                      <Button
                        size="sm"
                        onClick={() => handleApply(t.id)}
                        disabled={!applyMacroId || !applyStartDate || applyMut.isPending}
                        className="flex-1"
                      >
                        {applyMut.isPending ? <Spinner size="sm" /> : 'Apply'}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setApplyingId(null)}
                      >
                        Cancel
                      </Button>
                    </div>
                    {applyMut.isError && (
                      <p className="text-xs text-red-400">Failed to apply template</p>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
