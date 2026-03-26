import { useCallback, useEffect, useState } from 'react';
import { Spin, message } from 'antd';
import {
  CheckOutlined,
  CloseOutlined,
  DeleteOutlined,
  FileTextOutlined,
  FormOutlined,
  MessageOutlined,
  UnorderedListOutlined
} from '@ant-design/icons';
import supeApi from '../api';
import styles from '../SupeLayout.module.css';

interface ActionLogPanelProps {
  open: boolean;
  onClose: () => void;
}

type TabKey = 'activity' | 'tasks';

function ActionIcon({ type }: { type?: string }) {
  const normalized = String(type || '').toLowerCase();
  if (normalized.includes('note')) return <FormOutlined />;
  if (normalized.includes('ask')) return <MessageOutlined />;
  return <UnorderedListOutlined />;
}

export function ActionLogPanel({ open, onClose }: ActionLogPanelProps) {
  const [activeTab, setActiveTab] = useState<TabKey>('activity');
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<any | null>(null);
  const [taskLoadingId, setTaskLoadingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const response = await supeApi.getActionLog();
      setData(response?.data?.data || null);
    } catch (error: any) {
      message.error(error?.response?.data?.message || 'Failed to load action log');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    void load();
  }, [open, load]);

  useEffect(() => {
    const handler = () => {
      if (open) void load();
    };
    window.addEventListener('supe-actions-updated', handler);
    return () => window.removeEventListener('supe-actions-updated', handler);
  }, [open, load]);

  const updateTask = async (taskId: number, payload: Record<string, any>) => {
    try {
      setTaskLoadingId(String(taskId));
      await supeApi.updateTask(taskId, payload);
      window.dispatchEvent(new CustomEvent('supe-actions-updated'));
      await load();
    } catch (error: any) {
      message.error(error?.response?.data?.message || 'Failed to update task');
    } finally {
      setTaskLoadingId(null);
    }
  };

  const deleteTask = async (taskId: number) => {
    try {
      setTaskLoadingId(String(taskId));
      await supeApi.deleteTask(taskId);
      window.dispatchEvent(new CustomEvent('supe-actions-updated'));
      await load();
    } catch (error: any) {
      message.error(error?.response?.data?.message || 'Failed to delete task');
    } finally {
      setTaskLoadingId(null);
    }
  };

  if (!open) return null;

  const today = data?.today || [];
  const earlier = data?.earlier || [];
  const openTasks = data?.tasks?.open || [];
  const doneTasks = data?.tasks?.done || [];

  return (
    <>
      <div className={styles.actionLogBackdrop} onClick={onClose} />
      <div className={styles.actionLogPanel}>
        <div className={styles.actionLogHeader}>
          <div className={styles.actionLogHeaderMain}>
            <div className={styles.actionLogHeaderBadge}>
              <FileTextOutlined />
            </div>
            <div className={styles.actionLogTitleWrap}>
              <div className={styles.actionLogTitle}>Action Log</div>
            </div>
          </div>
          <button type="button" className={styles.actionLogClose} onClick={onClose}>
            <CloseOutlined />
          </button>
        </div>

        <div className={styles.actionLogStats}>
          <span className={styles.actionLogStatItem}>
            <i className={`${styles.actionLogStatDot} ${styles.actionLogStatDotGreen}`} />
            {data?.todayCount || 0} actions today
          </span>
          <span className={styles.actionLogStatItem}>
            <i className={`${styles.actionLogStatDot} ${styles.actionLogStatDotBlue}`} />
            {data?.openTaskCount || 0} open tasks
          </span>
        </div>

        <div className={styles.actionLogTabs}>
          <button
            type="button"
            className={`${styles.actionLogTab} ${activeTab === 'activity' ? styles.actionLogTabActive : ''}`}
            onClick={() => setActiveTab('activity')}
          >
            Activity
            {today.length > 0 ? <span className={styles.actionLogTabCount}>{today.length}</span> : null}
          </button>
          <button
            type="button"
            className={`${styles.actionLogTab} ${activeTab === 'tasks' ? styles.actionLogTabActive : ''}`}
            onClick={() => setActiveTab('tasks')}
          >
            Tasks
            {openTasks.length > 0 ? <span className={styles.actionLogTabCount}>{openTasks.length}</span> : null}
          </button>
        </div>

        <div className={styles.actionLogBody}>
          {loading ? (
            <div className={styles.actionLogLoading}>
              <Spin />
            </div>
          ) : activeTab === 'activity' ? (
            today.length === 0 && earlier.length === 0 ? (
              <div className={styles.actionLogEmpty}>
                <div className={styles.actionLogEmptyIcon}>
                  <FileTextOutlined />
                </div>
                <div className={styles.actionLogEmptyTitle}>No actions yet</div>
                <div className={styles.actionLogEmptyText}>Actions taken from Briefing, Explore, or Ask will appear here.</div>
              </div>
            ) : (
              <>
                {today.length > 0 ? (
                  <div className={styles.actionLogSection}>
                    <div className={styles.actionLogSectionLabel}>Today</div>
                    {today.map((entry: any) => (
                      <div key={entry.id} className={styles.actionLogRow}>
                        <span className={styles.actionLogIcon}><ActionIcon type={entry.type} /></span>
                        <div className={styles.actionLogRowText}>
                          <strong>{entry.label}</strong>
                          {entry.detail ? <span>{entry.detail}</span> : null}
                        </div>
                        <span className={styles.actionLogRowTime}>
                          {new Date(entry.timestamp).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : null}
                {earlier.length > 0 ? (
                  <div className={styles.actionLogSection}>
                    <div className={styles.actionLogSectionLabel}>Earlier</div>
                    {earlier.map((entry: any) => (
                      <div key={entry.id} className={styles.actionLogRow}>
                        <span className={styles.actionLogIcon}><ActionIcon type={entry.type} /></span>
                        <div className={styles.actionLogRowText}>
                          <strong>{entry.label}</strong>
                          {entry.detail ? <span>{entry.detail}</span> : null}
                        </div>
                        <span className={styles.actionLogRowTime}>
                          {new Date(entry.timestamp).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : null}
              </>
            )
          ) : openTasks.length === 0 && doneTasks.length === 0 ? (
            <div className={styles.actionLogEmpty}>
              <div className={styles.actionLogEmptyIcon}>
                <FileTextOutlined />
              </div>
              <div className={styles.actionLogEmptyTitle}>No tasks yet</div>
              <div className={styles.actionLogEmptyText}>Assign tasks from the Action Drawer to track them here.</div>
            </div>
          ) : (
            <>
              {openTasks.length > 0 ? (
                <div className={styles.actionLogSection}>
                  <div className={styles.actionLogSectionLabel}>Open ({openTasks.length})</div>
                  {openTasks.map((task: any) => (
                    <div key={task.id} className={styles.actionTaskRow}>
                      <div className={styles.actionTaskText}>
                        <strong>{task.assignee}</strong>
                        <span>{task.instruction}</span>
                        {task.deadline ? <small>Due {task.deadline}</small> : null}
                      </div>
                      <div className={styles.actionTaskActions}>
                        <button
                          type="button"
                          className={styles.actionTaskButton}
                          disabled={taskLoadingId === String(task.id)}
                          onClick={() => void updateTask(task.id, { status: 'done' })}
                        >
                          <CheckOutlined />
                        </button>
                        <button
                          type="button"
                          className={styles.actionTaskButton}
                          disabled={taskLoadingId === String(task.id)}
                          onClick={() => void deleteTask(task.id)}
                        >
                          <DeleteOutlined />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
              {doneTasks.length > 0 ? (
                <div className={styles.actionLogSection}>
                  <div className={styles.actionLogSectionLabel}>Done ({doneTasks.length})</div>
                  {doneTasks.map((task: any) => (
                    <div key={task.id} className={`${styles.actionTaskRow} ${styles.actionTaskRowDone}`}>
                      <div className={styles.actionTaskText}>
                        <strong>{task.assignee}</strong>
                        <span>{task.instruction}</span>
                      </div>
                      <button
                        type="button"
                        className={styles.actionTaskTextButton}
                        disabled={taskLoadingId === String(task.id)}
                        onClick={() => void updateTask(task.id, { status: 'open' })}
                      >
                        Re-open
                      </button>
                    </div>
                  ))}
                </div>
              ) : null}
            </>
          )}
        </div>
      </div>
    </>
  );
}

export default ActionLogPanel;
