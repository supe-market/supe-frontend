import { useEffect, useMemo, useState } from 'react';
import { Button, Card, Input, InputNumber, Modal, Select, Spin, Table, Tag, notification } from 'antd';
import { AimOutlined, DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import supeApi from '../api';
import { formatCurrency, formatNumber } from '../utils';
import styles from '../index.module.scss';

type TargetRow = Record<string, any>;

const METRIC_OPTIONS = [
	{ label: 'Revenue', value: 'revenue' },
	{ label: 'Collection', value: 'collection' },
	{ label: 'Orders', value: 'orders' },
	{ label: 'Coverage', value: 'coverage' },
	{ label: 'Beat Adherence', value: 'beat_adherence' },
	{ label: 'Outstanding', value: 'outstanding_reduction' }
];

const STATUS_OPTIONS = [
	{ label: 'Active', value: 'active' },
	{ label: 'Paused', value: 'paused' },
	{ label: 'Completed', value: 'completed' }
];

const SCOPE_LEVEL_OPTIONS = [
	{ label: 'National', value: 'national' },
	{ label: 'Zone', value: 'zone' },
	{ label: 'Region', value: 'region' },
	{ label: 'Area', value: 'area' }
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

function formatTargetMetric(metric: string, value: number) {
	const key = String(metric || '').toLowerCase();
	if (['coverage', 'coverage_pct', 'beat_adherence', 'penetration', 'growth', 'realization', 'damage'].includes(key)) {
		return `${formatNumber(value, 1)}%`;
	}
	if (key === 'orders') {
		return formatNumber(value);
	}
	return formatCurrency(value);
}

export function TargetsView() {
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState('');
	const [targets, setTargets] = useState<TargetRow[]>([]);
	const [salesmen, setSalesmen] = useState<Array<{ id: string; name: string }>>([]);
	const [metricFilter, setMetricFilter] = useState('all');
	const [statusFilter, setStatusFilter] = useState('all');
	const [showCreate, setShowCreate] = useState(false);
	const [editingTarget, setEditingTarget] = useState<TargetRow | null>(null);
	const [submitting, setSubmitting] = useState(false);

	const [createForm, setCreateForm] = useState({
		salesmanId: undefined as string | undefined,
		assignmentEntityType: 'salesman',
		metric: 'revenue',
		scopeLevel: 'national',
		scopeValue: 'all_india',
		targetValue: undefined as number | undefined,
		periodLabel: dayjs().format('MMM YYYY'),
		startDate: dayjs().startOf('month').format('YYYY-MM-DD'),
		endDate: dayjs().endOf('month').format('YYYY-MM-DD'),
		notes: ''
	});

	const [editForm, setEditForm] = useState({
		targetValue: undefined as number | undefined,
		status: 'active',
		notes: ''
	});

	const loadTargets = async () => {
		try {
			setLoading(true);
			setError('');
			const [targetsResponse, salesmenResponse] = await Promise.all([
				supeApi.listTargets(),
				supeApi.getObserveEntityList('salesman', { timeRange: 'mtd', limit: 500, page: 1 })
			]);

			const targetRows = targetsResponse?.data?.data?.targets || [];
			const salesmanRows = salesmenResponse?.data?.data || [];

			setTargets(targetRows);
			setSalesmen(
				salesmanRows.map((row: any) => {
					const name = `${row.firstName || ''} ${row.lastName || ''}`.trim() || row.salesmanId;
					return { id: String(row.salesmanId), name };
				})
			);
		} catch (err: any) {
			setError(err?.response?.data?.message || 'Failed to load targets');
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		loadTargets();
	}, []);

	useEffect(() => {
		const allowedTypes = ALLOWED_ASSIGNMENT_ENTITY_TYPES_BY_METRIC[createForm.metric] || ['salesman'];
		if (!allowedTypes.includes(createForm.assignmentEntityType)) {
			setCreateForm((prev) => ({
				...prev,
				assignmentEntityType: allowedTypes[0] || 'salesman'
			}));
		}
	}, [createForm.metric, createForm.assignmentEntityType]);

	const filteredTargets = useMemo(() => {
		return targets.filter((target) => {
			if (metricFilter !== 'all' && target.metric !== metricFilter) {
				return false;
			}
			if (statusFilter !== 'all' && target.status !== statusFilter) {
				return false;
			}
			return true;
		});
	}, [targets, metricFilter, statusFilter]);

	const stats = useMemo(() => {
		return {
			total: targets.length,
			onTrack: targets.filter((target) => Number(target.attainmentPct || 0) >= 85).length,
			atRisk: targets.filter((target) => Number(target.attainmentPct || 0) < 85 && Number(target.attainmentPct || 0) >= 60).length,
			behind: targets.filter((target) => Number(target.attainmentPct || 0) < 60).length
		};
	}, [targets]);

	const salesmanMap = useMemo(() => {
		return salesmen.reduce<Record<string, string>>((acc, row) => {
			acc[row.id] = row.name;
			return acc;
		}, {});
	}, [salesmen]);

	const assignmentEntityTypeOptions = useMemo(() => {
		const allowedTypes = new Set(ALLOWED_ASSIGNMENT_ENTITY_TYPES_BY_METRIC[createForm.metric] || ['salesman']);
		return ASSIGNMENT_ENTITY_TYPE_OPTIONS.filter((option) => allowedTypes.has(option.value));
	}, [createForm.metric]);

	const createTarget = async () => {
		if (!createForm.targetValue || createForm.targetValue <= 0) {
			notification.error({ message: 'Target value is required' });
			return;
		}
		if (!dayjs(createForm.endDate).isAfter(dayjs(createForm.startDate))) {
			notification.error({ message: 'End date must be after start date' });
			return;
		}

		try {
			setSubmitting(true);
			await supeApi.createTarget({
				salesmanId: createForm.assignmentEntityType === 'salesman' ? createForm.salesmanId || null : null,
				assignmentEntityType: createForm.assignmentEntityType,
				metric: createForm.metric,
				scope: {
					level: createForm.scopeLevel,
					value: createForm.scopeValue
				},
				targetValue: Number(createForm.targetValue),
				period: 'custom',
				periodLabel: createForm.periodLabel,
				startDate: createForm.startDate,
				endDate: createForm.endDate,
				notes: createForm.notes || null
			});
			notification.success({ message: 'Target created' });
			setShowCreate(false);
			setCreateForm((prev) => ({ ...prev, targetValue: undefined, notes: '', salesmanId: undefined, assignmentEntityType: 'salesman' }));
			await loadTargets();
		} catch (err: any) {
			notification.error({ message: err?.response?.data?.message || 'Failed to create target' });
		} finally {
			setSubmitting(false);
		}
	};

	const openEdit = (target: TargetRow) => {
		setEditingTarget(target);
		setEditForm({
			targetValue: Number(target.targetValue || 0),
			status: target.status || 'active',
			notes: target.notes || ''
		});
	};

	const updateTarget = async () => {
		if (!editingTarget) return;
		try {
			setSubmitting(true);
			await supeApi.updateTarget(editingTarget.id, {
				targetValue: Number(editForm.targetValue || 0),
				status: editForm.status,
				notes: editForm.notes
			});
			notification.success({ message: 'Target updated' });
			setEditingTarget(null);
			await loadTargets();
		} catch (err: any) {
			notification.error({ message: err?.response?.data?.message || 'Failed to update target' });
		} finally {
			setSubmitting(false);
		}
	};

	const deleteTarget = async (id: string) => {
		try {
			await supeApi.deleteTarget(id);
			notification.success({ message: 'Target deleted' });
			await loadTargets();
		} catch (err: any) {
			notification.error({ message: err?.response?.data?.message || 'Failed to delete target' });
		}
	};

	const columns = [
		{
			title: 'Metric',
			dataIndex: 'metric',
			key: 'metric',
			render: (value: string) => METRIC_OPTIONS.find((option) => option.value === value)?.label || value
		},
		{
			title: 'Assignee',
			dataIndex: 'salesmanId',
			key: 'salesmanId',
			render: (value: string, row: TargetRow) => row.assigneeLabel || salesmanMap[value] || 'All salesmen'
		},
		{
			title: 'Scope',
			key: 'scope',
			render: (_: unknown, row: TargetRow) => `${row.scopeLevel || 'national'} · ${row.scopeValue || 'all_india'}`
		},
		{ title: 'Period', dataIndex: 'periodLabel', key: 'periodLabel' },
		{
			title: 'Actual',
			key: 'actualValue',
			render: (_: unknown, row: TargetRow) => formatTargetMetric(row.metric, Number(row.actualValue || 0))
		},
		{
			title: 'Target',
			key: 'targetValue',
			render: (_: unknown, row: TargetRow) => formatTargetMetric(row.metric, Number(row.targetValue || 0))
		},
		{
			title: 'Attainment',
			dataIndex: 'attainmentPct',
			key: 'attainmentPct',
			render: (value: number) => `${formatNumber(Number(value || 0), 1)}%`
		},
		{
			title: 'Status',
			dataIndex: 'status',
			key: 'status',
			render: (value: string) => <Tag>{value}</Tag>
		},
		{
			title: '',
			key: 'actions',
			render: (_: unknown, row: TargetRow) => (
				<div>
					<Button type="text" icon={<EditOutlined />} onClick={() => openEdit(row)} />
					<Button type="text" danger icon={<DeleteOutlined />} onClick={() => deleteTarget(row.id)} />
				</div>
			)
		}
	];

	return (
		<div className={styles.targetsPage}>
			<div className={styles.targetsHeader}>
				<div>
					<div className={styles.targetsTitleRow}>
						<AimOutlined className={styles.targetsTitleIcon} />
						<h1>Targets</h1>
						<span>{dayjs().format('MMM YYYY')}</span>
					</div>
					<p>Live target assignment and tracking from OMS supe APIs.</p>
				</div>
				<Button type="primary" className={styles.targetsPrimaryButton} icon={<PlusOutlined />} onClick={() => setShowCreate(true)}>
					Assign Target
				</Button>
			</div>

			<div className={styles.targetsSummaryRow}>
				<div className={styles.targetsStatsRow}>
					<div>
						Total <b>{stats.total}</b>
					</div>
					<div>
						On Track <b className={styles.targetsStatGreen}>{stats.onTrack}</b>
					</div>
					<div>
						At Risk <b className={styles.targetsStatAmber}>{stats.atRisk}</b>
					</div>
					<div>
						Behind <b className={styles.targetsStatRed}>{stats.behind}</b>
					</div>
				</div>
				<div className={styles.targetsFilterRow}>
					<Select
						value={metricFilter}
						onChange={setMetricFilter}
						style={{ width: 220 }}
						options={[{ label: 'All Metrics', value: 'all' }, ...METRIC_OPTIONS]}
					/>
					<Select
						value={statusFilter}
						onChange={setStatusFilter}
						style={{ width: 180 }}
						options={[{ label: 'All Status', value: 'all' }, ...STATUS_OPTIONS]}
					/>
				</div>
			</div>

			<Card className={styles.observeTableCard} bordered={false}>
				{loading ? (
					<Spin />
				) : error ? (
					<div>{error}</div>
				) : (
					<Table rowKey="id" columns={columns as any} dataSource={filteredTargets as any} pagination={false} scroll={{ x: 1100 }} />
				)}
			</Card>

			<Modal
				visible={showCreate}
				onCancel={() => setShowCreate(false)}
				footer={null}
				className={styles.targetsModal}
				closable={false}
				destroyOnClose
			>
				<div className={styles.targetsModalHeader}>
					<h3>Create Target</h3>
					<button type="button" onClick={() => setShowCreate(false)}>
						×
					</button>
				</div>
				<div className={styles.targetsModalBody}>
					<label>Salesman (salesman targets only)</label>
					<Select
						value={createForm.salesmanId}
						onChange={(salesmanId) => setCreateForm((prev) => ({ ...prev, salesmanId }))}
						disabled={createForm.assignmentEntityType !== 'salesman'}
						allowClear
						options={salesmen.map((row) => ({ label: row.name, value: row.id }))}
					/>

					<label>Aggregate Type</label>
					<Select
						value={createForm.assignmentEntityType}
						onChange={(assignmentEntityType) =>
							setCreateForm((prev) => ({
								...prev,
								assignmentEntityType,
								salesmanId: assignmentEntityType === 'salesman' ? prev.salesmanId : undefined
							}))
						}
						options={assignmentEntityTypeOptions}
					/>

					<label>Metric</label>
					<Select value={createForm.metric} onChange={(metric) => setCreateForm((prev) => ({ ...prev, metric }))} options={METRIC_OPTIONS} />

					<label>Scope Level</label>
					<Select
						value={createForm.scopeLevel}
						onChange={(scopeLevel) => setCreateForm((prev) => ({ ...prev, scopeLevel }))}
						options={SCOPE_LEVEL_OPTIONS}
					/>

					<label>Scope Value</label>
					<Input value={createForm.scopeValue} onChange={(event) => setCreateForm((prev) => ({ ...prev, scopeValue: event.target.value }))} />

					<label>Target Value</label>
					<InputNumber
						value={createForm.targetValue}
						onChange={(targetValue) => setCreateForm((prev) => ({ ...prev, targetValue: Number(targetValue || 0) || undefined }))}
						style={{ width: '100%' }}
					/>

					<label>Period Label</label>
					<Input value={createForm.periodLabel} onChange={(event) => setCreateForm((prev) => ({ ...prev, periodLabel: event.target.value }))} />

					<label>Start Date</label>
					<Input type="date" value={createForm.startDate} onChange={(event) => setCreateForm((prev) => ({ ...prev, startDate: event.target.value }))} />

					<label>End Date</label>
					<Input type="date" value={createForm.endDate} onChange={(event) => setCreateForm((prev) => ({ ...prev, endDate: event.target.value }))} />

					<label>Notes</label>
					<Input value={createForm.notes} onChange={(event) => setCreateForm((prev) => ({ ...prev, notes: event.target.value }))} />
				</div>
				<div className={styles.targetsModalFooter}>
					<Button type="text" onClick={() => setShowCreate(false)}>
						Cancel
					</Button>
					<Button type="primary" loading={submitting} onClick={createTarget}>
						Create Target
					</Button>
				</div>
			</Modal>

			<Modal
				visible={Boolean(editingTarget)}
				onCancel={() => setEditingTarget(null)}
				footer={null}
				className={styles.targetsModal}
				closable={false}
				destroyOnClose
			>
				<div className={styles.targetsModalHeader}>
					<h3>Edit Target</h3>
					<button type="button" onClick={() => setEditingTarget(null)}>
						×
					</button>
				</div>
				<div className={styles.targetsModalBody}>
					<label>Target Value</label>
					<InputNumber
						value={editForm.targetValue}
						onChange={(targetValue) => setEditForm((prev) => ({ ...prev, targetValue: Number(targetValue || 0) || undefined }))}
						style={{ width: '100%' }}
					/>

					<label>Status</label>
					<Select value={editForm.status} onChange={(status) => setEditForm((prev) => ({ ...prev, status }))} options={STATUS_OPTIONS} />

					<label>Notes</label>
					<Input value={editForm.notes} onChange={(event) => setEditForm((prev) => ({ ...prev, notes: event.target.value }))} />
				</div>
				<div className={styles.targetsModalFooter}>
					<Button type="text" onClick={() => setEditingTarget(null)}>
						Cancel
					</Button>
					<Button type="primary" loading={submitting} onClick={updateTarget}>
						Update Target
					</Button>
				</div>
			</Modal>
		</div>
	);
}
