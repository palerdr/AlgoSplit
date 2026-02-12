import { lazy, Suspense, useEffect, Component, type ReactNode } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, ProtectedRoute } from '@/features/auth';
import { AppShell } from '@/components/layout';

// Auth pages - eagerly loaded (needed immediately)
import { LoginPage, SignupPage } from '@/pages';

// Core pages - eagerly loaded (most frequently accessed)
import { DashboardPage } from '@/pages';

// Retry dynamic import once silently; if still fails, let ErrorBoundary handle it
function lazyRetry<T extends { [key: string]: unknown }>(
  factory: () => Promise<T>,
  name: keyof T,
) {
  return lazy(() =>
    factory()
      .then(m => ({ default: m[name] as React.ComponentType }))
      .catch(() =>
        // One silent retry — chunk may have been mid-deploy
        factory().then(m => ({ default: m[name] as React.ComponentType }))
      ),
  );
}

function isChunkError(error: Error): boolean {
  const msg = error.message.toLowerCase();
  return msg.includes('failed to fetch dynamically imported module')
    || msg.includes('loading chunk')
    || msg.includes('loading css chunk')
    || msg.includes('dynamically imported module');
}

// Lazy-loaded pages for better initial load performance
const WorkoutPage = lazyRetry(() => import('@/pages/workout/WorkoutPage'), 'WorkoutPage');
const HistoryPage = lazyRetry(() => import('@/pages/history/HistoryPage'), 'HistoryPage');
const WorkoutDetailPage = lazyRetry(() => import('@/pages/history/WorkoutDetailPage'), 'WorkoutDetailPage');
const AnalysisPage = lazyRetry(() => import('@/pages/analysis/AnalysisPage'), 'AnalysisPage');
const SplitsPage = lazyRetry(() => import('@/pages/splits/SplitsPage'), 'SplitsPage');
const SplitDetailPage = lazyRetry(() => import('@/pages/splits/SplitDetailPage'), 'SplitDetailPage');
const SplitCreatePage = lazyRetry(() => import('@/pages/splits/SplitCreatePage'), 'SplitCreatePage');
const SplitEditPage = lazyRetry(() => import('@/pages/splits/SplitEditPage'), 'SplitEditPage');
const ComparePage = lazyRetry(() => import('@/pages/compare/ComparePage'), 'ComparePage');
const ProgramsPage = lazyRetry(() => import('@/pages/programs/ProgramsPage'), 'ProgramsPage');
const ProgramCreatePage = lazyRetry(() => import('@/pages/programs/ProgramCreatePage'), 'ProgramCreatePage');
const ProgramDetailPage = lazyRetry(() => import('@/pages/programs/ProgramDetailPage'), 'ProgramDetailPage');
const ExercisesPage = lazyRetry(() => import('@/pages/exercises/ExercisesPage'), 'ExercisesPage');
const ProgressPage = lazyRetry(() => import('@/pages/progress/ProgressPage'), 'ProgressPage');
const BodyweightPage = lazyRetry(() => import('@/pages/bodyweight/BodyweightPage'), 'BodyweightPage');
const SettingsPage = lazyRetry(() => import('@/pages/settings/SettingsPage'), 'SettingsPage');
const ToolsPage = lazyRetry(() => import('@/pages/tools/ToolsPage'), 'ToolsPage');
const LandingPage = lazyRetry(() => import('@/pages/landing/LandingPage'), 'LandingPage');

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      retry: 1,
    },
  },
});

function PageLoader() {
  return (
    <div className="flex items-center justify-center min-h-[50vh]">
      <div className="w-6 h-6 border-2 border-crimson border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

// Error boundary to prevent black screen crashes
class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      const chunkError = isChunkError(this.state.error);

      return (
        <div className="min-h-screen bg-iron flex items-center justify-center p-8">
          <div className="max-w-lg w-full bg-charcoal border border-white/10 rounded-lg p-6 space-y-4 text-center">
            {chunkError ? (
              <>
                <p className="text-3xl">🏋️</p>
                <h2 className="text-lg font-bold text-foreground">
                  New version available
                </h2>
                <p className="text-sm text-secondary">
                  We just shipped an update. Reload to grab the latest version.
                </p>
              </>
            ) : (
              <>
                <h2 className="text-lg font-bold text-foreground">Something went wrong</h2>
                <pre className="text-sm text-red-400 bg-steel/50 rounded p-3 overflow-auto max-h-48 whitespace-pre-wrap text-left">
                  {this.state.error.message}
                </pre>
              </>
            )}
            <div className="flex gap-2 justify-center">
              <button
                onClick={() => window.location.reload()}
                className="px-4 py-2 bg-crimson text-white rounded-md text-sm hover:bg-crimson/80"
              >
                {chunkError ? 'Reload' : 'Try Again'}
              </button>
              <button
                onClick={() => { this.setState({ error: null }); window.location.href = '/dashboard'; }}
                className="px-4 py-2 bg-steel text-foreground rounded-md text-sm hover:bg-steel/80"
              >
                Go to Dashboard
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function AppRoutes() {
  const navigate = useNavigate();

  useEffect(() => {
    if (!sessionStorage.getItem('algosplit-session')) {
      sessionStorage.setItem('algosplit-session', '1');
      const path = window.location.pathname;
      if (path !== '/' && path !== '/dashboard' && path !== '/login' && path !== '/signup') {
        navigate('/dashboard', { replace: true });
      }
    }
  }, [navigate]);

  return (
    <Routes>
      {/* Public routes */}
      <Route path="/login" element={<LoginPage />} />
      <Route path="/signup" element={<SignupPage />} />

      {/* Protected routes */}
      <Route element={<ProtectedRoute />}>
        <Route element={<AppShell />}>
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/workout" element={<Suspense fallback={<PageLoader />}><WorkoutPage /></Suspense>} />
          <Route path="/history" element={<Suspense fallback={<PageLoader />}><HistoryPage /></Suspense>} />
          <Route path="/history/:id" element={<Suspense fallback={<PageLoader />}><WorkoutDetailPage /></Suspense>} />
          <Route path="/splits" element={<Suspense fallback={<PageLoader />}><SplitsPage /></Suspense>} />
          <Route path="/splits/new" element={<Suspense fallback={<PageLoader />}><SplitCreatePage /></Suspense>} />
          <Route path="/splits/:id/edit" element={<Suspense fallback={<PageLoader />}><SplitEditPage /></Suspense>} />
          <Route path="/splits/:id" element={<Suspense fallback={<PageLoader />}><SplitDetailPage /></Suspense>} />
          <Route path="/analysis" element={<Suspense fallback={<PageLoader />}><AnalysisPage /></Suspense>} />
          <Route path="/analysis/:splitId" element={<Suspense fallback={<PageLoader />}><AnalysisPage /></Suspense>} />
          <Route path="/compare" element={<Suspense fallback={<PageLoader />}><ComparePage /></Suspense>} />
          <Route path="/compare/:id" element={<Suspense fallback={<PageLoader />}><ComparePage /></Suspense>} />
          <Route path="/programs" element={<Suspense fallback={<PageLoader />}><ProgramsPage /></Suspense>} />
          <Route path="/programs/new" element={<Suspense fallback={<PageLoader />}><ProgramCreatePage /></Suspense>} />
          <Route path="/programs/:id" element={<Suspense fallback={<PageLoader />}><ProgramDetailPage /></Suspense>} />
          <Route path="/exercises" element={<Suspense fallback={<PageLoader />}><ExercisesPage /></Suspense>} />
          <Route path="/progress" element={<Suspense fallback={<PageLoader />}><ProgressPage /></Suspense>} />
          <Route path="/bodyweight" element={<Suspense fallback={<PageLoader />}><BodyweightPage /></Suspense>} />
          <Route path="/tools" element={<Suspense fallback={<PageLoader />}><ToolsPage /></Suspense>} />
          <Route path="/settings" element={<Suspense fallback={<PageLoader />}><SettingsPage /></Suspense>} />
        </Route>
      </Route>

      {/* Landing page */}
      <Route path="/" element={<Suspense fallback={<PageLoader />}><LandingPage /></Suspense>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <AuthProvider>
            <AppRoutes />
          </AuthProvider>
        </BrowserRouter>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
