import { useState } from 'react';
import { User, Ruler, Timer, Database, Info, ExternalLink, BarChart3 } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent, Button } from '@/components/ui';
import { useAuth } from '@/features/auth';
import { useSettingsStore, type Dataset } from '@/stores/settingsStore';
import { cn } from '@/lib/utils';

function SettingsSection({
  icon: Icon,
  title,
  children,
}: {
  icon: React.ElementType;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Icon className="w-5 h-5 text-crimson" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function ToggleButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'px-4 py-2 rounded-md text-sm font-medium transition-colors cursor-pointer',
        active
          ? 'bg-crimson text-white'
          : 'bg-steel text-secondary hover:text-foreground'
      )}
    >
      {children}
    </button>
  );
}

export function SettingsPage() {
  const { user, logout } = useAuth();
  const {
    units, setUnits,
    defaultRestDuration, setDefaultRestDuration,
    stimulusDuration, setStimulusDuration,
    maintenanceVolume, setMaintenanceVolume,
    dataset, setDataset,
  } = useSettingsStore();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const restOptions = [30, 60, 90, 120, 180, 300];

  function formatRestTime(seconds: number): string {
    if (seconds < 60) return `${seconds}s`;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
  }

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-2xl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Settings</h1>
        <p className="text-secondary">Customize your AlgoSplit experience</p>
      </div>

      {/* Profile */}
      <SettingsSection icon={User} title="Profile">
        <div className="space-y-4">
          <div>
            <label className="block text-sm text-muted mb-1">Email</label>
            <p className="text-foreground">{user?.email || 'Not logged in'}</p>
          </div>
          <Button variant="secondary" onClick={logout}>
            Sign Out
          </Button>
        </div>
      </SettingsSection>

      {/* Units */}
      <SettingsSection icon={Ruler} title="Units">
        <div className="space-y-4">
          <div>
            <label className="block text-sm text-muted mb-2">Weight Unit</label>
            <div className="flex gap-2">
              <ToggleButton
                active={units === 'imperial'}
                onClick={() => setUnits('imperial')}
              >
                Imperial (lbs)
              </ToggleButton>
              <ToggleButton
                active={units === 'metric'}
                onClick={() => setUnits('metric')}
              >
                Metric (kg)
              </ToggleButton>
            </div>
          </div>
          <p className="text-xs text-muted">
            This affects how weights are displayed throughout the app.
          </p>
        </div>
      </SettingsSection>

      {/* Rest Timer */}
      <SettingsSection icon={Timer} title="Rest Timer">
        <div className="space-y-4">
          <div>
            <label className="block text-sm text-muted mb-2">Default Duration</label>
            <div className="flex flex-wrap gap-2">
              {restOptions.map((seconds) => (
                <ToggleButton
                  key={seconds}
                  active={defaultRestDuration === seconds}
                  onClick={() => setDefaultRestDuration(seconds)}
                >
                  {formatRestTime(seconds)}
                </ToggleButton>
              ))}
            </div>
          </div>
          <p className="text-xs text-muted">
            Default rest timer duration when starting a new set.
          </p>
        </div>
      </SettingsSection>

      {/* Analysis Defaults */}
      <SettingsSection icon={BarChart3} title="Analysis Defaults">
        <div className="space-y-4">
          <div>
            <label className="block text-sm text-muted mb-2">Dataset</label>
            <div className="flex flex-wrap gap-2">
              {([
                { value: 'schoenfeld', label: 'Schoenfeld (Recommended)' },
                { value: 'pelland', label: 'Pelland' },
                { value: 'average', label: 'Average' },
              ] as const).map((opt) => (
                <ToggleButton
                  key={opt.value}
                  active={dataset === opt.value}
                  onClick={() => setDataset(opt.value as Dataset)}
                >
                  {opt.label}
                </ToggleButton>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-sm text-muted mb-2">Stimulus Duration (hours)</label>
            <input
              type="number"
              min={24}
              max={96}
              value={stimulusDuration}
              onChange={(e) => {
                const v = parseInt(e.target.value, 10);
                if (!isNaN(v) && v >= 24 && v <= 96) setStimulusDuration(v);
              }}
              className="w-24 bg-charcoal border border-white/10 rounded-md px-3 py-2 text-foreground focus:outline-none focus:border-crimson/50"
            />
          </div>
          <div>
            <label className="block text-sm text-muted mb-2">Maintenance Volume (sets/week)</label>
            <input
              type="number"
              min={1}
              max={9}
              value={maintenanceVolume}
              onChange={(e) => {
                const v = parseInt(e.target.value, 10);
                if (!isNaN(v) && v >= 1 && v <= 9) setMaintenanceVolume(v);
              }}
              className="w-24 bg-charcoal border border-white/10 rounded-md px-3 py-2 text-foreground focus:outline-none focus:border-crimson/50"
            />
          </div>
          <p className="text-xs text-muted">
            These settings control how your logged workouts are analyzed in the Progress tab.
            They determine the fatigue curve, stimulus window, and maintenance threshold used
            when calculating net weekly stimulus from your actual training data.
          </p>
        </div>
      </SettingsSection>

      {/* Data */}
      <SettingsSection icon={Database} title="Data">
        <div className="space-y-4">
          <div>
            <p className="text-sm text-secondary mb-2">
              Your workout data is stored securely in the cloud.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" disabled>
              Export Data (Coming Soon)
            </Button>
          </div>
          <div className="pt-4 border-t border-white/5">
            <p className="text-sm text-muted mb-2">Danger Zone</p>
            {showDeleteConfirm ? (
              <div className="flex items-center gap-2">
                <span className="text-sm text-red-400">Are you sure?</span>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setShowDeleteConfirm(false)}
                >
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  className="bg-red-600 hover:bg-red-700"
                  disabled
                >
                  Delete Account
                </Button>
              </div>
            ) : (
              <Button
                variant="ghost"
                className="text-red-400 hover:text-red-300"
                onClick={() => setShowDeleteConfirm(true)}
              >
                Delete Account
              </Button>
            )}
          </div>
        </div>
      </SettingsSection>

      {/* About */}
      <SettingsSection icon={Info} title="About">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-secondary">Version</span>
            <span className="text-foreground font-mono">1.0.0</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-secondary">App</span>
            <span className="text-foreground">AlgoSplit</span>
          </div>
          <div className="pt-4 border-t border-white/5 space-y-2">
            <p className="text-sm text-muted">
              AlgoSplit uses research-backed muscle stimulus and fatigue models to optimize your training.
            </p>
            <div className="flex flex-wrap gap-2">
              <a
                href="https://github.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-crimson hover:text-crimson-hover flex items-center gap-1"
              >
                GitHub <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>
        </div>
      </SettingsSection>
    </div>
  );
}
