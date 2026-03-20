import { useEffect, useMemo, useState } from 'react';
import { Button, Card, Col, Input, InputNumber, Modal, Progress, Row, Select, Spin, Table, Tag, notification } from 'antd';
import { AimOutlined, CalendarOutlined, GlobalOutlined, PlusOutlined } from '@ant-design/icons';
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
	const remaining = target - current;
	const requiredPace = remainingDays > 0 ? remaining / remainingDays : 0;

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
		requiredPace
	};
}

export function TrajectoryView() {
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState('');
	const [goals, setGoals] = useState<GoalRecord[]>([]);
	const [selectedGoalId, setSelectedGoalId] = useState('');
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
			if (!selectedGoalId && nextGoals.length) {
				setSelectedGoalId(nextGoals[0].id);
				return;
			}
			if (selectedGoalId && !nextGoals.some((goal: GoalRecord) => goal.id === selectedGoalId)) {
				setSelectedGoalId(nextGoals[0]?.id || '');
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
		const allowedTypes = ALLOWED_ASSIGNMENT_ENTITY_TYPES_BY_METRIC[formState.metricKey] || ['salesman'];
		if (!allowedTypes.includes(formState.assignmentEntityType)) {
			setFormState((prev) => ({
				...prev,
				assignmentEntityType: allowedTypes[0] || 'salesman'
			}));
		}
	}, [formState.metricKey, formState.assignmentEntityType]);

	const selectedGoal = useMemo(() => goals.find((goal) => String(goal.id) === String(selectedGoalId)) || goals[0], [goals, selectedGoalId]);

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
			await loadGoals();
		} catch (err: any) {
			notification.error({ message: err?.response?.data?.message || 'Failed to archive goal' });
		}
	};

	return (
		<div className={styles.trajPage}>
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
				<>
					<Row gutter={[10, 10]}>
						{goals.map((goal) => (
							<Col xs={24} lg={12} key={goal.id}>
								<Card
									className={styles.trajGoalListCard}
									bordered={false}
									onClick={() => setSelectedGoalId(goal.id)}
								>
									<div className={styles.trajGoalListTop}>
										<div>
											<strong>{goal.name}</strong>
											<span>
												<GlobalOutlined /> {goal.geoKey} · <CalendarOutlined /> {dayjs(goal.startDate).format('D MMM')} →{' '}
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
									<Progress percent={Math.min(100, Number(goal.progressPercent || 0))} showInfo={false} strokeColor="#4463ea" trailColor="#edf1f8" />
								</Card>
							</Col>
						))}
					</Row>

					{selectedGoal && (
						<Card className={styles.trajProgressCard} bordered={false}>
							<div className={styles.trajProgressTop}>
								<div>
									<strong>{selectedGoal.name}</strong>
									<span> · {selectedGoal.metricKey}</span>
								</div>
								<Button danger type="text" onClick={() => archiveGoal(selectedGoal.id)}>
									Archive
								</Button>
							</div>

							<div className={styles.trajPaceGrid}>
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
									<span>Required Pace</span>
									<b>{formatMetricValue(selectedGoal.metricKey, selectedGoal.requiredPace)}</b>
									<em>/day</em>
								</div>
								<div>
									<span>Progress</span>
									<b>{formatNumber(selectedGoal.progressPercent, 1)}%</b>
								</div>
								<div>
									<span>Elapsed Time</span>
									<b>{formatNumber(selectedGoal.elapsedPct, 1)}%</b>
								</div>
								<div>
									<span>Pace</span>
									<b style={{ color: selectedGoal.paceColor }}>{selectedGoal.paceLabel}</b>
								</div>
								<div>
									<span>Days Remaining</span>
									<b>{selectedGoal.remainingDays}</b>
								</div>
							</div>

							<div className={styles.trajChartCard}>
								<h3>Snapshots</h3>
								<Table
									size="small"
									pagination={false}
									dataSource={(selectedGoal.snapshots || []).map((snapshot: GoalRecord) => ({
										key: snapshot.id || `${selectedGoal.id}-${snapshot.weekNumber}`,
										weekNumber: snapshot.weekNumber,
										snapshotDate: snapshot.snapshotDate,
										requiredValue: snapshot.requiredValue,
										actualValue: snapshot.actualValue
									}))}
									columns={[
										{ title: 'Week', dataIndex: 'weekNumber', key: 'weekNumber' },
										{
											title: 'Date',
											dataIndex: 'snapshotDate',
											key: 'snapshotDate',
											render: (value: string) => (value ? dayjs(value).format('D MMM YYYY') : '-')
										},
										{
											title: 'Required',
											dataIndex: 'requiredValue',
											key: 'requiredValue',
											render: (value: number) => formatMetricValue(selectedGoal.metricKey, Number(value || 0))
										},
										{
											title: 'Actual',
											dataIndex: 'actualValue',
											key: 'actualValue',
											render: (value: number) => formatMetricValue(selectedGoal.metricKey, Number(value || 0))
										}
									]}
								/>
							</div>
						</Card>
					)}
				</>
			)}

			<Modal
				visible={showCreate}
				onCancel={() => setShowCreate(false)}
				footer={null}
				width={680}
				className={styles.trajGoalModal}
			>
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
						<Input
							value={formState.name}
							onChange={(event) => setFormState((prev) => ({ ...prev, name: event.target.value }))}
							placeholder="Optional goal name"
						/>
					</div>
					<Row gutter={10}>
						<Col span={12}>
							<div className={styles.trajGoalField}>
								<label>Metric</label>
								<Select
									value={formState.metricKey}
									onChange={(metricKey) => setFormState((prev) => ({ ...prev, metricKey }))}
									options={METRIC_OPTIONS}
								/>
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
								<InputNumber
									value={formState.baseline}
									onChange={(baseline) => setFormState((prev) => ({ ...prev, baseline: Number(baseline || 0) }))}
									style={{ width: '100%' }}
								/>
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
								<Input
									type="date"
									value={formState.startDate}
									onChange={(event) => setFormState((prev) => ({ ...prev, startDate: event.target.value }))}
								/>
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
