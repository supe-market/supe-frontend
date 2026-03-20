import { Suspense, lazy, type ReactNode } from 'react';
import { Spin } from 'antd';
import { Navigate, Route, Routes } from 'react-router-dom';
import { RequireAuth } from '../features/auth/RequireAuth';
import { SignInPage } from '../features/auth/SignInPage';
import {
  supeBeatRoute,
  supeCompareRoute,
  supeDistributorRoute,
  supeHypothesesRoute,
  supeRetailerRoute,
  supeSalesmanRoute,
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

const EntityView = lazy(() =>
  import('../features/supe/views/EntityView').then((module) => ({
    default: module.EntityView
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

const TrajectoryView = lazy(() =>
  import('../features/supe/views/TrajectoryView').then((module) => ({
    default: module.TrajectoryView
  }))
);

function RouteLoading() {
  return (
    <div style={{ minHeight: '50vh', display: 'grid', placeItems: 'center' }}>
      <Spin size="large" />
    </div>
  );
}

function withSuspense(element: ReactNode) {
  return <Suspense fallback={<RouteLoading />}>{element}</Suspense>;
}

export function App() {
  return (
    <Routes>
      <Route path="/signin" element={<SignInPage />} />

      <Route element={<RequireAuth />}>
        <Route element={withSuspense(<SupeLayout />)}>
          <Route index element={<Navigate to={supeSummaryRoute} replace />} />
          <Route path={supeSummaryRoute.slice(1)} element={withSuspense(<DashboardView />)} />
          <Route
            path={supeSalesmanRoute.slice(1)}
            element={withSuspense(<EntityView entityType="salesman" title="Salesman Performance" />)}
          />
          <Route
            path={supeRetailerRoute.slice(1)}
            element={withSuspense(<EntityView entityType="retailer" title="Retailer Health" />)}
          />
          <Route
            path={supeBeatRoute.slice(1)}
            element={withSuspense(<EntityView entityType="beat" title="Beat Performance" />)}
          />
          <Route
            path={supeSkuRoute.slice(1)}
            element={withSuspense(<EntityView entityType="sku" title="SKU Performance" />)}
          />
          <Route
            path={supeDistributorRoute.slice(1)}
            element={withSuspense(<EntityView entityType="distributor" title="Distributor Operations" />)}
          />
          <Route path={supeTrajectoryRoute.slice(1)} element={withSuspense(<TrajectoryView />)} />
          <Route path={supeCompareRoute.slice(1)} element={withSuspense(<CompareView />)} />
          <Route path={supeHypothesesRoute.slice(1)} element={withSuspense(<HypothesesView />)} />
          <Route path={supeTargetsRoute.slice(1)} element={withSuspense(<TargetsView />)} />
          <Route path="*" element={<Navigate to={supeSummaryRoute} replace />} />
        </Route>
      </Route>
    </Routes>
  );
}
