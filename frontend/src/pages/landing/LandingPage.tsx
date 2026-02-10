import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '@/features/auth';
import { Activity, BarChart3, Zap } from 'lucide-react';

function PageLoader() {
  return (
    <div className="flex items-center justify-center min-h-screen bg-iron">
      <div className="w-6 h-6 border-2 border-crimson border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

function AppStoreBadge({ store }: { store: 'apple' | 'google' }) {
  return (
    <button
      className="flex items-center gap-2 px-4 py-2.5 bg-charcoal border border-white/10 rounded-lg hover:border-white/20 transition-colors cursor-default opacity-60"
      title="Coming soon"
      disabled
    >
      {store === 'apple' ? (
        <svg className="w-5 h-5 text-foreground" viewBox="0 0 24 24" fill="currentColor">
          <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
        </svg>
      ) : (
        <svg className="w-5 h-5 text-foreground" viewBox="0 0 24 24" fill="currentColor">
          <path d="M3 20.5v-17c0-.59.34-1.11.84-1.35L13.69 12l-9.85 9.85c-.5-.24-.84-.76-.84-1.35zm13.81-5.38L6.05 21.34l8.49-8.49 2.27 2.27zm3.35-4.31c.34.27.56.69.56 1.19s-.22.92-.56 1.19l-1.97 1.13-2.5-2.5 2.5-2.5 1.97 1.13zM6.05 2.66l10.76 6.22-2.27 2.27-8.49-8.49z" />
        </svg>
      )}
      <div className="text-left">
        <div className="text-[10px] text-muted leading-none">
          {store === 'apple' ? 'Download on the' : 'GET IT ON'}
        </div>
        <div className="text-sm text-foreground font-medium leading-tight">
          {store === 'apple' ? 'App Store' : 'Google Play'}
        </div>
      </div>
    </button>
  );
}

function AppMockup() {
  const mockBars = [
    { label: 'Quads', value: 85, color: 'bg-stimulus-6' },
    { label: 'Chest', value: 72, color: 'bg-stimulus-5' },
    { label: 'Back', value: 68, color: 'bg-stimulus-5' },
    { label: 'Shoulders', value: 55, color: 'bg-stimulus-4' },
    { label: 'Hamstrings', value: 42, color: 'bg-stimulus-3' },
    { label: 'Biceps', value: 38, color: 'bg-stimulus-3' },
    { label: 'Triceps', value: 30, color: 'bg-stimulus-2' },
    { label: 'Calves', value: 15, color: 'bg-stimulus-1' },
  ];

  return (
    <div className="relative">
      <div className="absolute -inset-4 bg-crimson/10 blur-3xl rounded-full" />
      <div className="relative bg-charcoal border border-white/10 rounded-xl p-5 space-y-3">
        <div className="flex items-center justify-between mb-4">
          <span className="text-sm font-medium text-foreground">Weekly Stimulus</span>
          <span className="text-xs text-muted">Push/Pull/Legs</span>
        </div>
        {mockBars.map((bar) => (
          <div key={bar.label} className="flex items-center gap-3">
            <span className="text-xs text-secondary w-20 text-right">{bar.label}</span>
            <div className="flex-1 h-2.5 bg-steel rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full ${bar.color}`}
                style={{ width: `${bar.value}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function FeatureCard({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
  return (
    <div className="bg-charcoal border border-white/8 rounded-xl p-6 space-y-3">
      <div className="w-10 h-10 rounded-lg bg-crimson/10 flex items-center justify-center text-crimson">
        {icon}
      </div>
      <h3 className="text-foreground font-semibold">{title}</h3>
      <p className="text-sm text-secondary leading-relaxed">{description}</p>
    </div>
  );
}

export function LandingPage() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) return <PageLoader />;

  if (window.innerWidth < 768) {
    return <Navigate to={isAuthenticated ? '/dashboard' : '/login'} replace />;
  }

  return (
    <div className="min-h-screen bg-iron">
      {/* Nav */}
      <nav className="fixed top-0 inset-x-0 z-50 bg-iron/80 backdrop-blur-md border-b border-white/5">
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-md bg-crimson flex items-center justify-center">
              <Activity className="w-4 h-4 text-white" />
            </div>
            <span className="text-foreground font-bold text-lg">AlgoSplit</span>
          </Link>
          <div className="flex items-center gap-3">
            {isAuthenticated ? (
              <Link
                to="/dashboard"
                className="text-sm bg-crimson text-foreground px-4 py-1.5 rounded-md hover:bg-crimson-hover transition-colors"
              >
                Go to Dashboard
              </Link>
            ) : (
              <>
                <Link
                  to="/login"
                  className="text-sm text-secondary hover:text-foreground transition-colors px-3 py-1.5"
                >
                  Log In
                </Link>
                <Link
                  to="/signup"
                  className="text-sm bg-crimson text-foreground px-4 py-1.5 rounded-md hover:bg-crimson-hover transition-colors"
                >
                  Get Started
                </Link>
              </>
            )}
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="pt-28 pb-20 px-6">
        <div className="max-w-6xl mx-auto grid lg:grid-cols-2 gap-12 items-center">
          {/* Left */}
          <div className="space-y-6">
            <h1 className="text-4xl md:text-5xl font-bold text-foreground leading-tight">
              Stop guessing,{' '}
              <span className="text-crimson">start training</span>
            </h1>
            <p className="text-lg text-secondary max-w-lg leading-relaxed">
              The research-backed maximalist tracking app that models stimulus, fatigue, and recovery across muscle-fiber specific regions to optimize your training.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              {isAuthenticated ? (
                <Link
                  to="/dashboard"
                  className="inline-flex items-center px-6 py-2.5 bg-crimson text-foreground font-medium rounded-md hover:bg-crimson-hover transition-colors"
                >
                  Go to Dashboard
                </Link>
              ) : (
                <>
                  <Link
                    to="/signup"
                    className="inline-flex items-center px-6 py-2.5 bg-crimson text-foreground font-medium rounded-md hover:bg-crimson-hover transition-colors"
                  >
                    Start Analyzing Free
                  </Link>
                  <Link
                    to="/login"
                    className="inline-flex items-center px-6 py-2.5 bg-steel text-foreground border border-white/8 rounded-md hover:bg-graphite transition-colors"
                  >
                    Open Web App
                  </Link>
                </>
              )}
            </div>
            <div className="flex items-center gap-3 pt-2">
              <AppStoreBadge store="apple" />
              <AppStoreBadge store="google" />
            </div>
          </div>

          {/* Right */}
          <div className="hidden lg:block">
            <AppMockup />
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="pb-20 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="grid md:grid-cols-3 gap-6">
            <FeatureCard
              icon={<Activity className="w-5 h-5" />}
              title="29-Region Muscle Model"
              description="Granular anatomical mapping from your (small) clavicular chest to the gastroc. Every set is tracked at the sub-muscle level."
            />
            <FeatureCard
              icon={<BarChart3 className="w-5 h-5" />}
              title="Stimulus & Fatigue Modeling"
              description="Calculates net weekly stimulus accounting for diminishing returns, CNS fatigue, axial load, and recovery windows."
            />
            <FeatureCard
              icon={<Zap className="w-5 h-5" />}
              title="Split Optimization"
              description="Compare splits side-by-side and get actionable suggestions to balance volume, frequency, and recovery."
            />
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/5 py-8 px-6">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <span className="text-sm text-muted">AlgoSplit</span>
          <span className="text-xs text-muted">Research-backed training optimization</span>
        </div>
      </footer>
    </div>
  );
}
