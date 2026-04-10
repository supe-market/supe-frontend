import { useEffect, useMemo, useState } from 'react';
import { Button, Card, Col, Input, InputNumber, Modal, Progress, Row, Select, Spin, Tag, notification } from 'antd';
import { AimOutlined, ArrowLeftOutlined, CalendarOutlined, DeleteOutlined, GlobalOutlined, PlusOutlined } from '@ant-design/icons';
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceDot,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';
import dayjs from 'dayjs';
import supeApi from '../api';
import { formatCurrency, formatNumber, getPaceStatus } from '../utils';
import styles from '../index.module.scss';

type GoalRecord = Record<string, any>;

const METRIC_OPTIONS = [
  { label: 'Revenue', value: 'revenue' },
  { label: 'Collection', value: 'collection' },
  { label: 'Orders', value: 'orders' },
  { label: 'Coverage', value: 'coverage' },
  { label: 'Beat Adherence', value: 'beat_adherence' },
  { label: 'Outstanding Reduction', value: 'outstanding_reduction' }
];

const GEO_OPTIONS = [
  { label: 'All India', value: 'all_india' },
  { label: 'Zone: North', value: 'zone:North' },
  { label: 'Zone: South', value: 'zone:South' },
  { label: 'Zone: West', value: 'zone:West' },
  { label: 'Zone: East', value: 'zone:East' }
];

const ASSIGNMENT_ENTITY_TYPE_OPTIONS = [
  { label: 'Salesmen', value: 'salesman' },
  { label: 'Retailers', value: 'retailer' },
  { label: 'Beats', value: 'beat' },
  { label: 'SKUs', value: 'sku' },
  { label: 'Distributors', value: 'distributor' }
];

const ALLOWED_ASSIGNMENT_ENTITY_TYPES_BY_METRIC: Record<string, string[]> = {
  revenue: ['salesman', 'retailer', 'beat', 'sku', 'distributor'],
  collection: ['salesman'],
  orders: ['salesman', 'retailer', 'distributor'],
  coverage: ['salesman', 'beat'],
  beat_adherence: ['salesman'],
  outstanding_reduction: ['salesman', 'retailer', 'beat', 'distributor']
};

const isPercentMetric = (metricKey: string) => ['coverage', 'coverage_pct', 'beat_adherence', 'penetration', 'growth'].includes(metricKey);
const isLowerIsBetterMetric = (metricKey: string) => metricKey === 'outstanding_reduction';

function formatMetricValue(metricKey: string, value: number) {
  if (metricKey === 'orders') {
    return formatNumber(value);
  }
  if (isPercentMetric(metricKey)) {
    return `${formatNumber(value, 1)}%`;
  }
  return formatCurrency(value);
}

function enrichGoal(goal: GoalRecord) {
  const baseline = Number(goal.baseline || 0);
  const current = Number(goal.current || 0);
  const target = Number(goal.target || 0);
  const progressPercent = Number(goal.progressPercent || 0);

  const startDate = dayjs(goal.startDate);
  const endDate = dayjs(goal.endDate);
  const now = dayjs();
  const totalDays = Math.max(1, endDate.diff(startDate, 'day'));
  const elapsedDays = Math.max(0, Math.min(totalDays, now.diff(startDate, 'day')));
  const elapsedPct = Number(((elapsedDays * 100) / totalDays).toFixed(2));
  const paceRatio = elapsedPct > 0 ? progressPercent / elapsedPct : 0;
  const pace = getPaceStatus(paceRatio);
  const remainingDays = Math.max(0, totalDays - elapsedDays);
  const achievedDelta = current - baseline;
  const totalDelta = target - baseline;
  const remainingDelta = target - current;
  const actualDailyRate = elapsedDays > 0 ? achievedDelta / elapsedDays : 0;
  const requiredDailyRate = totalDelta / totalDays;
  const requiredPace = remainingDays > 0 ? remainingDelta / remainingDays : 0;
  const projectedEnd = current + actualDailyRate * remainingDays;

  const diagnostics = [
    {
      label: 'Delta achieved',
      value: formatMetricValue(goal.metricKey, achievedDelta),
      meta: `${formatNumber(totalDelta === 0 ? 0 : (achievedDelta * 100) / totalDelta, 1)}% of plan`
    },
    {
      label: 'Remaining delta',
      value: formatMetricValue(goal.metricKey, remainingDelta),
      meta: `${remainingDays} days left`
    },
    {
      label: 'Projected finish',
      value: formatMetricValue(goal.metricKey, projectedEnd),
      meta: projectedEnd >= target && !isLowerIsBetterMetric(goal.metricKey) ? 'At current pace you clear the goal' : 'Current pace needs correction'
    },
    {
      label: 'Scope',
      value: String(goal.geoKey || 'all_india'),
      meta: String(goal.assignmentEntityType || 'salesman')
    }
  ];

  return {
    ...goal,
    baseline,
    current,
    target,
    progressPercent,
    elapsedPct,
    paceRatio,
    paceLabel: pace.label,
    paceColor: pace.color,
    remainingDays,
    achievedDelta,
    totalDelta,
    remainingDelta,
    actualDailyRate,
    requiredDailyRate,
    requiredPace,
    projectedEnd,
    snapshots: [],
    milestones: [],
    contributors: [],
    diagnostics
  };
}

function mapTrajectoryDetail(detail: GoalRecord, fallback: GoalRecord | null) {
  const assignment = detail.assignment || {};
  const progress = detail.progress || {};
  const metricKey = assignment.metricKey || fallback?.metricKey || 'revenue';
  const pace = getPaceStatus(Number(progress.paceRatio || 0));
  const geoKey = `${assignment.scopeLevel || fallback?.geoKey?.split(':')[0] || 'national'}:${assignment.scopeValue || fallback?.geoKey?.split(':')[1] || 'all_india'}`;

  return {
    ...(fallback || {}),
    id: String(assignment.id || fallback?.id || ''),
    name: assignment.name || fallback?.name || `${metricKey} goal`,
    metricKey,
    geoKey,
    assignmentEntityType: assignment.assignmentEntityType || fallback?.assignmentEntityType || 'salesman',
    baseline: Number(progress.baseline || 0),
    current: Number(progress.current || 0),
    target: Number(progress.target || 0),
    progressPercent: Number(progress.progressPercent || 0),
    elapsedPct: Number(progress.elapsedPct || 0),
    paceRatio: Number(progress.paceRatio || 0),
    paceLabel: pace.label,
    paceColor: pace.color,
    remainingDays: Number(progress.remainingDays || 0),
    actualDailyRate: Number(progress.actualDailyRate || 0),
    requiredDailyRate: Number(progress.requiredDailyRate || 0),
    requiredPace: Number(progress.requiredDailyRateFromNow || 0),
    projectedEnd: Number(progress.projectedEnd || 0),
    startDate: assignment.startDate || fallback?.startDate,
    endDate: assignment.endDate || fallback?.endDate,
    snapshots: (detail.series || detail.snapshots || []).map((snapshot: any, index: number) => ({
      key: `${assignment.id || fallback?.id || 'goal'}-${snapshot.snapshotDate || snapshot.date || index}`,
      label: snapshot.label || dayjs(snapshot.date || snapshot.snapshotDate).format('D MMM'),
      snapshotDate: snapshot.snapshotDate || snapshot.date,
      requiredValue: Number(snapshot.requiredValue || 0),
      actualValue: Number(snapshot.actualValue || 0),
      progressPercent: Number(snapshot.progressPercent || 0),
      statusLabel: snapshot.statusLabel || null
    })),
    milestones: (detail.milestones || []).map((milestone: any) => ({
      ...milestone,
      targetDate: milestone.targetDate ? dayjs(milestone.targetDate).format('D MMM YYYY') : '-',
      value: Number(milestone.value || 0)
    })),
    contributors: detail.contributors || [],
    diagnostics: [
      {
        label: 'Required from now',
        value: formatMetricValue(metricKey, Number(progress.requiredDailyRateFromNow || 0)),
        meta: '/day to finish on time'
      },
      {
        label: 'Actual pace',
        value: formatMetricValue(metricKey, Number(progress.actualDailyRate || 0)),
        meta: '/day from persisted snapshots'
      },
      {
        label: 'Variance',
        value: formatMetricValue(metricKey, Number(progress.varianceValue || 0)),
        meta: `${formatNumber(Number(progress.variancePct || 0), 1)}% vs target`
      },
      {
        label: 'Latest snapshot',
        value: detail.latestSnapshotDate ? dayjs(detail.latestSnapshotDate).format('D MMM YYYY') : '-',
        meta: detail.granularity || 'day'
      }
    ]
  };
}

export function TrajectoryView() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [goals, setGoals] = useState<GoalRecord[]>([]);
  const [selectedGoalId, setSelectedGoalId] = useState('');
  const [selectedGoalDetail, setSelectedGoalDetail] = useState<GoalRecord | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [formState, setFormState] = useState({
    name: '',
    metricKey: 'revenue',
    assignmentEntityType: 'salesman',
    geoKey: 'all_india',
    baseline: 0,
    target: undefined as number | undefined,
    startDate: dayjs().startOf('month').format('YYYY-MM-DD'),
    endDate: dayjs().endOf('month').format('YYYY-MM-DD')
  });

  const loadGoals = async (nextSelectedGoalId?: string) => {
    try {
      setLoading(true);
      setError('');
      const response = await supeApi.listGoals();
      const nextGoals = (response?.data?.data?.goals || []).map(enrichGoal);
      setGoals(nextGoals);
      if (nextSelectedGoalId) {
        setSelectedGoalId(nextSelectedGoalId);
        return;
      }
      if (selectedGoalId && !nextGoals.some((goal: GoalRecord) => goal.id === selectedGoalId)) {
        setSelectedGoalId('');
      }
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to load goals');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadGoals();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!selectedGoalId) {
      setSelectedGoalDetail(null);
      setDetailError('');
      return;
    }

    let mounted = true;
    const loadGoalTrajectory = async () => {
      try {
        setDetailLoading(true);
        setDetailError('');
        const fallback = goals.find((goal) => String(goal.id) === String(selectedGoalId)) || null;
        const response = await supeApi.getGoalTrajectory(selectedGoalId, { granularity: 'day' });
        if (mounted) {
          setSelectedGoalDetail(mapTrajectoryDetail(response?.data?.data || {}, fallback));
        }
      } catch (err: any) {
        if (mounted) {
          setDetailError(err?.response?.data?.message || 'Failed to load goal trajectory');
        }
      } finally {
        if (mounted) {
          setDetailLoading(false);
        }
      }
    };

    loadGoalTrajectory();
    return () => {
      mounted = false;
    };
  }, [goals, selectedGoalId]);

  useEffect(() => {
    const allowedTypes = ALLOWED_ASSIGNMENT_ENTITY_TYPES_BY_METRIC[formState.metricKey] || ['salesman'];
    if (!allowedTypes.includes(formState.assignmentEntityType)) {
      setFormState((prev) => ({
        ...prev,
        assignmentEntityType: allowedTypes[0] || 'salesman'
      }));
    }
  }, [formState.metricKey, formState.assignmentEntityType]);

  const selectedGoalBase = useMemo(
    () => goals.find((goal) => String(goal.id) === String(selectedGoalId)) || null,
    [goals, selectedGoalId]
  );
  const selectedGoal = selectedGoalId ? selectedGoalDetail || selectedGoalBase : null;

  const onTrackGoals = useMemo(
    () => goals.filter((goal) => ['Accelerating', 'On Track'].includes(goal.paceLabel)).length,
    [goals]
  );

  const laggingGoals = useMemo(() => goals.length - onTrackGoals, [goals, onTrackGoals]);

  const assignmentEntityTypeOptions = useMemo(() => {
    const allowedTypes = new Set(ALLOWED_ASSIGNMENT_ENTITY_TYPES_BY_METRIC[formState.metricKey] || ['salesman']);
    return ASSIGNMENT_ENTITY_TYPE_OPTIONS.filter((option) => allowedTypes.has(option.value));
  }, [formState.metricKey]);

  const createGoal = async () => {
    const baseline = Number(formState.baseline);
    const target = Number(formState.target);

    if (formState.target === undefined) {
      notification.error({ message: 'Target is required' });
      return;
    }
    if (isLowerIsBetterMetric(formState.metricKey) ? target >= baseline : target <= baseline) {
      notification.error({
        message: isLowerIsBetterMetric(formState.metricKey)
          ? 'Target must be lower than baseline for Outstanding Reduction'
          : 'Target must be greater than baseline'
      });
      return;
    }
    if (!dayjs(formState.endDate).isAfter(dayjs(formState.startDate))) {
      notification.error({ message: 'End date must be after start date' });
      return;
    }

    try {
      const payload = {
        name: formState.name.trim() || `${formState.metricKey} · ${formState.geoKey}`,
        metricKey: formState.metricKey,
        assignmentEntityType: formState.assignmentEntityType,
        geoKey: formState.geoKey,
        baseline,
        target,
        startDate: formState.startDate,
        endDate: formState.endDate
      };
      const response = await supeApi.createGoal(payload);
      const createdGoalId = response?.data?.data?.goal?.id;
      notification.success({ message: 'Goal created' });
      setShowCreate(false);
      setFormState((prev) => ({ ...prev, name: '', target: undefined, assignmentEntityType: 'salesman' }));
      await loadGoals(createdGoalId);
    } catch (err: any) {
      notification.error({ message: err?.response?.data?.message || 'Failed to create goal' });
    }
  };

  const archiveGoal = async (goalId: string) => {
    try {
      await supeApi.updateGoal(goalId, { status: 'archived' });
      notification.success({ message: 'Goal archived' });
      setSelectedGoalId('');
      await loadGoals();
    } catch (err: any) {
      notification.error({ message: err?.response?.data?.message || 'Failed to archive goal' });
    }
  };

  return (
    <div className={styles.trajPage}>
      {!selectedGoal ? (
        <>
          <div className={styles.trajAllGoalsHeader}>
            <div>
              <h2>Trajectory</h2>
              <p>
                {goals.length} goals · {onTrackGoals} on track · {laggingGoals} lagging
              </p>
            </div>
            <Button type="primary" className={styles.trajSetGoalButton} onClick={() => setShowCreate(true)}>
              <PlusOutlined /> Set Goal
            </Button>
          </div>

          {loading ? (
            <Card className={styles.trajGoalListCard} bordered={false}>
              <Spin />
            </Card>
          ) : error ? (
            <Card className={styles.trajGoalListCard} bordered={false}>
              {error}
            </Card>
          ) : (
            <Row gutter={[10, 10]}>
              {goals.map((goal) => (
                <Col xs={24} lg={12} key={goal.id}>
                  <Card className={styles.trajGoalListCard} bordered={false} onClick={() => setSelectedGoalId(goal.id)}>
                    <div className={styles.trajGoalListTop}>
                      <div>
                        <strong>{goal.name}</strong>
                        <span>
                          <GlobalOutlined /> {goal.geoKey} · <CalendarOutlined /> {dayjs(goal.startDate).format('D MMM')} to{' '}
                          {dayjs(goal.endDate).format('D MMM YYYY')}
                        </span>
                      </div>
                      <Tag className={styles.trajStatusTag} color={goal.paceLabel === 'Stalled' ? 'red' : undefined}>
                        {goal.paceLabel}
                      </Tag>
                    </div>
                    <div className={styles.trajGoalListProgress}>
                      <div>
                        <b>{formatMetricValue(goal.metricKey, goal.current)}</b>
                        <span> of {formatMetricValue(goal.metricKey, goal.target)}</span>
                      </div>
                      <em>{Math.min(100, Number(goal.progressPercent || 0)).toFixed(0)}%</em>
                    </div>
                    <Progress
                      percent={Math.min(100, Number(goal.progressPercent || 0))}
                      showInfo={false}
                      strokeColor={goal.paceColor}
                      trailColor="#edf1f8"
                    />
                  </Card>
                </Col>
              ))}
            </Row>
          )}
        </>
      ) : (
        <>
          <div className={styles.trajHeaderWrap}>
            <div className={styles.trajBackRow}>
              <button type="button" className={styles.trajBackButton} onClick={() => setSelectedGoalId('')}>
                <ArrowLeftOutlined />
                All Goals
              </button>
            </div>
            <div className={styles.trajTitleRow}>
              <div>
                <h2>{selectedGoal.name}</h2>
                <div className={styles.trajMetaRow}>
                  <span>
                    <GlobalOutlined /> {selectedGoal.geoKey}
                  </span>
                  <span>
                    <CalendarOutlined /> {dayjs(selectedGoal.startDate).format('D MMM')} to {dayjs(selectedGoal.endDate).format('D MMM YYYY')}
                  </span>
                </div>
              </div>
              <div className={styles.trajHeadActions}>
                <Tag className={styles.trajStatusTag} color={selectedGoal.paceLabel === 'Stalled' ? 'red' : undefined}>
                  {selectedGoal.paceLabel}
                </Tag>
                <Button danger type="text" onClick={() => archiveGoal(selectedGoal.id)} icon={<DeleteOutlined />}>
                  Archive
                </Button>
              </div>
            </div>
          </div>

          {detailLoading && !selectedGoalDetail ? (
            <Card className={styles.trajProgressCard} bordered={false}>
              <Spin />
            </Card>
          ) : null}
          {detailError ? (
            <Card className={styles.trajProgressCard} bordered={false}>
              {detailError}
            </Card>
          ) : null}

          <Card className={styles.trajProgressCard} bordered={false}>
            <div className={styles.trajProgressTop}>
              <div>
                <strong>{formatMetricValue(selectedGoal.metricKey, selectedGoal.current)}</strong>
                <span> of {formatMetricValue(selectedGoal.metricKey, selectedGoal.target)}</span>
              </div>
              <span>{formatNumber(selectedGoal.progressPercent, 1)}% complete</span>
            </div>

            <div className={styles.trajBarWrap}>
              <div className={styles.trajBarTrack}>
                <div
                  className={styles.trajBarMarker}
                  style={{ left: `${Math.min(100, Math.max(0, selectedGoal.elapsedPct))}%` }}
                />
                <div
                  className={styles.trajBarFill}
                  style={{ width: `${Math.min(100, Math.max(0, selectedGoal.progressPercent))}%`, background: selectedGoal.paceColor }}
                />
              </div>
              <div className={styles.trajBarLegendRow}>
                <span>{formatMetricValue(selectedGoal.metricKey, selectedGoal.baseline)}</span>
                <div>
                  <span>
                    <i /> Time {formatNumber(selectedGoal.elapsedPct, 0)}%
                  </span>
                  <span>
                    <i className={styles.trajLegendBlue} style={{ background: selectedGoal.paceColor }} /> Progress {formatNumber(selectedGoal.progressPercent, 0)}%
                  </span>
                </div>
                <span>{formatMetricValue(selectedGoal.metricKey, selectedGoal.target)}</span>
              </div>
            </div>

            <div className={styles.trajPaceGrid}>
              <div>
                <span>Required pace</span>
                <b>{formatMetricValue(selectedGoal.metricKey, selectedGoal.requiredPace)}</b>
                <em>/day</em>
              </div>
              <div>
                <span>Actual pace</span>
                <b className={selectedGoal.paceRatio >= 0.9 ? styles.trajGreenText : styles.trajOrangeText}>
                  {formatMetricValue(selectedGoal.metricKey, selectedGoal.actualDailyRate)}
                </b>
                <em>/day</em>
              </div>
              <div>
                <span>Days remaining</span>
                <b>{selectedGoal.remainingDays}</b>
                <em>of {Math.max(1, dayjs(selectedGoal.endDate).diff(dayjs(selectedGoal.startDate), 'day'))}</em>
              </div>
              <div>
                <span>Projected end</span>
                <b
                  className={
                    isLowerIsBetterMetric(selectedGoal.metricKey)
                      ? selectedGoal.projectedEnd <= selectedGoal.target ? styles.trajGreenText : styles.trajRedText
                      : selectedGoal.projectedEnd >= selectedGoal.target ? styles.trajGreenText : styles.trajRedText
                  }
                >
                  {formatMetricValue(selectedGoal.metricKey, selectedGoal.projectedEnd)}
                </b>
              </div>
              <div>
                <span>Baseline</span>
                <b>{formatMetricValue(selectedGoal.metricKey, selectedGoal.baseline)}</b>
              </div>
              <div>
                <span>Current</span>
                <b>{formatMetricValue(selectedGoal.metricKey, selectedGoal.current)}</b>
              </div>
              <div>
                <span>Target</span>
                <b>{formatMetricValue(selectedGoal.metricKey, selectedGoal.target)}</b>
              </div>
              <div>
                <span>Status</span>
                <b style={{ color: selectedGoal.paceColor }}>{selectedGoal.paceLabel}</b>
              </div>
            </div>
          </Card>

          <Row gutter={[10, 10]}>
            <Col xs={24} lg={16}>
              <Card className={styles.trajChartCard} bordered={false}>
                <h3>Trajectory</h3>
                <div className={styles.trajChartWrap}>
                  {selectedGoal.snapshots.length ? (
                    <ResponsiveContainer width="100%" height={280}>
                      <LineChart data={selectedGoal.snapshots}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#edf1f8" />
                        <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#98a2b3' }} />
                        <YAxis
                          tick={{ fontSize: 11, fill: '#98a2b3' }}
                          tickFormatter={(value) => formatMetricValue(selectedGoal.metricKey, Number(value))}
                          width={74}
                        />
                        <Tooltip
                          formatter={(value: any, name: string) => [formatMetricValue(selectedGoal.metricKey, Number(value)), name === 'requiredValue' ? 'Required' : 'Actual']}
                          labelFormatter={(label) => label}
                        />
                        <Line type="monotone" dataKey="requiredValue" stroke="#98a2b3" strokeDasharray="6 4" strokeWidth={2} dot={false} />
                        <Line type="monotone" dataKey="actualValue" stroke="#4463ea" strokeWidth={3} dot={{ r: 3 }} />
                        <ReferenceDot
                          x={selectedGoal.snapshots[selectedGoal.snapshots.length - 1]?.label}
                          y={selectedGoal.target}
                          r={5}
                          fill="#10b981"
                          stroke="none"
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className={styles.trajEmptyState}>No persisted trajectory snapshots yet.</div>
                  )}
                </div>
              </Card>
            </Col>
            <Col xs={24} lg={8}>
              <Card className={styles.trajBottomCard} bordered={false}>
                <h4>Milestones</h4>
                {selectedGoal.milestones.map((milestone: any) => (
                  <div key={milestone.label} className={styles.trajMilestoneRow}>
                    <div>
                      <i className={milestone.achieved ? styles.trajMilestoneDone : undefined} />
                      <span>
                        <b>{milestone.label}</b>
                        <em>{milestone.targetDate}</em>
                      </span>
                    </div>
                    <strong>{formatMetricValue(selectedGoal.metricKey, milestone.value)}</strong>
                  </div>
                ))}
              </Card>
            </Col>
            <Col xs={24} lg={12}>
              <Card className={styles.trajBottomCard} bordered={false}>
                <h4>Contributors</h4>
                {selectedGoal.contributors.length ? (
                  selectedGoal.contributors.map((item: any) => (
                    <div key={item.entityId} className={styles.trajContributorRow}>
                      <div className={styles.trajContributorTop}>
                        <span>{item.name}</span>
                        <b>{formatMetricValue(selectedGoal.metricKey, Number(item.value || 0))}</b>
                      </div>
                      <span style={{ color: '#97a1b4', fontSize: '0.74rem' }}>{formatNumber(Number(item.share || 0), 1)}% of shown contributors</span>
                    </div>
                  ))
                ) : (
                  <div className={styles.trajEmptyState}>No contributor snapshot available.</div>
                )}
              </Card>
            </Col>
            <Col xs={24} lg={12}>
              <Card className={styles.trajBottomCard} bordered={false}>
                <h4>Snapshots</h4>
                {selectedGoal.snapshots.length ? (
                  selectedGoal.snapshots.map((snapshot: any) => (
                    <div key={snapshot.key} className={styles.trajMilestoneRow}>
                      <div>
                        <i className={snapshot.actualValue >= snapshot.requiredValue ? styles.trajMilestoneDone : undefined} />
                        <span>
                          <b>{snapshot.label}</b>
                          <em>{dayjs(snapshot.snapshotDate).format('D MMM YYYY')}</em>
                        </span>
                      </div>
                      <strong>
                        {formatMetricValue(selectedGoal.metricKey, snapshot.actualValue)} / {formatMetricValue(selectedGoal.metricKey, snapshot.requiredValue)}
                      </strong>
                    </div>
                  ))
                ) : (
                  <div className={styles.trajEmptyState}>No persisted snapshot rows for this goal.</div>
                )}
              </Card>
            </Col>
          </Row>
        </>
      )}

      <Modal visible={showCreate} onCancel={() => setShowCreate(false)} footer={null} width={680} className={styles.trajGoalModal}>
        <div className={styles.trajGoalModalHeader}>
          <div>
            <h3>
              <AimOutlined /> Set Goal
            </h3>
            <p>Create a new trajectory goal from live baseline and target values.</p>
          </div>
        </div>
        <div className={styles.trajGoalModalBody}>
          <div className={styles.trajGoalField}>
            <label>Name</label>
            <Input value={formState.name} onChange={(event) => setFormState((prev) => ({ ...prev, name: event.target.value }))} placeholder="Optional goal name" />
          </div>
          <Row gutter={10}>
            <Col span={12}>
              <div className={styles.trajGoalField}>
                <label>Metric</label>
                <Select value={formState.metricKey} onChange={(metricKey) => setFormState((prev) => ({ ...prev, metricKey }))} options={METRIC_OPTIONS} />
              </div>
            </Col>
            <Col span={12}>
              <div className={styles.trajGoalField}>
                <label>Aggregate Type</label>
                <Select
                  value={formState.assignmentEntityType}
                  onChange={(assignmentEntityType) => setFormState((prev) => ({ ...prev, assignmentEntityType }))}
                  options={assignmentEntityTypeOptions}
                />
              </div>
            </Col>
          </Row>

          <Row gutter={10}>
            <Col span={12}>
              <div className={styles.trajGoalField}>
                <label>Geo Scope</label>
                <Select value={formState.geoKey} onChange={(geoKey) => setFormState((prev) => ({ ...prev, geoKey }))} options={GEO_OPTIONS} />
              </div>
            </Col>
            <Col span={12}>
              <div className={styles.trajGoalField}>
                <label>Baseline</label>
                <InputNumber value={formState.baseline} onChange={(baseline) => setFormState((prev) => ({ ...prev, baseline: Number(baseline || 0) }))} style={{ width: '100%' }} />
              </div>
            </Col>
            <Col span={12}>
              <div className={styles.trajGoalField}>
                <label>Target</label>
                <InputNumber
                  value={formState.target}
                  onChange={(target) => setFormState((prev) => ({ ...prev, target: Number(target || 0) || undefined }))}
                  style={{ width: '100%' }}
                />
              </div>
            </Col>
          </Row>

          <Row gutter={10}>
            <Col span={12}>
              <div className={styles.trajGoalField}>
                <label>Start Date</label>
                <Input type="date" value={formState.startDate} onChange={(event) => setFormState((prev) => ({ ...prev, startDate: event.target.value }))} />
              </div>
            </Col>
            <Col span={12}>
              <div className={styles.trajGoalField}>
                <label>End Date</label>
                <Input type="date" value={formState.endDate} onChange={(event) => setFormState((prev) => ({ ...prev, endDate: event.target.value }))} />
              </div>
            </Col>
          </Row>
        </div>

        <div className={styles.trajGoalModalFooter}>
          <Button type="text" onClick={() => setShowCreate(false)}>
            Cancel
          </Button>
          <Button type="primary" onClick={createGoal}>
            Set Goal
          </Button>
        </div>
      </Modal>
    </div>
  );
}
