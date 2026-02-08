import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { Card, CardContent, Button, Input } from '@/components/ui';
import { createProgram } from '@/api/programs.api';

export function ProgramCreatePage() {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [goal, setGoal] = useState('');
  const [startDate, setStartDate] = useState('');
  const [dataset, setDataset] = useState<'pelland' | 'schoenfeld' | 'average'>('schoenfeld');

  const createMutation = useMutation({
    mutationFn: () =>
      createProgram({
        name: name.trim(),
        goal: goal.trim() || null,
        start_date: startDate || null,
        dataset,
      }),
    onSuccess: (program) => {
      navigate(`/programs/${program.id}`);
    },
  });

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex items-center gap-4">
        <Link to="/programs">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="w-4 h-4 mr-1" />
            Back
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-foreground">New Program</h1>
          <p className="text-secondary">Set up your training program</p>
        </div>
      </div>

      <Card className="max-w-lg">
        <CardContent className="pt-4 space-y-4">
          <div>
            <label className="block text-sm text-secondary mb-2">Program Name</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., 12-Week Hypertrophy Block"
            />
          </div>
          <div>
            <label className="block text-sm text-secondary mb-2">Goal (optional)</label>
            <Input
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              placeholder="e.g., Build muscle mass, increase strength"
            />
          </div>
          <div>
            <label className="block text-sm text-secondary mb-2">Start Date (optional)</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full px-3 py-2 bg-steel border border-white/8 rounded-md text-foreground text-sm focus:outline-none focus:ring-1 focus:ring-crimson"
            />
          </div>
          <div>
            <label className="block text-sm text-secondary mb-2">Fatigue Curve Dataset</label>
            <select
              value={dataset}
              onChange={(e) => setDataset(e.target.value as typeof dataset)}
              className="w-full px-3 py-2 bg-steel border border-white/8 rounded-md text-foreground text-sm focus:outline-none focus:ring-1 focus:ring-crimson"
            >
              <option value="schoenfeld">Schoenfeld (recommended)</option>
              <option value="pelland">Pelland</option>
              <option value="average">Average</option>
            </select>
          </div>

          {createMutation.isError && (
            <p className="text-sm text-red-400">Failed to create program. Please try again.</p>
          )}

          <Button
            onClick={() => createMutation.mutate()}
            disabled={!name.trim() || createMutation.isPending}
          >
            {createMutation.isPending ? 'Creating...' : 'Create Program'}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
