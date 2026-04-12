/**
 * Main authenticated application shell for the Supe frontend.
 *
 * This component owns the persistent navigation chrome, period context card,
 * action-log drawer, and the routed content outlet.
 */
import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { Button, Drawer } from 'antd';
import {
  BarChartOutlined,
  DownOutlined,
  DeploymentUnitOutlined,
  FileTextOutlined,
  FundProjectionScreenOutlined,
  LeftOutlined,
  LogoutOutlined,
  MenuOutlined,
  MessageOutlined,
  RightOutlined,
  ThunderboltOutlined,
  RadarChartOutlined,
  RiseOutlined,
  SearchOutlined,
  ShopOutlined,
  SunOutlined,
  FlagOutlined,
  TeamOutlined
} from '@ant-design/icons';
import { Link, NavLink, Outlet, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import supeApi from './api';
import { ActionLogPanel } from './components/ActionLogPanel';
import { PromptCommandBar } from './components/PromptCommandBar';
import {
  supeActRoute,
  supeAskRoute,
  supeBriefingRoute,
  supeCompareRoute,
  supeExploreEntityMeta,
  supeExploreRoute,
  supeImportsRoute,
  supeSchemesRoute,
  supeTargetsRoute,
  supeTrajectoryRoute
} from './constants';
import styles from './SupeLayout.module.css';

const entityIconMap = {
  salesman: <TeamOutlined />,
  retailer: <ShopOutlined />,
  sku: <FundProjectionScreenOutlined />,
  distributor: <DeploymentUnitOutlined />,
  beat: <RadarChartOutlined />
};

const DESKTOP_SIDEBAR_WIDTH = 220;
const COLLAPSED_SIDEBAR_WIDTH = 56;

function SupeLogoSmall({ size = 32 }: { size?: number }) {
  /** Compact brand mark used in the sidebar and mobile drawer. */
  const id = 'supe-layout-sm';
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none" aria-hidden="true">
      <path d="M20 2C13 2 8 6 8 11V24C8 31 13 37 20 39C27 37 32 31 32 24V11C32 6 27 2 20 2Z" fill={`url(#${id}-sh)`} />
      <path
        d="M20 2C13 2 8 6 8 11V24C8 31 13 37 20 39C27 37 32 31 32 24V11C32 6 27 2 20 2Z"
        stroke="rgba(255,255,255,0.15)"
        strokeWidth="0.75"
        fill="none"
      />
      <path
        d="M23 11.5L20.5 8.5L18 11.5L20 11.5C17.5 11.5 15.5 13 15.5 15.5C15.5 18 17.5 19.2 20 20C22.5 20.8 24 21.8 24 23.5C24 25.2 22.2 26.5 20 26.5C17.8 26.5 16.2 25.2 16.2 25.2L14.8 27.2C14.8 27.2 17 29 20 29C23.5 29 26 27 26 24C26 21 23.5 19.8 21 19C18.5 18.2 17.5 17.2 17.5 15.8C17.5 14.4 18.8 13.2 20 13.2L23 11.5Z"
        fill="white"
      />
      <circle cx="20" cy="1" r="1.2" fill="#F59E0B" opacity="0.9" />
      <defs>
        <linearGradient id={`${id}-sh`} x1="20" y1="2" x2="20" y2="39" gradientUnits="userSpaceOnUse">
          <stop stopColor="#4F6EF7" />
          <stop offset="0.5" stopColor="#4361EE" />
          <stop offset="1" stopColor="#1E30A0" />
        </linearGradient>
      </defs>
    </svg>
  );
}

function getFiscalQuarterLabel(date: Date) {
  /** Render the current fiscal quarter label used in the sidebar period card. */
  const month = date.getMonth();
  const fiscalQuarter = Math.floor((((month - 3 + 12) % 12) / 3)) + 1;
  const fiscalYear = month >= 3 ? date.getFullYear() + 1 : date.getFullYear();
  return `Q${fiscalQuarter} FY${String(fiscalYear).slice(-2)}`;
}

export function SupeLayout() {
  /** Render the persistent shell around all protected Supe routes. */
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { logout } = useAuth();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return window.localStorage.getItem('supe_sidebar') === 'collapsed';
    } catch {
      return false;
    }
  });
  const [exploreExpanded, setExploreExpanded] = useState(true);
  const [actionLogOpen, setActionLogOpen] = useState(false);
  const [actionLogBadgeCount, setActionLogBadgeCount] = useState(0);

  const periodMeta = useMemo(() => {
    const now = new Date();
    const dayOfMonth = now.getDate();
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    return {
      periodLabel: now.toLocaleString('en-IN', { month: 'short', year: 'numeric' }),
      quarterLabel: getFiscalQuarterLabel(now),
      dayOfMonth,
      daysInMonth,
      progressPct: Math.max(0, Math.min(100, Math.round((dayOfMonth * 100) / Math.max(daysInMonth, 1))))
    };
  }, []);

  const isBriefing = location.pathname === '/' || location.pathname === supeBriefingRoute || location.pathname === '/summary';
  const isExplore = location.pathname === supeExploreRoute;
  const isAsk = location.pathname === supeAskRoute;
  const isAct = location.pathname === supeActRoute || location.pathname === supeSchemesRoute;
  const currentEntity = searchParams.get('entity') || 'salesman';
  const sidebarWidth = collapsed ? COLLAPSED_SIDEBAR_WIDTH : DESKTOP_SIDEBAR_WIDTH;

  useEffect(() => {
    // Persist the desktop sidebar preference across reloads.
    try {
      window.localStorage.setItem('supe_sidebar', collapsed ? 'collapsed' : 'expanded');
    } catch {
      // ignore localStorage failures
    }
  }, [collapsed]);

  useEffect(() => {
    // The action-log badge is shared UI state, so the shell owns the polling and
    // the custom event listener used by feature views after mutations.
    let active = true;
    const loadActionLogCount = async () => {
      try {
        const response = await supeApi.getActionLog();
        if (!active) return;
        const data = response?.data?.data || {};
        setActionLogBadgeCount(Number(data.todayCount || 0) + Number(data.openTaskCount || 0));
      } catch {
        if (active) {
          setActionLogBadgeCount(0);
        }
      }
    };
    void loadActionLogCount();
    const handler = () => void loadActionLogCount();
    window.addEventListener('supe-actions-updated', handler);
    return () => {
      active = false;
      window.removeEventListener('supe-actions-updated', handler);
    };
  }, []);

  const shellStyle = {
    '--sidebar-width': `${sidebarWidth}px`
  } as CSSProperties;

  const sidebarBody = (
    <div className={styles.sidebarBody}>
      <Link
        to="/"
        className={styles.brandBlock}
        onClick={() => setDrawerOpen(false)}
        title={collapsed ? 'Supe.Market' : undefined}
        style={{ padding: collapsed ? '0 12px' : '0 16px', justifyContent: collapsed ? 'center' : 'flex-start' }}
      >
        <SupeLogoSmall size={collapsed ? 24 : 30} />
        {!collapsed ? (
          <div className={styles.brandName}>
            Supe<span className={styles.brandDot}>.</span>Market
          </div>
        ) : null}
      </Link>

      <div className={styles.periodCard} style={{ padding: collapsed ? '12px 8px' : '14px 16px 12px' }}>
        {collapsed ? (
          <div
            className={styles.periodCompact}
            title={`${periodMeta.periodLabel} · ${periodMeta.quarterLabel} · Day ${periodMeta.dayOfMonth}/${periodMeta.daysInMonth}`}
          >
            <div className={styles.periodCompactTrack}>
              <i style={{ width: `${periodMeta.progressPct}%` }} />
            </div>
            <div className={styles.periodCompactDay}>D{periodMeta.dayOfMonth}</div>
          </div>
        ) : (
          <>
            <div className={styles.periodRow}>
              <span>{periodMeta.periodLabel}</span>
              <span>{periodMeta.quarterLabel}</span>
            </div>
            <div className={styles.periodProgressRow}>
              <div className={styles.progressTrack}>
                <i style={{ width: `${periodMeta.progressPct}%` }} />
              </div>
              <div className={styles.periodCount}>
                {periodMeta.dayOfMonth}/{periodMeta.daysInMonth}
              </div>
            </div>
          </>
        )}
      </div>

      <nav className={styles.navWrap}>
        <NavLink
          to="/"
          onClick={() => setDrawerOpen(false)}
          title={collapsed ? 'Briefing' : undefined}
          style={{ padding: collapsed ? '9px 0' : '7px 12px', justifyContent: collapsed ? 'center' : 'flex-start' }}
          className={({ isActive }) =>
            isActive || isBriefing ? `${styles.primaryLink} ${styles.primaryLinkActive}` : styles.primaryLink
          }
        >
          <span className={styles.primaryLinkIcon}>
            <SunOutlined />
          </span>
          {!collapsed ? <span className={styles.primaryLinkText}>Briefing</span> : null}
        </NavLink>

        <div className={styles.navSection}>
          <button
            type="button"
            className={`${styles.primaryLink} ${isExplore ? styles.primaryLinkActive : ''}`}
            title={collapsed ? 'Explore' : undefined}
            style={{ padding: collapsed ? '9px 0' : '7px 12px', justifyContent: collapsed ? 'center' : 'flex-start' }}
            onClick={() => {
              if (isExplore) {
                setExploreExpanded((value) => !value);
              } else {
                setExploreExpanded(true);
                setDrawerOpen(false);
                navigate(`${supeExploreRoute}?entity=salesman`);
              }
            }}
          >
            <span className={styles.primaryLinkIcon}>
              <SearchOutlined />
            </span>
            {!collapsed ? <span className={styles.primaryLinkText}>Explore</span> : null}
            {!collapsed && isExplore ? <DownOutlined className={styles.primaryLinkChevron} /> : null}
          </button>

          {isExplore && exploreExpanded ? (
            <div className={styles.subnav}>
              {Object.values(supeExploreEntityMeta).map((entity) => (
                <NavLink
                  key={entity.key}
                  to={`${supeExploreRoute}?entity=${entity.key}`}
                  onClick={() => setDrawerOpen(false)}
                  title={collapsed ? entity.label : undefined}
                  style={{ padding: collapsed ? '7px 0' : '5px 12px 5px 32px', justifyContent: collapsed ? 'center' : 'flex-start' }}
                  className={currentEntity === entity.key ? `${styles.subnavLink} ${styles.subnavLinkActive}` : styles.subnavLink}
                >
                  <span className={styles.subnavIcon}>{entityIconMap[entity.key]}</span>
                  {!collapsed ? <span>{entity.label}</span> : null}
                </NavLink>
              ))}
            </div>
          ) : null}
        </div>

        <NavLink
          to={supeAskRoute}
          onClick={() => setDrawerOpen(false)}
          title={collapsed ? 'Ask' : undefined}
          style={{ padding: collapsed ? '9px 0' : '7px 12px', justifyContent: collapsed ? 'center' : 'flex-start' }}
          className={({ isActive }) =>
            isActive || isAsk ? `${styles.primaryLink} ${styles.primaryLinkActive}` : styles.primaryLink
          }
        >
          <span className={styles.primaryLinkIcon}>
            <MessageOutlined />
          </span>
          {!collapsed ? <span className={styles.primaryLinkText}>Ask</span> : null}
        </NavLink>

        <div className={styles.secondaryDivider} style={{ margin: collapsed ? '8px auto' : '8px 12px' }} />

        <NavLink
          to={supeTrajectoryRoute}
          onClick={() => setDrawerOpen(false)}
          title={collapsed ? 'Trajectory' : undefined}
          style={{ padding: collapsed ? '7px 0' : '6px 12px', justifyContent: collapsed ? 'center' : 'flex-start' }}
          className={({ isActive }) => (isActive ? `${styles.secondaryLink} ${styles.secondaryLinkActive}` : styles.secondaryLink)}
        >
          <span className={styles.secondaryIcon}>
            <RiseOutlined />
          </span>
          {!collapsed ? <span>Trajectory</span> : null}
        </NavLink>

        <NavLink
          to={supeCompareRoute}
          onClick={() => setDrawerOpen(false)}
          title={collapsed ? 'Compare' : undefined}
          style={{ padding: collapsed ? '7px 0' : '6px 12px', justifyContent: collapsed ? 'center' : 'flex-start' }}
          className={({ isActive }) => (isActive ? `${styles.secondaryLink} ${styles.secondaryLinkActive}` : styles.secondaryLink)}
        >
          <span className={styles.secondaryIcon}>
            <BarChartOutlined />
          </span>
          {!collapsed ? <span>Compare</span> : null}
        </NavLink>

        <NavLink
          to={supeTargetsRoute}
          onClick={() => setDrawerOpen(false)}
          title={collapsed ? 'Targets' : undefined}
          style={{ padding: collapsed ? '7px 0' : '6px 12px', justifyContent: collapsed ? 'center' : 'flex-start' }}
          className={({ isActive }) => (isActive ? `${styles.secondaryLink} ${styles.secondaryLinkActive}` : styles.secondaryLink)}
        >
          <span className={styles.secondaryIcon}>
            <FlagOutlined />
          </span>
          {!collapsed ? <span>Targets</span> : null}
        </NavLink>

        <NavLink
          to={supeActRoute}
          onClick={() => setDrawerOpen(false)}
          title={collapsed ? 'Act' : undefined}
          style={{ padding: collapsed ? '7px 0' : '6px 12px', justifyContent: collapsed ? 'center' : 'flex-start' }}
          className={({ isActive }) => (isActive || isAct ? `${styles.secondaryLink} ${styles.secondaryLinkActive}` : styles.secondaryLink)}
        >
          <span className={styles.secondaryIcon}>
            <ThunderboltOutlined />
          </span>
          {!collapsed ? <span>Act</span> : null}
        </NavLink>

        <NavLink
          to={supeImportsRoute}
          onClick={() => setDrawerOpen(false)}
          title={collapsed ? 'Imports' : undefined}
          style={{ padding: collapsed ? '7px 0' : '6px 12px', justifyContent: collapsed ? 'center' : 'flex-start' }}
          className={({ isActive }) => (isActive ? `${styles.secondaryLink} ${styles.secondaryLinkActive}` : styles.secondaryLink)}
        >
          <span className={styles.secondaryIcon}>
            <FileTextOutlined />
          </span>
          {!collapsed ? <span>Imports</span> : null}
        </NavLink>
      </nav>

      <div className={styles.sidebarFooter}>
        <button
          type="button"
          className={styles.utilityButton}
          onClick={() => setActionLogOpen(true)}
          title={collapsed ? 'Action Log' : undefined}
          style={{ padding: collapsed ? '7px 0' : '6px 12px', justifyContent: collapsed ? 'center' : 'flex-start' }}
        >
          <span className={styles.utilityIcon}>
            <FileTextOutlined />
          </span>
          {!collapsed ? <span>Action Log</span> : null}
          {actionLogBadgeCount > 0 ? (
            <span
              className={styles.utilityBadge}
              style={collapsed ? { position: 'absolute', top: 2, right: 2, marginLeft: 0 } : undefined}
            >
              {actionLogBadgeCount}
            </span>
          ) : null}
        </button>

        <div className={styles.userRow} style={{ padding: collapsed ? '6px 0' : '6px 12px', justifyContent: collapsed ? 'center' : 'flex-start' }}>
          <div className={styles.userAvatar}>SM</div>
          {!collapsed ? (
            <div>
              <div className={styles.userName}>Leadership User</div>
              <div className={styles.userMeta}>NSM · National</div>
            </div>
          ) : null}
        </div>

        <button
          type="button"
          className={styles.footerActionButton}
          onClick={() => void logout()}
          title={collapsed ? 'Sign out' : undefined}
          style={{ padding: collapsed ? '7px 0' : '6px 12px', justifyContent: collapsed ? 'center' : 'flex-start' }}
        >
          <span className={styles.utilityIcon}>
            <LogoutOutlined />
          </span>
          {!collapsed ? <span>Sign out</span> : null}
        </button>

        <button
          type="button"
          className={styles.footerActionButton}
          onClick={() => setCollapsed((value) => !value)}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          style={{ padding: collapsed ? '7px 0' : '6px 12px', justifyContent: collapsed ? 'center' : 'flex-start' }}
        >
          <span className={styles.utilityIcon}>
            {collapsed ? <RightOutlined /> : <LeftOutlined />}
          </span>
          {!collapsed ? <span>Collapse</span> : null}
        </button>
      </div>
    </div>
  );

  return (
    <div className={`${styles.shell} ${collapsed ? styles.shellCollapsed : ''}`} style={shellStyle}>
      <aside className={`${styles.sidebar} ${collapsed ? styles.sidebarCollapsed : ''}`}>{sidebarBody}</aside>

      <Drawer
        placement="left"
        closable={false}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        width={DESKTOP_SIDEBAR_WIDTH}
        bodyStyle={{ padding: 0 }}
      >
        {sidebarBody}
      </Drawer>

      <div className={styles.contentPane}>
        <div className={styles.mobileTopbar}>
          <Button
            type="text"
            icon={<MenuOutlined />}
            className={styles.mobileMenuButton}
            onClick={() => setDrawerOpen(true)}
          />
          <div className={styles.mobileBrand}>
            <SupeLogoSmall size={26} />
            <div className={styles.mobileTitle}>
              Supe<span className={styles.brandDot}>.</span>Market
            </div>
          </div>
        </div>

        <main className={styles.pageBody}>
          <Outlet />
        </main>

        {!isAsk ? (
          <div className={styles.promptDock}>
            <PromptCommandBar onSubmit={(question) => navigate(`${supeAskRoute}?q=${encodeURIComponent(question)}`)} />
          </div>
        ) : null}
      </div>

      <ActionLogPanel open={actionLogOpen} onClose={() => setActionLogOpen(false)} />
    </div>
  );
}
