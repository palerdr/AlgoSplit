import { lazy, Suspense, useEffect, Component, type ReactNode } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, ProtectedRoute } from '@/features/auth';
import { AppShell } from '@/components/layout';

// Auth pages - eagerly loaded (needed immediately)
import { LoginPage, SignupPage } from '@/pages';

// Core pages - eagerly loaded (most frequently accessed)
import { DashboardPage } from '@/pages';

// Lazy-loaded pages for better initial load performance
const WorkoutPage = lazy(() => import('@/pages/workout/WorkoutPage').then(m => ({ default: m.WorkoutPage })));
const HistoryPage = lazy(() => import('@/pages/history/HistoryPage').then(m => ({ default: m.HistoryPage })));
const WorkoutDetailPage = lazy(() => import('@/pages/history/WorkoutDetailPage').then(m => ({ default: m.WorkoutDetailPage })));
const AnalysisPage = lazy(() => import('@/pages/analysis/AnalysisPage').then(m => ({ default: m.AnalysisPage })));
const SplitsPage = lazy(() => import('@/pages/splits/SplitsPage').then(m => ({ default: m.SplitsPage })));
const SplitDetailPage = lazy(() => import('@/pages/splits/SplitDetailPage').then(m => ({ default: m.SplitDetailPage })));
const SplitCreatePage = lazy(() => import('@/pages/splits/SplitCreatePage').then(m => ({ default: m.SplitCreatePage })));
const SplitEditPage = lazy(() => import('@/pages/splits/SplitEditPage').then(m => ({ default: m.SplitEditPage })));
const ComparePage = lazy(() => import('@/pages/compare/ComparePage').then(m => ({ default: m.ComparePage })));
const ProgramsPage = lazy(() => import('@/pages/programs/ProgramsPage').then(m => ({ default: m.ProgramsPage })));
const ProgramCreatePage = lazy(() => import('@/pages/programs/ProgramCreatePage').then(m => ({ default: m.ProgramCreatePage })));
const ProgramDetailPage = lazy(() => import('@/pages/programs/ProgramDetailPage').then(m => ({ default: m.ProgramDetailPage })));
const ExercisesPage = lazy(() => import('@/pages/exercises/ExercisesPage').then(m => ({ default: m.ExercisesPage })));
const ProgressPage = lazy(() => import('@/pages/progress/ProgressPage').then(m => ({ default: m.ProgressPage })));
const BodyweightPage = lazy(() => import('@/pages/bodyweight/BodyweightPage').then(m => ({ default: m.BodyweightPage })));
const SettingsPage = lazy(() => import('@/pages/settings/SettingsPage').then(m => ({ default: m.SettingsPage })));
const ToolsPage = lazy(() => import('@/pages/tools/ToolsPage').then(m => ({ default: m.ToolsPage })));

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
      return (
        <div className="min-h-screen bg-iron flex items-center justify-center p-8">
          <div className="max-w-lg w-full bg-charcoal border border-white/10 rounded-lg p-6 space-y-4">
            <h2 className="text-lg font-bold text-foreground">Something went wrong</h2>
            <pre className="text-sm text-red-400 bg-steel/50 rounded p-3 overflow-auto max-h-48 whitespace-pre-wrap">
              {this.state.error.message}
            </pre>
            <div className="flex gap-2">
              <button
                onClick={() => { this.setState({ error: null }); window.location.href = '/dashboard'; }}
                className="px-4 py-2 bg-crimson text-white rounded-md text-sm hover:bg-crimson/80"
              >
                Go to Dashboard
              </button>
              <button
                onClick={() => this.setState({ error: null })}
                className="px-4 py-2 bg-steel text-foreground rounded-md text-sm hover:bg-steel/80"
              >
                Try Again
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
      if (path !== '/dashboard' && path !== '/login' && path !== '/signup') {
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

      {/* Default redirect */}
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
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
