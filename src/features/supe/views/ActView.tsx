import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Card, Empty, Input, Select, Spin, Tag, message } from 'antd';
import { useSearchParams } from 'react-router-dom';
import supeApi from '../api';
import styles from '../index.module.scss';
import ActionDrawer from '../components/ActionDrawer';

const STATUS_OPTIONS = [
  { label: 'All', value: 'all' },
  { label: 'Draft', value: 'draft' },
  { label: 'Active', value: 'active' },
  { label: 'Completed', value: 'completed' },
  { label: 'Cancelled', value: 'cancelled' }
];

const TEMPLATE_META: Record<string, { type: 'scheme' | 'nudge' | 'goal_push' | 'collection' | 'announcement'; title: string }> = {
  scheme: { type: 'scheme', title: 'New trade scheme' },
  collection: { type: 'collection', title: 'Collection recovery push' },
  goal: { type: 'goal_push', title: 'Goal push for underperformers' },
  nudge: { type: 'nudge', title: 'Team nudge' }
};

export function ActView() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [dashboard, setDashboard] = useState<any>(null);
  const [actions, setActions] = useState<any[]>([]);
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [selectedAction, setSelectedAction] = useState<any | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [dashboardResponse, actionsResponse] = await Promise.all([
        supeApi.getActionsDashboard(),
        supeApi.listActions(selectedStatus === 'all' ? {} : { status: selectedStatus })
      ]);
      setDashboard(dashboardResponse?.data?.data || null);
      setActions(actionsResponse?.data?.data?.items || []);
    } catch (error: any) {
      message.error(error?.response?.data?.message || 'Failed to load actions');
    } finally {
      setLoading(false);
    }
  }, [selectedStatus]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const handler = () => void load();
    window.addEventListener('supe-actions-updated', handler);
    return () => window.removeEventListener('supe-actions-updated', handler);
  }, [load]);

  useEffect(() => {
    const template = searchParams.get('template');
    if (!template) return;
    setDrawerOpen(true);
  }, [searchParams]);

  const drawerContext = useMemo(() => {
    const template = searchParams.get('template');
    if (!template || !TEMPLATE_META[template]) return null;
    const meta = TEMPLATE_META[template];
    return {
      sourceKind: 'manual' as const,
      actionType: meta.type,
      title: meta.title,
      note: `Pre-filled from template: ${template}`
    };
  }, [searchParams]);

  const openAction = async (id: number) => {
    try {
      setDetailLoading(true);
      const response = await supeApi.getAction(id);
      setSelectedAction(response?.data?.data || null);
    } catch (error: any) {
      message.error(error?.response?.data?.message || 'Failed to load action');
    } finally {
      setDetailLoading(false);
    }
  };

  const updateStatus = async (status: string) => {
    if (!selectedAction) return;
    try {
      setSaving(true);
      await supeApi.updateAction(selectedAction.id, { status });
      window.dispatchEvent(new CustomEvent('supe-actions-updated'));
      await openAction(selectedAction.id);
      await load();
    } catch (error: any) {
      message.error(error?.response?.data?.message || 'Failed to update action');
    } finally {
      setSaving(false);
    }
  };

  const addNote = async () => {
    if (!selectedAction || !note.trim()) return;
    try {
      setSaving(true);
      await supeApi.appendActionEvent(selectedAction.id, {
        eventType: 'note',
        label: 'Added note',
        detail: note.trim(),
        payload: {}
      });
      setNote('');
      window.dispatchEvent(new CustomEvent('supe-actions-updated'));
      await openAction(selectedAction.id);
    } catch (error: any) {
      message.error(error?.response?.data?.message || 'Failed to add note');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={styles.observeActPage}>
      <div className={styles.observeActHeader}>
        <div>
          <div className={styles.observeActTitle}>Act</div>
          <div className={styles.observeActMeta}>Signal → Action → Follow-up</div>
        </div>
        <div className={styles.observeActHeaderActions}>
          <Select value={selectedStatus} onChange={setSelectedStatus} options={STATUS_OPTIONS} className={styles.observeActStatusSelect} />
          <Button type="primary" onClick={() => setDrawerOpen(true)}>
            Create Action
          </Button>
        </div>
      </div>

      <div className={styles.observeActStatsGrid}>
        <Card bordered={false} className={styles.observeActStatCard}>
          <span>Running</span>
          <strong>{dashboard?.runningCount || 0}</strong>
        </Card>
        <Card bordered={false} className={styles.observeActStatCard}>
          <span>Drafts</span>
          <strong>{dashboard?.draftCount || 0}</strong>
        </Card>
        <Card bordered={false} className={styles.observeActStatCard}>
          <span>Total</span>
          <strong>{dashboard?.totalCount || 0}</strong>
        </Card>
      </div>

      <div className={styles.observeActShell}>
        <Card bordered={false} className={styles.observeActListCard}>
          {loading ? (
            <Spin />
          ) : actions.length === 0 ? (
            <Empty description="No actions yet" />
          ) : (
            actions.map((action) => (
              <button
                type="button"
                key={action.id}
                className={`${styles.observeActRow} ${selectedAction?.id === action.id ? styles.observeActRowActive : ''}`}
                onClick={() => void openAction(action.id)}
              >
                <div className={styles.observeActRowTitle}>{action.title}</div>
                <div className={styles.observeActRowMeta}>
                  <Tag>{action.typeLabel}</Tag>
                  <Tag color={action.status === 'active' ? 'blue' : action.status === 'completed' ? 'green' : 'default'}>
                    {action.status}
                  </Tag>
                  <span>{action.deliverySummaryLabel}</span>
                </div>
              </button>
            ))
          )}
        </Card>

        <Card bordered={false} className={styles.observeActDetailCard}>
          {detailLoading ? (
            <Spin />
          ) : !selectedAction ? (
            <Empty description="Select an action" />
          ) : (
            <>
              <div className={styles.observeActDetailHeader}>
                <div>
                  <div className={styles.observeActDetailTitle}>{selectedAction.title}</div>
                  <div className={styles.observeActDetailMeta}>
                    <Tag>{selectedAction.typeLabel}</Tag>
                    <Tag>{selectedAction.status}</Tag>
                  </div>
                </div>
                <div className={styles.observeActDetailButtons}>
                  <Button loading={saving} onClick={() => void updateStatus('active')}>Activate</Button>
                  <Button loading={saving} onClick={() => void updateStatus('completed')}>Complete</Button>
                  <Button danger loading={saving} onClick={() => void updateStatus('cancelled')}>Cancel</Button>
                </div>
              </div>

              <div className={styles.observeActDetailBlock}>
                <h4>Targets</h4>
                <div className={styles.observeActionDrawerTargets}>
                  {(selectedAction.targets || []).map((target: any) => (
                    <span key={`${target.entityType}:${target.entityId}`} className={styles.observeActionDrawerTarget}>
                      {target.entityName || target.entityId}
                    </span>
                  ))}
                </div>
              </div>

              <div className={styles.observeActDetailBlock}>
                <h4>Events</h4>
                <div className={styles.observeActEvents}>
                  {(selectedAction.events || []).map((event: any) => (
                    <div key={event.id} className={styles.observeActEventRow}>
                      <strong>{event.label}</strong>
                      {event.detail ? <span>{event.detail}</span> : null}
                    </div>
                  ))}
                </div>
              </div>

              <div className={styles.observeActDetailBlock}>
                <h4>Add Note</h4>
                <Input.TextArea rows={3} value={note} onChange={(event) => setNote(event.target.value)} />
                <div className={styles.observeActDetailButtons}>
                  <Button type="primary" loading={saving} onClick={() => void addNote()}>
                    Save Note
                  </Button>
                </div>
              </div>
            </>
          )}
        </Card>
      </div>

      <ActionDrawer
        open={drawerOpen}
        onClose={() => {
          setDrawerOpen(false);
          setSearchParams({}, { replace: true });
        }}
        context={drawerContext}
        onCreated={() => {
          void load();
          setDrawerOpen(false);
          setSearchParams({}, { replace: true });
        }}
      />
    </div>
  );
}

export default ActView;
