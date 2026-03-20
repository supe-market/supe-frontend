import { useMemo, useState } from 'react';
import { Button, Drawer } from 'antd';
import { MenuOutlined, LogoutOutlined } from '@ant-design/icons';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { supeSidebarMenu, supeViewTitleMap } from './constants';
import styles from './SupeLayout.module.css';

function SupeNav({ onNavigate }: { onNavigate?: () => void }) {
  const location = useLocation();

  return (
    <div className={styles.navWrap}>
      <div className={styles.brand}>
        <span>Supe</span>
        <strong>Market</strong>
      </div>
      {supeSidebarMenu.map((item) => {
        if ('componentList' in item && item.componentList) {
          return (
            <div key={item.sectionName} className={styles.group}>
              <div className={styles.groupTitle}>{item.sectionName}</div>
              <div className={styles.links}>
                {item.componentList.map((child) => (
                  <NavLink
                    key={child.key}
                    to={child.key}
                    onClick={onNavigate}
                    className={({ isActive }) =>
                      isActive || location.pathname === child.key
                        ? `${styles.link} ${styles.linkActive}`
                        : styles.link
                    }
                  >
                    {child.label}
                  </NavLink>
                ))}
              </div>
            </div>
          );
        }

        return (
          <NavLink
            key={item.key}
            to={item.key}
            onClick={onNavigate}
            className={({ isActive }) => (isActive ? `${styles.link} ${styles.linkActive}` : styles.link)}
          >
            {item.label}
          </NavLink>
        );
      })}
    </div>
  );
}

export function SupeLayout() {
  const location = useLocation();
  const { logout } = useAuth();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const pageMeta = useMemo(
    () => supeViewTitleMap[location.pathname] || supeViewTitleMap['/summary'],
    [location.pathname]
  );

  return (
    <div className={styles.shell}>
      <aside className={styles.sidebar}>
        <SupeNav />
      </aside>

      <Drawer
        placement="left"
        closable={false}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        width={280}
        bodyStyle={{ padding: 0 }}
      >
        <SupeNav onNavigate={() => setDrawerOpen(false)} />
      </Drawer>

      <div className={styles.contentWrap}>
        <header className={styles.topbar}>
          <div className={styles.topbarLeft}>
            <Button
              type="text"
              icon={<MenuOutlined />}
              className={styles.mobileMenuButton}
              onClick={() => setDrawerOpen(true)}
            />
            <div>
              <p className={styles.pageEyebrow}>Standalone analytics workspace</p>
              <h1>{pageMeta.title}</h1>
              <p className={styles.pageSubtitle}>{pageMeta.subtitle}</p>
            </div>
          </div>
          <Button type="default" icon={<LogoutOutlined />} onClick={() => void logout()}>
            Logout
          </Button>
        </header>

        <main className={styles.main}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
