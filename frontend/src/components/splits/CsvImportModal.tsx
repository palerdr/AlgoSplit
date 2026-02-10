import { useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Upload, FileText, AlertTriangle } from 'lucide-react';
import { Modal, Button, Input } from '@/components/ui';
import { createSplit, splitKeys } from '@/api/splits.api';
import { parseHeaderBlocksCsv, type ParsedSplit } from '@/lib/parseCsv';

interface CsvImportModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function CsvImportModal({ isOpen, onClose }: CsvImportModalProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [splitName, setSplitName] = useState('');
  const [parsed, setParsed] = useState<ParsedSplit | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createMutation = useMutation({
    mutationFn: createSplit,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: splitKeys.lists() });
      handleClose();
      navigate(`/splits/${data.id}`);
    },
    onError: (err: Error) => {
      setError(err.message || 'Failed to create split');
    },
  });

  const handleClose = useCallback(() => {
    setSplitName('');
    setParsed(null);
    setDragOver(false);
    setError(null);
    onClose();
  }, [onClose]);

  const processFile = useCallback((file: File) => {
    setError(null);
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      if (!text?.trim()) {
        setError('File is empty');
        return;
      }
      const result = parseHeaderBlocksCsv(text);
      setParsed(result);
      // Default split name from filename (strip extension)
      const baseName = file.name.replace(/\.(csv|txt)$/i, '');
      setSplitName(baseName);
    };
    reader.onerror = () => setError('Failed to read file');
    reader.readAsText(file);
  }, []);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  }, [processFile]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  }, [processFile]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setDragOver(false);
  }, []);

  const handleImport = () => {
    if (!parsed || parsed.sessions.length === 0) return;
    const name = splitName.trim() || 'Imported Split';

    createMutation.mutate({
      name,
      sessions: parsed.sessions.map((s) => ({
        name: s.name,
        day: s.day,
        exercises: s.exercises.map((ex) => ({
          name: ex.name,
          sets: ex.sets,
        })),
      })),
    });
  };

  const handleReset = () => {
    setParsed(null);
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Import Split from CSV" size="lg">
      <div className="space-y-4">
        {error && (
          <div className="p-3 bg-error/10 border border-error/20 rounded-md flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-error mt-0.5 shrink-0" />
            <p className="text-sm text-error">{error}</p>
          </div>
        )}

        {!parsed ? (
          /* Upload view */
          <div>
            <div
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
                dragOver
                  ? 'border-crimson bg-crimson/5'
                  : 'border-white/10 hover:border-white/20'
              }`}
            >
              <Upload className="w-8 h-8 text-muted mx-auto mb-3" />
              <p className="text-foreground font-medium mb-1">
                Drop a CSV or TXT file here
              </p>
              <p className="text-sm text-muted">
                or click to browse
              </p>
              <p className="text-xs text-muted mt-3">
                Format: Session name as header, exercises as "name, sets" rows
              </p>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.txt"
              onChange={handleFileChange}
              className="hidden"
            />
          </div>
        ) : (
          /* Preview view */
          <div className="space-y-4">
            <Input
              label="Split Name"
              value={splitName}
              onChange={(e) => setSplitName(e.target.value)}
              placeholder="Enter split name"
            />

            {/* Parse warnings */}
            {parsed.errors.length > 0 && (
              <div className="p-3 bg-warning/10 border border-warning/20 rounded-md space-y-1">
                {parsed.errors.map((err, i) => (
                  <p key={i} className="text-xs text-warning flex items-start gap-1.5">
                    <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
                    {err}
                  </p>
                ))}
              </div>
            )}

            {/* Sessions preview */}
            <div className="space-y-3 max-h-64 overflow-y-auto">
              {parsed.sessions.map((session) => (
                <div
                  key={session.day}
                  className="bg-steel rounded-md p-3"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <FileText className="w-4 h-4 text-crimson" />
                    <span className="text-sm font-medium text-foreground">
                      Day {session.day}: {session.name}
                    </span>
                    <span className="text-xs text-muted">
                      ({session.exercises.length} exercises)
                    </span>
                  </div>
                  <div className="space-y-1 ml-6">
                    {session.exercises.map((ex, i) => (
                      <div
                        key={i}
                        className="flex items-center justify-between text-sm"
                      >
                        <span className="text-secondary">{ex.name}</span>
                        <span className="text-muted">{ex.sets} sets</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {parsed.sessions.length === 0 && (
              <p className="text-sm text-muted text-center py-4">
                No valid sessions found. Check your file format.
              </p>
            )}

            {/* Actions */}
            <div className="flex items-center justify-between pt-2">
              <Button variant="ghost" size="sm" onClick={handleReset}>
                Choose Different File
              </Button>
              <Button
                onClick={handleImport}
                loading={createMutation.isPending}
                disabled={parsed.sessions.length === 0}
              >
                Import Split
              </Button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
