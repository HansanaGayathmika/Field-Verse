import { lazy, Suspense, type ReactNode } from 'react';
import { createBrowserRouter } from 'react-router';
import { AppLayout } from '@/components/layout/AppLayout';
import { LoadingBlock } from '@/components/StatusStates';
import { LandingPage } from '@/pages/LandingPage';
import { NotFoundPage } from '@/pages/NotFoundPage';
import { RequireAuth } from '@/components/Page';

// Heavier pages are code-split so the landing page stays light on slow connections.
const ExplorePage = lazy(() => import('@/pages/ExplorePage'));
const SetupPage = lazy(() => import('@/pages/SetupPage'));
const DashboardPage = lazy(() => import('@/pages/DashboardPage'));
const RotationLabPage = lazy(() => import('@/pages/RotationLabPage'));
const StrategyDetailPage = lazy(() => import('@/pages/StrategyDetailPage'));
const RootsPage = lazy(() => import('@/pages/RootsPage'));
const ClimatePage = lazy(() => import('@/pages/ClimatePage'));
const GapFinderPage = lazy(() => import('@/pages/GapFinderPage'));
const PlanPage = lazy(() => import('@/pages/PlanPage'));
const SavedPage = lazy(() => import('@/pages/SavedPage'));
const DataSourcesPage = lazy(() => import('@/pages/DataSourcesPage'));
const AuthPage = lazy(() => import('@/pages/AuthPage'));
const AccountPage = lazy(() => import('@/pages/AccountPage'));
const CommunityPage = lazy(() => import('@/pages/community/CommunityPage'));
const ShareExperiencePage = lazy(() => import('@/pages/community/ShareExperiencePage'));
const ExperienceDetailPage = lazy(() => import('@/pages/community/ExperienceDetailPage'));
const MyExperiencesPage = lazy(() => import('@/pages/community/MyExperiencesPage'));
const ModerationPage = lazy(() => import('@/pages/community/ModerationPage'));
// Roots of Tomorrow recommendation UI (self-contained module in src/recommend; see docs/RECOMMEND_UI.md)
const RecommendFormPage = lazy(() => import('@/recommend/form/RecommendFormPage'));
const RecommendResultsPage = lazy(() => import('@/recommend/results/RecommendResultsPage'));

/** Feature pages are only available after login. */
const p = (el: ReactNode) => s(<RequireAuth>{el}</RequireAuth>);

const s = (el: ReactNode) => <Suspense fallback={<div className="mx-auto max-w-7xl px-4 py-10"><LoadingBlock /></div>}>{el}</Suspense>;

export const router = createBrowserRouter([
  {
    element: <AppLayout />,
    children: [
      { path: '/', element: <LandingPage /> },
      { path: '/explore', element: p(<ExplorePage />) },
      { path: '/setup', element: p(<SetupPage />) },
      { path: '/farm', element: p(<DashboardPage />) },
      { path: '/rotations', element: p(<RotationLabPage />) },
      { path: '/rotations/:strategyId', element: p(<StrategyDetailPage />) },
      { path: '/roots', element: p(<RootsPage />) },
      { path: '/climate', element: p(<ClimatePage />) },
      { path: '/gaps', element: p(<GapFinderPage />) },
      { path: '/plan', element: p(<PlanPage />) },
      { path: '/saved', element: p(<SavedPage />) },
      { path: '/data', element: p(<DataSourcesPage />) },
      { path: '/login', element: s(<AuthPage mode="login" />) },
      { path: '/register', element: s(<AuthPage mode="register" />) },
      { path: '/account', element: p(<AccountPage />) },
      // Community: browsing and the share form are public; publishing requires login (enforced by the API).
      { path: '/community', element: s(<CommunityPage />) },
      { path: '/community/share', element: s(<ShareExperiencePage />) },
      { path: '/community/experiences/:id', element: s(<ExperienceDetailPage />) },
      { path: '/community/my-experiences', element: p(<MyExperiencesPage />) },
      { path: '/community/moderation', element: p(<ModerationPage />) },
      { path: '/recommend', element: p(<RecommendFormPage />) },
      { path: '/recommend/results', element: p(<RecommendResultsPage />) },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]);
