import { useEffect, useMemo, useState } from 'react';
import { Button, Card, Drawer, Input, Select, Space, Spin, Table, Tag } from 'antd';
import {
	CloseOutlined,
	EnvironmentOutlined,
	EyeOutlined,
	LineChartOutlined,
	SearchOutlined
} from '@ant-design/icons';
import supeApi from '../api';
import { formatCurrency, formatCurrencyLakhs, formatNumber } from '../utils';
import styles from '../index.module.scss';

interface IEntityViewProps {
	entityType: 'salesman' | 'retailer' | 'beat' | 'sku' | 'distributor';
	title: string;
}

type RowRecord = Record<string, any>;

const TIME_OPTIONS = [
	{ label: 'Today', value: 'today' },
	{ label: 'MTD', value: 'mtd' },
	{ label: 'Last 7 Days', value: 'last7d' },
	{ label: 'Last 30 Days', value: 'last30d' },
	{ label: 'Last 90 Days', value: 'last90d' }
];

const SHOW_OPTIONS = [
	{ label: 'All', value: 'all' },
	{ label: 'Top 10', value: 'top10' },
	{ label: 'Top 25', value: 'top25' },
	{ label: 'Top 50', value: 'top50' },
	{ label: 'Bottom 10', value: 'bottom10' },
	{ label: 'Bottom 25', value: 'bottom25' },
	{ label: 'Bottom 50', value: 'bottom50' }
];

const GROUP_OPTIONS = [
	{ label: 'None', value: 'none' },
	{ label: 'Zone', value: 'zone' },
	{ label: 'Region', value: 'region' },
	{ label: 'Area', value: 'area' }
];

function extractShowLimit(value: string) {
	const match = value.match(/\d+/);
	return match ? Number(match[0]) : Number.POSITIVE_INFINITY;
}

function getName(row: RowRecord) {
	return row.name || row.retailerName || row.skuName || row.beatName || row.distributorName || row.id;
}

function getPrimaryMetricKey(entityType: IEntityViewProps['entityType']) {
	if (entityType === 'sku') return 'revenueMTD';
	if (entityType === 'beat') return 'realizationPct';
	return 'revenueMTD';
}

function readNumericMetric(raw: RowRecord, flatKeys: string[], nestedKeys: string[] = []) {
	const metrics = raw.metrics || {};
	for (const key of flatKeys) {
		if (raw[key] !== undefined && raw[key] !== null && raw[key] !== '') {
			return Number(raw[key] || 0);
		}
	}
	for (const key of nestedKeys) {
		if (metrics[key] !== undefined && metrics[key] !== null && metrics[key] !== '') {
			return Number(metrics[key] || 0);
		}
	}
	return 0;
}

function mapApiRow(entityType: IEntityViewProps['entityType'], raw: RowRecord): RowRecord {
	if (entityType === 'salesman') {
		const name = `${raw.firstName || ''} ${raw.lastName || ''}`.trim() || raw.salesmanId;
		return {
			key: raw.salesmanId,
			id: raw.salesmanId,
			name,
			zone: raw.zone || '-',
			region: raw.region || '-',
			area: raw.area || '-',
			revenueMTD: readNumericMetric(raw, ['revenue', 'revenueMTD'], ['revenueMTD']),
			collectionMTD: readNumericMetric(raw, ['collection', 'collectionMTD'], ['collectionMTD']),
			ordersMTD: readNumericMetric(raw, ['orders', 'ordersMTD'], ['ordersMTD']),
			coveragePct: readNumericMetric(raw, ['coverage', 'coveragePct'], ['coveragePct']),
			beatAdherencePct: readNumericMetric(raw, ['beatAdherence', 'beatAdherencePct'], ['beatAdherencePct']),
			outstanding: readNumericMetric(raw, ['outstanding', 'outstandingAmount'], ['outstandingAmount'])
		};
	}

	if (entityType === 'retailer') {
		const name = `${raw.firstName || ''} ${raw.lastName || ''}`.trim() || raw.retailerId;
		return {
			key: raw.retailerId,
			id: raw.retailerId,
			retailerName: name,
			name,
			zone: raw.zone || '-',
			region: raw.city || raw.region || '-',
			area: raw.area || '-',
			revenueMTD: readNumericMetric(raw, ['revenue', 'revenueMTD'], ['revenueMTD']),
			aov: readNumericMetric(raw, ['aov', 'aovMTD'], ['aovMTD']),
			ordersMTD: readNumericMetric(raw, ['orders', 'ordersMTD'], ['ordersMTD']),
			outstanding: readNumericMetric(raw, ['outstanding', 'outstandingAmount'], ['outstandingAmount']),
			dormancyDays: readNumericMetric(raw, ['dormancyDays', 'daysSinceOrder'], ['daysSinceOrder']),
			lastOrderAt: raw.lastOrderAt || raw.metrics?.lastOrderAt || null
		};
	}

	if (entityType === 'beat') {
		return {
			key: raw.beatId,
			id: raw.beatId,
			beatName: raw.beatName || raw.beatCode || raw.beatId,
			name: raw.beatName || raw.beatCode || raw.beatId,
			zone: raw.zone || '-',
			region: raw.region || '-',
			area: raw.area || '-',
			totalRetailers: readNumericMetric(raw, ['totalRetailers'], ['totalRetailers']),
			revenueMTD: readNumericMetric(raw, ['revenue', 'revenueMTD'], ['revenueMTD']),
			coveragePct: readNumericMetric(raw, ['coverage', 'coveragePct'], ['coveragePct']),
			realizationPct: readNumericMetric(raw, ['realizationPct'], ['realizationPct']),
			visitsMTD: readNumericMetric(raw, ['orders', 'visitsMTD'], ['visitsMTD']),
			ebv: readNumericMetric(raw, ['ebv'], ['ebv'])
		};
	}

	if (entityType === 'sku') {
		return {
			key: raw.skuId,
			id: raw.skuId,
			skuName: raw.skuName || raw.sku || raw.skuId,
			name: raw.skuName || raw.sku || raw.skuId,
			category: raw.category || '-',
			zone: raw.zone || '-',
			region: raw.region || '-',
			area: raw.area || '-',
			revenueMTD: readNumericMetric(raw, ['revenue', 'revenueMTD'], ['revenueMTD']),
			unitsSold: readNumericMetric(raw, ['qty', 'unitsSold', 'unitsMTD'], ['unitsMTD']),
			outletsMTD: readNumericMetric(raw, ['outlets', 'outletsMTD'], ['outletsMTD']),
			penetrationPct: readNumericMetric(raw, ['penetration', 'penetrationPct'], ['penetrationPct']),
			growthPct: readNumericMetric(raw, ['growth', 'growthPct'], ['growthPct'])
		};
	}

	return {
		key: raw.distributorId,
		id: raw.distributorId,
		distributorName: raw.distributorName || raw.distributorId,
		name: raw.distributorName || raw.distributorId,
		zone: raw.zone || '-',
		region: raw.region || '-',
		area: raw.area || '-',
		revenueMTD: readNumericMetric(raw, ['revenue', 'revenueMTD'], ['revenueMTD']),
		ordersMTD: readNumericMetric(raw, ['orders', 'ordersMTD'], ['ordersMTD']),
		fulfilmentPct: readNumericMetric(raw, ['fulfilmentRate', 'fulfilmentPct'], ['fulfilmentPct']),
		damagePct: readNumericMetric(raw, ['damage', 'damagePct', 'damageRate'], ['damageRate'])
	};
}

function buildColumns(entityType: IEntityViewProps['entityType'], onInsightClick: (row: RowRecord) => void) {
	const common = [
		{ title: 'ZONE', dataIndex: 'zone', key: 'zone' },
		{ title: 'REGION', dataIndex: 'region', key: 'region' },
		{ title: 'AREA', dataIndex: 'area', key: 'area' }
	];
	const distributorColumns: any[] = [
		{ title: 'DISTRIBUTOR', dataIndex: 'distributorName', key: 'distributorName' },
		{ title: 'REVENUE', dataIndex: 'revenueMTD', key: 'revenueMTD', render: (value: number) => formatCurrency(value) },
		{ title: 'ORDERS', dataIndex: 'ordersMTD', key: 'ordersMTD', render: (value: number) => formatNumber(value) },
		{ title: 'FULFILMENT %', dataIndex: 'fulfilmentPct', key: 'fulfilmentPct', render: (value: number) => `${formatNumber(value, 1)}%` },
		{ title: 'DAMAGE %', dataIndex: 'damagePct', key: 'damagePct', render: (value: number) => `${formatNumber(value, 2)}%` },
		...common
	];

	const columns = (entityType === 'distributor'
		? distributorColumns
		: buildColumnsWithoutInsight(entityType, common)) as any[];

	columns.push({
		title: '',
		key: 'insights',
		width: 130,
		fixed: 'right',
		render: (_: unknown, row: RowRecord) => (
			<Button
				className={styles.insightsBtn}
				icon={<LineChartOutlined />}
				onClick={(event) => {
					event.stopPropagation();
					onInsightClick(row);
				}}
			>
				Insights
			</Button>
		)
	});

	return columns;
}

function buildColumnsWithoutInsight(entityType: IEntityViewProps['entityType'], common: any[]) {
	if (entityType === 'salesman') {
		return [
			{ title: 'SALESMAN', dataIndex: 'name', key: 'name' },
			{ title: 'REVENUE', dataIndex: 'revenueMTD', key: 'revenueMTD', render: (value: number) => formatCurrency(value) },
			{ title: 'COLLECTION', dataIndex: 'collectionMTD', key: 'collectionMTD', render: (value: number) => formatCurrency(value) },
			{ title: 'ORDERS', dataIndex: 'ordersMTD', key: 'ordersMTD', render: (value: number) => formatNumber(value) },
			{ title: 'COVERAGE %', dataIndex: 'coveragePct', key: 'coveragePct', render: (value: number) => `${formatNumber(value, 1)}%` },
			{ title: 'BEAT ADHERENCE %', dataIndex: 'beatAdherencePct', key: 'beatAdherencePct', render: (value: number) => `${formatNumber(value, 1)}%` },
			{ title: 'OUTSTANDING', dataIndex: 'outstanding', key: 'outstanding', render: (value: number) => formatCurrency(value) },
			...common
		];
	}
	if (entityType === 'retailer') {
		return [
			{ title: 'RETAILER', dataIndex: 'retailerName', key: 'retailerName' },
			{ title: 'REVENUE', dataIndex: 'revenueMTD', key: 'revenueMTD', render: (value: number) => formatCurrency(value) },
			{ title: 'AOV', dataIndex: 'aov', key: 'aov', render: (value: number) => formatCurrency(value) },
			{ title: 'ORDERS', dataIndex: 'ordersMTD', key: 'ordersMTD', render: (value: number) => formatNumber(value) },
			{ title: 'OUTSTANDING', dataIndex: 'outstanding', key: 'outstanding', render: (value: number) => formatCurrency(value) },
			{ title: 'DORMANCY (DAYS)', dataIndex: 'dormancyDays', key: 'dormancyDays', render: (value: number) => formatNumber(value) },
			...common
		];
	}
	if (entityType === 'beat') {
		return [
			{ title: 'BEAT', dataIndex: 'beatName', key: 'beatName' },
			{ title: 'REVENUE', dataIndex: 'revenueMTD', key: 'revenueMTD', render: (value: number) => formatCurrency(value) },
			{ title: 'EBV', dataIndex: 'ebv', key: 'ebv', render: (value: number) => formatCurrency(value) },
			{ title: 'TOTAL RETAILERS', dataIndex: 'totalRetailers', key: 'totalRetailers', render: (value: number) => formatNumber(value) },
			{ title: 'VISITS', dataIndex: 'visitsMTD', key: 'visitsMTD', render: (value: number) => formatNumber(value) },
			{ title: 'COVERAGE %', dataIndex: 'coveragePct', key: 'coveragePct', render: (value: number) => `${formatNumber(value, 1)}%` },
			{ title: 'REALIZATION %', dataIndex: 'realizationPct', key: 'realizationPct', render: (value: number) => `${formatNumber(value, 1)}%` },
			...common
		];
	}
	if (entityType === 'sku') {
		return [
			{ title: 'SKU', dataIndex: 'skuName', key: 'skuName' },
			{ title: 'CATEGORY', dataIndex: 'category', key: 'category' },
			{ title: 'REVENUE', dataIndex: 'revenueMTD', key: 'revenueMTD', render: (value: number) => formatCurrency(value) },
			{ title: 'UNITS', dataIndex: 'unitsSold', key: 'unitsSold', render: (value: number) => formatNumber(value) },
			{ title: 'OUTLETS', dataIndex: 'outletsMTD', key: 'outletsMTD', render: (value: number) => formatNumber(value) },
			{ title: 'PENETRATION %', dataIndex: 'penetrationPct', key: 'penetrationPct', render: (value: number) => `${formatNumber(value, 1)}%` },
			{ title: 'GROWTH %', dataIndex: 'growthPct', key: 'growthPct', render: (value: number) => `${formatNumber(value, 1)}%` },
			...common
		];
	}
	return [];
}

export function EntityView({ entityType, title }: IEntityViewProps) {
	const [rows, setRows] = useState<RowRecord[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState('');
	const [search, setSearch] = useState('');
	const [territory, setTerritory] = useState('all');
	const [timeWindow, setTimeWindow] = useState('mtd');
	const [showBy, setShowBy] = useState('all');
	const [groupBy, setGroupBy] = useState('none');
	const [selectedInsightRow, setSelectedInsightRow] = useState<RowRecord | null>(null);
	const [insightLoading, setInsightLoading] = useState(false);
	const [insightError, setInsightError] = useState('');
	const [insightData, setInsightData] = useState<RowRecord | null>(null);

	useEffect(() => {
		let active = true;
		const fetchRows = async () => {
			try {
				setLoading(true);
				setError('');
				const response = await supeApi.getObserveEntityList(entityType, {
					timeRange: timeWindow,
					limit: 500,
					page: 1
				});
				if (!active) {
					return;
				}
				const rawRows = response?.data?.data || [];
				setRows(rawRows.map((row: RowRecord) => mapApiRow(entityType, row)));
			} catch (err: any) {
				if (!active) {
					return;
				}
				setError(err?.response?.data?.message || 'Failed to load entity data');
			} finally {
				if (active) {
					setLoading(false);
				}
			}
		};

		fetchRows();
		return () => {
			active = false;
		};
	}, [entityType, timeWindow]);

	const territoryOptions = useMemo(() => {
		const zones = Array.from(new Set(rows.map((item) => item.zone).filter(Boolean)));
		return [{ label: 'All India', value: 'all' }, ...zones.map((zone) => ({ label: zone, value: zone }))];
	}, [rows]);

	const filteredRows = useMemo(() => {
		let nextRows = [...rows];
		if (territory !== 'all') {
			nextRows = nextRows.filter((row) => row.zone === territory);
		}
		if (search) {
			const lowered = search.toLowerCase();
			nextRows = nextRows.filter((row) =>
				Object.values(row).some((value) => String(value || '').toLowerCase().includes(lowered))
			);
		}
		return nextRows;
	}, [rows, territory, search]);

	const presentedRows = useMemo(() => {
		let nextRows = [...filteredRows];
		const primaryMetricKey = getPrimaryMetricKey(entityType);
		const limit = extractShowLimit(showBy);
		const byMetric = [...nextRows].sort((a, b) => Number(b[primaryMetricKey] || 0) - Number(a[primaryMetricKey] || 0));

		if (showBy.startsWith('top')) {
			nextRows = byMetric.slice(0, limit);
		}
		if (showBy.startsWith('bottom')) {
			nextRows = byMetric.reverse().slice(0, limit);
		}
		if (groupBy !== 'none') {
			nextRows = nextRows.map((row) => ({ ...row, groupLabel: row[groupBy] || '-' }));
		}
		return nextRows;
	}, [filteredRows, entityType, showBy, groupBy]);

	const tableColumns = useMemo(
		() =>
			buildColumns(entityType, async (row) => {
				setSelectedInsightRow(row);
				setInsightLoading(true);
				setInsightError('');
				try {
					const response = await supeApi.getObserveEntityInsights(entityType, row.id, {
						timeRange: timeWindow
					});
					setInsightData(response?.data?.data || null);
				} catch (err: any) {
					setInsightError(err?.response?.data?.message || 'Failed to load insights');
					setInsightData(null);
				} finally {
					setInsightLoading(false);
				}
			}),
		[entityType, timeWindow]
	);

	const entityLabel = title.replace(' Performance', '').replace(' Health', '').replace(' Operations', '');

	return (
		<div className={styles.observeEntityPage}>
			<div className={styles.observeBreadRow}>
				<div>
					<EyeOutlined /> Observe <span>›</span> <strong>{entityLabel}</strong>
					<Tag className={styles.observeCountTag}>{presentedRows.length} rows</Tag>
				</div>
				<Input
					allowClear
					value={search}
					onChange={(e) => setSearch(e.target.value)}
					prefix={<SearchOutlined />}
					placeholder={`Search ${entityType}...`}
					className={styles.observeSearchInput}
				/>
			</div>

			<Card className={styles.observeFiltersCard} bordered={false}>
				<div className={styles.observeFiltersRow}>
					<Space size={14} wrap>
						<span>Territory:</span>
						<Select value={territory} onChange={setTerritory} className={styles.observeSelectWide} options={territoryOptions} />
						<span>Time:</span>
						<Select value={timeWindow} onChange={setTimeWindow} className={styles.observeSelect} options={TIME_OPTIONS} />
						<span>Show:</span>
						<Select value={showBy} onChange={setShowBy} className={styles.observeSelect} options={SHOW_OPTIONS} />
					</Space>
				</div>
				<div className={styles.observeFiltersRowBottom}>
					<Space size={14} wrap>
						<span>Group:</span>
						<Select value={groupBy} onChange={setGroupBy} className={styles.observeSelect} options={GROUP_OPTIONS} />
						<span className={styles.observeSecondaryText}>{presentedRows.length} records</span>
					</Space>
				</div>
			</Card>

			<Card className={styles.observeTableCard} bordered={false}>
				{loading ? (
					<Spin />
				) : error ? (
					<div>{error}</div>
				) : (
					<Table columns={tableColumns as any} dataSource={presentedRows as any} pagination={false} size="large" scroll={{ x: 1200, y: 620 }} />
				)}
			</Card>

			<Drawer
				placement="right"
				width={720}
				closable
				closeIcon={<CloseOutlined />}
				onClose={() => {
					setSelectedInsightRow(null);
					setInsightData(null);
					setInsightError('');
				}}
				open={Boolean(selectedInsightRow)}
				className={styles.observeInsightsDrawer}
			>
				{selectedInsightRow && (
					<div className={styles.observeDrawerBody}>
						<div className={styles.observeDrawerHead}>
							<div>
								<div className={styles.observeDrawerNameRow}>
									<div className={styles.observeDrawerAvatar}>
										<LineChartOutlined />
									</div>
									<div>
										<div className={styles.observeDrawerName}>
											{getName(selectedInsightRow)} <Tag>{entityLabel}</Tag>
										</div>
										<div className={styles.observeDrawerSub}>
											<EnvironmentOutlined /> {selectedInsightRow.area || '-'} · {selectedInsightRow.region || '-'} ·{' '}
											{selectedInsightRow.zone || '-'}
										</div>
									</div>
								</div>
								<div className={styles.observeDrawerMetrics}>
									<div>
										<span>Primary</span>
										<b>{formatCurrencyLakhs(Number(selectedInsightRow[getPrimaryMetricKey(entityType)] || 0))}</b>
									</div>
									<div>
										<span>Rows in View</span>
										<b>{formatNumber(presentedRows.length)}</b>
									</div>
								</div>
							</div>
						</div>

						{insightLoading ? (
							<Spin />
						) : insightError ? (
							<div>{insightError}</div>
						) : (
							<>
								<div className={styles.observeDrawerSection}>
									<h3>Signals</h3>
									{(insightData?.insights || []).length === 0 ? (
										<p>No active signals for this entity.</p>
									) : (
										(insightData?.insights || []).map((signal: any) => (
											<div key={signal.id} className={styles.observeIntelligenceRow}>
												<div className={styles.observeIntelligenceText}>
													<span>
														<b>{signal.title}</b> {signal.detail}
													</span>
												</div>
												<Tag>{signal.severity}</Tag>
											</div>
										))
									)}
								</div>

								<div className={styles.observeDrawerSection}>
									<h3>Trend Series</h3>
									{(insightData?.trends || []).length === 0 ? (
										<p>No trend points available for this period.</p>
									) : (
										<Table
											size="small"
											pagination={false}
											dataSource={(insightData?.trends || []).map((point: any, idx: number) => ({
												key: `${point.date}-${point.metric}-${idx}`,
												date: point.date,
												metric: point.metric,
												value: point.value
											}))}
											columns={[
												{ title: 'Date', dataIndex: 'date', key: 'date' },
												{ title: 'Metric', dataIndex: 'metric', key: 'metric' },
												{
													title: 'Value',
													dataIndex: 'value',
													key: 'value',
													render: (value: number) => formatNumber(Number(value || 0), 2)
												}
											]}
										/>
									)}
								</div>
							</>
						)}
					</div>
				)}
			</Drawer>
		</div>
	);
}
