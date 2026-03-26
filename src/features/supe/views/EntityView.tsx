import { useEffect, useMemo, useState } from 'react';
import { Button, Drawer, Spin, Table, Tag, message } from 'antd';
import {
	CloseOutlined,
	EnvironmentOutlined,
	EyeOutlined,
	LineChartOutlined,
	SearchOutlined,
	ThunderboltOutlined
} from '@ant-design/icons';
import supeApi from '../api';
import { formatCurrencyLakhs, formatNumber } from '../utils';
import sharedStyles from '../index.module.scss';
import exploreStyles from '../explore.module.scss';
import ActionDrawer from '../components/ActionDrawer';
import ExploreDataTable from '../components/ExploreDataTable';
import ExploreLensesBar from '../components/ExploreLensesBar';
import { getExploreColumns, type ExploreEntityType } from '../exploreColumnCatalog';
import type { ActionTarget } from '../actionTypes';

interface IEntityViewProps {
	entityType: ExploreEntityType;
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
	{ label: 'None', value: '' },
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

function getPrimaryMetricKey(entityType: ExploreEntityType) {
	if (entityType === 'retailer') return 'aov';
	return 'revenueMTD';
}

function getTimeLabel(value: string) {
	return TIME_OPTIONS.find((option) => option.value === value)?.label || value;
}

function toCsvValue(value: unknown) {
	if (value === null || value === undefined) {
		return '';
	}
	if (typeof value === 'number' || typeof value === 'boolean') {
		return String(value);
	}
	return JSON.stringify(String(value));
}

export function EntityView({ entityType, title }: IEntityViewProps) {
	const [rows, setRows] = useState<RowRecord[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState('');
	const [search, setSearch] = useState('');
	const [territory, setTerritory] = useState('all');
	const [timeWindow, setTimeWindow] = useState('mtd');
	const [showBy, setShowBy] = useState('all');
	const [groupBy, setGroupBy] = useState('');
	const [selectedInsightRow, setSelectedInsightRow] = useState<RowRecord | null>(null);
	const [insightLoading, setInsightLoading] = useState(false);
	const [insightError, setInsightError] = useState('');
	const [insightData, setInsightData] = useState<RowRecord | null>(null);
	const [actionDrawerOpen, setActionDrawerOpen] = useState(false);
	const [actionContext, setActionContext] = useState<any>(null);
	const [meta, setMeta] = useState<{ total: number; periodLabel: string; dayCount: number }>({
		total: 0,
		periodLabel: '-',
		dayCount: 0
	});

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
				setRows(response?.data?.data || []);
				setMeta({
					total: Number(response?.data?.meta?.total || 0),
					periodLabel: response?.data?.meta?.periodLabel || '-',
					dayCount: Number(response?.data?.meta?.dayCount || 0)
				});
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
		return [{ label: 'All India', value: 'all' }, ...zones.map((zone) => ({ label: zone, value: String(zone) }))];
	}, [rows]);

	const filteredRows = useMemo(() => {
		let nextRows = [...rows];
		if (territory !== 'all') {
			nextRows = nextRows.filter((row) => row.zone === territory);
		}
		if (search.trim()) {
			const lowered = search.toLowerCase();
			nextRows = nextRows.filter((row) =>
				Object.values(row).some((value) => String(value ?? '').toLowerCase().includes(lowered))
			);
		}
		return nextRows;
	}, [rows, territory, search]);

	const presentedRows = useMemo(() => {
		let nextRows = [...filteredRows];
		const primaryMetricKey = getPrimaryMetricKey(entityType);
		const limit = extractShowLimit(showBy);
		const sortedByMetric = [...nextRows].sort(
			(left, right) => Number(right[primaryMetricKey] || 0) - Number(left[primaryMetricKey] || 0)
		);

		if (showBy.startsWith('top')) {
			nextRows = sortedByMetric.slice(0, limit);
		}
		if (showBy.startsWith('bottom')) {
			nextRows = sortedByMetric.reverse().slice(0, limit);
		}
		return nextRows;
	}, [entityType, filteredRows, showBy]);

	const columns = useMemo(
		() => getExploreColumns(entityType, timeWindow === 'today' ? 'Today' : 'MTD', Math.max(meta.dayCount, 1)),
		[entityType, meta.dayCount, timeWindow]
	);

	const entityLabel = title.replace(' Performance', '').replace(' Health', '').replace(' Operations', '');

	const handleOpenAction = (row: RowRecord) => {
		setActionContext({
			sourceKind: 'manual',
			sourceEntityType: entityType,
			sourceEntityId: String(row.id),
			sourceEntityName: getName(row),
			title: `Action for ${getName(row)}`,
			targets: [{ entityType, entityId: String(row.id), entityName: getName(row) } satisfies ActionTarget]
		});
		setActionDrawerOpen(true);
	};

	const exportCsv = () => {
		try {
			const header = columns.map((column) => column.label).join(',');
			const body = presentedRows.map((row) =>
				columns
					.map((column) => {
						const value = column.sortValue ? column.sortValue(row) : row[column.key];
						return toCsvValue(value);
					})
					.join(',')
			);
			const blob = new Blob([[header, ...body].join('\n')], { type: 'text/csv;charset=utf-8;' });
			const url = URL.createObjectURL(blob);
			const link = document.createElement('a');
			link.href = url;
			link.download = `${entityType}-diagnostics.csv`;
			link.click();
			URL.revokeObjectURL(url);
		} catch {
			message.error('Failed to export CSV');
		}
	};

	return (
		<div className={exploreStyles.explorePage}>
			<div className={exploreStyles.exploreHeaderRow}>
				<div className={exploreStyles.exploreHeaderLeft}>
					<div className={exploreStyles.exploreTrail}>
						<EyeOutlined className={exploreStyles.exploreHeaderIcon} />
						<span>Explore</span>
						<span className={exploreStyles.exploreTrailDivider}>›</span>
						<strong>{entityLabel}</strong>
					</div>
					<span className={exploreStyles.exploreHeaderMeta}>· {meta.periodLabel || getTimeLabel(timeWindow)}</span>
					<span className={exploreStyles.exploreCountChip}>{presentedRows.length} rows</span>
				</div>
				<div className={exploreStyles.exploreSearchWrap}>
					<div className={exploreStyles.exploreSearchBox}>
						<SearchOutlined className={exploreStyles.exploreSearchIcon} />
						<input
							value={search}
							onChange={(event) => setSearch(event.target.value)}
							placeholder={`Search ${entityType}...`}
							className={exploreStyles.exploreSearchInput}
						/>
					</div>
				</div>
			</div>

			<ExploreLensesBar
				territory={territory}
				territoryOptions={territoryOptions}
				timeWindow={timeWindow}
				timeOptions={TIME_OPTIONS}
				showBy={showBy}
				showOptions={SHOW_OPTIONS}
				onTerritoryChange={setTerritory}
				onTimeWindowChange={setTimeWindow}
				onShowByChange={setShowBy}
			/>

			{loading ? (
				<div className={sharedStyles.observeTableCard} style={{ padding: 32 }}>
					<Spin />
				</div>
			) : error ? (
				<div className={sharedStyles.observeTableCard} style={{ padding: 32 }}>
					{error}
				</div>
			) : (
				<ExploreDataTable
					data={presentedRows}
					columns={columns}
					groupBy={groupBy}
					groupByOptions={GROUP_OPTIONS}
					onGroupByChange={setGroupBy}
					onExport={exportCsv}
					onInsights={async (row) => {
						setSelectedInsightRow(row);
						setInsightLoading(true);
						setInsightError('');
						try {
							const response = await supeApi.getObserveEntityInsights(entityType, String(row.id), {
								timeRange: timeWindow
							});
							setInsightData(response?.data?.data || null);
						} catch (err: any) {
							setInsightError(err?.response?.data?.message || 'Failed to load insights');
							setInsightData(null);
						} finally {
							setInsightLoading(false);
						}
					}}
					onAction={handleOpenAction}
					onBulkAction={(selectedRows) => {
						setActionContext({
							sourceKind: 'manual',
							sourceEntityType: entityType,
							title: `Bulk action for ${selectedRows.length} ${entityType}`,
							targets: selectedRows.map(
								(row) =>
									({
										entityType,
										entityId: String(row.id),
										entityName: getName(row)
									}) satisfies ActionTarget
							)
						});
						setActionDrawerOpen(true);
					}}
					tableId={`explore-${entityType}`}
				/>
			)}

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
				className={sharedStyles.observeInsightsDrawer}
			>
				{selectedInsightRow ? (
					<div className={sharedStyles.observeDrawerBody}>
						<div className={sharedStyles.observeDrawerHead}>
							<div>
								<div className={sharedStyles.observeDrawerNameRow}>
									<div className={sharedStyles.observeDrawerAvatar}>
										<LineChartOutlined />
									</div>
									<div>
										<div className={sharedStyles.observeDrawerName}>
											{getName(selectedInsightRow)} <Tag>{entityLabel}</Tag>
										</div>
										<div className={sharedStyles.observeDrawerSub}>
											<EnvironmentOutlined /> {selectedInsightRow.area || '-'} · {selectedInsightRow.region || '-'} ·{' '}
											{selectedInsightRow.zone || '-'}
										</div>
									</div>
								</div>
								<div className={sharedStyles.observeDrawerMetrics}>
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
							<Button icon={<ThunderboltOutlined />} onClick={() => handleOpenAction(selectedInsightRow)}>
								Act
							</Button>
						</div>

						{insightLoading ? (
							<Spin />
						) : insightError ? (
							<div>{insightError}</div>
						) : (
							<>
								<div className={sharedStyles.observeDrawerSection}>
									<h3>Signals</h3>
									{(insightData?.insights || []).length === 0 ? (
										<p>No active signals for this entity.</p>
									) : (
										(insightData?.insights || []).map((signal: any) => (
											<div key={signal.id} className={sharedStyles.observeIntelligenceRow}>
												<div className={sharedStyles.observeIntelligenceText}>
													<span>
														<b>{signal.title}</b> {signal.detail}
													</span>
												</div>
												<Tag>{signal.severity}</Tag>
											</div>
										))
									)}
								</div>

								<div className={sharedStyles.observeDrawerSection}>
									<h3>Trend Series</h3>
									{(insightData?.trends || []).length === 0 ? (
										<p>No trend points available for this period.</p>
									) : (
										<Table
											size="small"
											pagination={false}
											dataSource={(insightData?.trends || []).map((point: any, index: number) => ({
												key: `${point.date}-${point.metric}-${index}`,
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
				) : null}
			</Drawer>

			<ActionDrawer
				open={actionDrawerOpen}
				onClose={() => setActionDrawerOpen(false)}
				context={actionContext}
				onCreated={() => setActionDrawerOpen(false)}
			/>
		</div>
	);
}
