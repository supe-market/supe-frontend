/**
 * Top-level route tree for the Supe frontend.
 */
import { Suspense, lazy, type ReactNode } from 'react';
import { Spin } from 'antd';
import { Navigate, Route, Routes } from 'react-router-dom';
import '../features/supe/theme.css';
import { RequireAuth } from '../features/auth/RequireAuth';
import { SignInPage } from '../features/auth/SignInPage';
import {
  supeActRoute,
  supeAskRoute,
  supeBriefingRoute,
  supeBeatRoute,
  supeCompareRoute,
  supeDistributorRoute,
  supeExploreRoute,
  supeHypothesesRoute,
  supeImportsRoute,
  supeRetailerRoute,
  supeSalesmanRoute,
  supeSchemesRoute,
  supeSkuRoute,
  supeSummaryRoute,
  supeTargetsRoute,
  supeTrajectoryRoute
} from '../features/supe/constants';

const SupeLayout = lazy(() =>
  import('../features/supe/SupeLayout').then((module) => ({
    default: module.SupeLayout
  }))
);

const DashboardView = lazy(() =>
  import('../features/supe/views/DashboardView').then((module) => ({
    default: module.DashboardView
  }))
);

const ExploreView = lazy(() =>
  import('../features/supe/views/ExploreView').then((module) => ({
    default: module.ExploreView
  }))
);

const CompareView = lazy(() =>
  import('../features/supe/views/CompareView').then((module) => ({
    default: module.CompareView
  }))
);

const HypothesesView = lazy(() =>
  import('../features/supe/views/HypothesesView').then((module) => ({
    default: module.HypothesesView
  }))
);

const TargetsView = lazy(() =>
  import('../features/supe/views/TargetsView').then((module) => ({
    default: module.TargetsView
  }))
);

const ActView = lazy(() =>
  import('../features/supe/views/ActView').then((module) => ({
    default: module.ActView
  }))
);

const TrajectoryView = lazy(() =>
  import('../features/supe/views/TrajectoryView').then((module) => ({
    default: module.TrajectoryView
  }))
);

const ImportsView = lazy(() =>
  import('../features/supe/views/ImportsView').then((module) => ({
    default: module.ImportsView
  }))
);

function RouteLoading() {
  /** Small shared loading shell while route-level bundles are still loading. */
  return (
    <div style={{ minHeight: '50vh', display: 'grid', placeItems: 'center' }}>
      <Spin size="large" />
    </div>
  );
}

function withSuspense(element: ReactNode) {
  /** Wrap lazy route elements in the standard loading fallback. */
  return <Suspense fallback={<RouteLoading />}>{element}</Suspense>;
}

export function App() {
  /** Register public auth routes and the protected Supe application shell. */
  return (
    <Routes>
      <Route path="/signin" element={<SignInPage />} />

      <Route element={<RequireAuth />}>
        <Route element={withSuspense(<SupeLayout />)}>
          <Route index element={withSuspense(<DashboardView />)} />
          <Route path={supeBriefingRoute.slice(1)} element={withSuspense(<DashboardView />)} />
          <Route path={supeExploreRoute.slice(1)} element={withSuspense(<ExploreView />)} />
          <Route path={supeAskRoute.slice(1)} element={withSuspense(<HypothesesView />)} />
          <Route path={supeActRoute.slice(1)} element={withSuspense(<ActView />)} />
          <Route path={supeSchemesRoute.slice(1)} element={<Navigate to={supeActRoute} replace />} />
          <Route path={supeSummaryRoute.slice(1)} element={withSuspense(<DashboardView />)} />
          <Route
            path={supeSalesmanRoute.slice(1)}
            element={<Navigate to={`${supeExploreRoute}?entity=salesman`} replace />}
          />
          <Route
            path={supeRetailerRoute.slice(1)}
            element={<Navigate to={`${supeExploreRoute}?entity=retailer`} replace />}
          />
          <Route
            path={supeBeatRoute.slice(1)}
            element={<Navigate to={`${supeExploreRoute}?entity=beat`} replace />}
          />
          <Route
            path={supeSkuRoute.slice(1)}
            element={<Navigate to={`${supeExploreRoute}?entity=sku`} replace />}
          />
          <Route
            path={supeDistributorRoute.slice(1)}
            element={<Navigate to={`${supeExploreRoute}?entity=distributor`} replace />}
          />
          <Route path={supeTrajectoryRoute.slice(1)} element={withSuspense(<TrajectoryView />)} />
          <Route path={supeCompareRoute.slice(1)} element={withSuspense(<CompareView />)} />
          <Route path={supeHypothesesRoute.slice(1)} element={withSuspense(<HypothesesView />)} />
          <Route path={supeTargetsRoute.slice(1)} element={withSuspense(<TargetsView />)} />
          <Route path={supeImportsRoute.slice(1)} element={withSuspense(<ImportsView />)} />
          <Route path="*" element={<Navigate to={supeSummaryRoute} replace />} />
        </Route>
      </Route>
    </Routes>
  );
}
