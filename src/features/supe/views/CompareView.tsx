import { useEffect, useMemo, useState } from 'react';
import { Button, Card, Select, Spin, Table, Tag } from 'antd';
import { FilterOutlined, LineChartOutlined, SwapOutlined } from '@ant-design/icons';
import supeApi from '../api';
import { formatCurrency, formatNumber } from '../utils';
import styles from '../index.module.scss';

type CompareEntityType = 'geography' | 'sku' | 'distributor';

const ENTITY_OPTIONS = [
	{ label: 'Geography', value: 'geography' },
	{ label: 'SKU', value: 'sku' },
	{ label: 'Distributor', value: 'distributor' }
];

const TIME_OPTIONS = [
	{ label: 'Today', value: 'today' },
	{ label: 'MTD', value: 'mtd' },
	{ label: 'Last 7 Days', value: 'last7d' },
	{ label: 'Last 30 Days', value: 'last30d' },
	{ label: 'Last 90 Days', value: 'last90d' }
];

const METRIC_OPTIONS: Record<CompareEntityType, Array<{ label: string; value: string; unit: 'currency' | 'number' | 'percent' }>> = {
	geography: [
		{ label: 'Revenue', value: 'revenue', unit: 'currency' },
		{ label: 'Collection', value: 'collection', unit: 'currency' },
		{ label: 'Orders', value: 'orders', unit: 'number' },
		{ label: 'Coverage', value: 'coverage', unit: 'percent' }
	],
	sku: [
		{ label: 'Revenue', value: 'revenue', unit: 'currency' },
		{ label: 'Units', value: 'qty', unit: 'number' },
		{ label: 'Penetration', value: 'penetration', unit: 'percent' },
		{ label: 'Growth', value: 'growth', unit: 'percent' }
	],
	distributor: [
		{ label: 'Revenue', value: 'revenue', unit: 'currency' },
		{ label: 'Orders', value: 'orders', unit: 'number' },
		{ label: 'Fulfilment', value: 'fulfilmentRate', unit: 'percent' },
		{ label: 'Damage', value: 'damage', unit: 'percent' }
	]
};

function extractEntity(entityType: CompareEntityType, row: any) {
	if (entityType === 'geography') {
		return { id: String(row.id), name: row.name || row.region || row.zone || String(row.id) };
	}
	if (entityType === 'sku') {
		return { id: String(row.skuId), name: row.skuName || row.sku || String(row.skuId) };
	}
	return { id: String(row.distributorId), name: row.distributorName || String(row.distributorId) };
}

function formatMetricValue(metricKey: string, value: number, entityType: CompareEntityType) {
	const definition = (METRIC_OPTIONS[entityType] || []).find((option) => option.value === metricKey);
	if (!definition) {
		return formatNumber(value, 2);
	}
	if (definition.unit === 'currency') {
		return formatCurrency(value);
	}
	if (definition.unit === 'percent') {
		return `${formatNumber(value, 2)}%`;
	}
	return formatNumber(value, 0);
}

export function CompareView() {
	const [entityType, setEntityType] = useState<CompareEntityType>('geography');
	const [timeRange, setTimeRange] = useState('mtd');
	const [loadingEntities, setLoadingEntities] = useState(true);
	const [entityOptions, setEntityOptions] = useState<Array<{ id: string; name: string }>>([]);
	const [selectedEntityIds, setSelectedEntityIds] = useState<string[]>([]);
	const [selectedMetrics, setSelectedMetrics] = useState<string[]>(METRIC_OPTIONS.geography.map((item) => item.value));
	const [compareLoading, setCompareLoading] = useState(false);
	const [compareError, setCompareError] = useState('');
	const [compareData, setCompareData] = useState<any>(null);

	useEffect(() => {
		setSelectedMetrics(METRIC_OPTIONS[entityType].map((item) => item.value));
		setSelectedEntityIds([]);
		setCompareData(null);
	}, [entityType]);

	useEffect(() => {
		let active = true;
		const loadEntities = async () => {
			try {
				setLoadingEntities(true);
				setCompareError('');
				const response = await supeApi.getObserveEntityList(entityType, {
					timeRange,
					limit: 500,
					page: 1
				});
				if (!active) {
					return;
				}
				const rows = response?.data?.data || [];
				const options = rows.map((row: any) => extractEntity(entityType, row));
				setEntityOptions(options);
			} catch (err: any) {
				if (!active) {
					return;
				}
				setCompareError(err?.response?.data?.message || 'Failed to load compare entities');
			} finally {
				if (active) {
					setLoadingEntities(false);
				}
			}
		};

		loadEntities();
		return () => {
			active = false;
		};
	}, [entityType, timeRange]);

	const runCompare = async () => {
		if (selectedEntityIds.length < 2) {
			setCompareError('Select at least 2 entities to compare');
			return;
		}
		if (!selectedMetrics.length) {
			setCompareError('Select at least 1 metric');
			return;
		}

		try {
			setCompareLoading(true);
			setCompareError('');
			const response = await supeApi.compareEntities({
				entityType,
				entityIds: selectedEntityIds,
				metrics: selectedMetrics,
				timeRange
			});
			setCompareData(response?.data?.data || null);
		} catch (err: any) {
			setCompareError(err?.response?.data?.message || 'Failed to compare entities');
			setCompareData(null);
		} finally {
			setCompareLoading(false);
		}
	};

	const resultColumns = useMemo(() => {
		const columns: any[] = [
			{ title: 'Entity', dataIndex: 'name', key: 'name', fixed: 'left', width: 220 }
		];

		selectedMetrics.forEach((metricKey) => {
			const definition = (METRIC_OPTIONS[entityType] || []).find((option) => option.value === metricKey);
			columns.push({
				title: definition?.label || metricKey,
				key: metricKey,
				render: (_: unknown, row: any) => formatMetricValue(metricKey, Number(row.metrics?.[metricKey] || 0), entityType)
			});
		});
		return columns;
	}, [selectedMetrics, entityType]);

	return (
		<div className={styles.comparePage}>
			<div className={styles.compareHero}>
				<div>
					<div className={styles.compareHeroTitle}>
						<SwapOutlined /> <h2>Compare</h2>
					</div>
					<p>Compare entity performance using live OMS supe metrics.</p>
				</div>
			</div>

			<Card className={styles.compareCard} bordered={false}>
				<div className={styles.compareToolbar}>
					<Select
						value={entityType}
						onChange={(value) => setEntityType(value)}
						options={ENTITY_OPTIONS}
						style={{ minWidth: 180 }}
					/>
					<Select value={timeRange} onChange={setTimeRange} options={TIME_OPTIONS} style={{ minWidth: 160 }} />
					<Select
						mode="multiple"
						value={selectedEntityIds}
						onChange={(ids) => setSelectedEntityIds(ids as string[])}
						style={{ minWidth: 320, flex: 1 }}
						placeholder={loadingEntities ? 'Loading entities...' : 'Select entities'}
						loading={loadingEntities}
						options={entityOptions.map((item) => ({ label: item.name, value: item.id }))}
					/>
					<Select
						mode="multiple"
						value={selectedMetrics}
						onChange={(metrics) => setSelectedMetrics(metrics as string[])}
						style={{ minWidth: 280 }}
						placeholder="Select metrics"
						options={METRIC_OPTIONS[entityType].map((item) => ({ label: item.label, value: item.value }))}
					/>
					<Button type="primary" icon={<LineChartOutlined />} onClick={runCompare} loading={compareLoading}>
						Compare
					</Button>
				</div>
				{compareError && <div style={{ marginTop: 12 }}>{compareError}</div>}
			</Card>

			{compareLoading ? (
				<Card className={styles.compareCard} bordered={false}>
					<Spin />
				</Card>
			) : compareData ? (
				<>
					<Card className={styles.compareCard} bordered={false}>
						<div className={styles.compareCardHead}>
							<div>
								<h3>
									<FilterOutlined /> Summary
								</h3>
							</div>
						</div>
						<div className={styles.compareChipRow}>
							{(compareData.summary || []).map((metric: any) => (
								<Tag key={metric.metric} className={styles.compareEntityChip}>
									{metric.metric}: avg {formatMetricValue(metric.metric, Number(metric.average || 0), entityType)} · min{' '}
									{formatMetricValue(metric.metric, Number(metric.min || 0), entityType)} · max{' '}
									{formatMetricValue(metric.metric, Number(metric.max || 0), entityType)}
								</Tag>
							))}
						</div>
					</Card>

					<Card className={styles.compareCard} bordered={false}>
						<Table
							rowKey="id"
							columns={resultColumns}
							dataSource={compareData.entities || []}
							pagination={false}
							scroll={{ x: 1000 }}
						/>
					</Card>
				</>
			) : null}
		</div>
	);
}
