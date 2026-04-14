import { ArrowDownOutlined, ArrowUpOutlined } from '@ant-design/icons';
import type { ExploreColumn } from './components/ExploreDataTable';
import styles from './explore.module.scss';
import { formatCurrency, formatDateTime, formatNumber } from './utils';

export type ExploreEntityType = 'salesman' | 'retailer' | 'beat' | 'sku' | 'distributor';

function renderDelta(current: number, previous: number) {
	if (!previous || Number(current || 0) === Number(previous || 0)) {
		return null;
	}
	return Number(current || 0) > Number(previous || 0) ? (
		<ArrowUpOutlined className={styles.deltaArrowUp} />
	) : (
		<ArrowDownOutlined className={styles.deltaArrowDown} />
	);
}

function renderCurrencyWithDelta(current: number, previous: number) {
	return (
		<span className={styles.deltaWrap}>
			<span>{formatCurrency(current)}</span>
			{renderDelta(current, previous)}
		</span>
	);
}

function coveragePercent(visited: number, total: number) {
	return total > 0 ? (visited * 100) / total : 0;
}

function revenuePerOutlet(revenue: number, outletsVisited: number) {
	return outletsVisited > 0 ? revenue / outletsVisited : 0;
}

function avgOrderValue(revenue: number, orders: number) {
	return orders > 0 ? revenue / orders : 0;
}

function collectionRatio(collection: number, revenue: number) {
	return revenue > 0 ? (collection * 100) / revenue : 0;
}

function storesPerDay(outletsVisited: number, dayCount: number) {
	return dayCount > 0 ? outletsVisited / dayCount : 0;
}

function colorForPercent(value: number, good = 90, warning = 75) {
	if (value >= good) return styles.explorePositiveText;
	if (value >= warning) return styles.exploreWarningText;
	return styles.exploreDangerText;
}

export function getExploreColumns(entityType: ExploreEntityType, timeSuffix: string, dayCount: number): ExploreColumn<any>[] {
	if (entityType === 'salesman') {
		return [
			{
				key: 'name',
				label: 'Name',
				category: 'Identity',
				defaultVisible: true,
				render: (row) => <span>{row.name}</span>,
				sortValue: (row) => row.name
			},
			{
				key: 'revenueMTD',
				label: `Revenue ${timeSuffix}`,
				category: 'Revenue',
				defaultVisible: true,
				align: 'right',
				render: (row) => renderCurrencyWithDelta(row.revenueMTD, row.previousRevenueMTD),
				sortValue: (row) => Number(row.revenueMTD || 0),
				aggregate: 'sum'
			},
			{
				key: 'collectionMTD',
				label: `Collection ${timeSuffix}`,
				category: 'Revenue',
				defaultVisible: true,
				align: 'right',
				render: (row) => renderCurrencyWithDelta(row.collectionMTD, row.previousCollectionMTD),
				sortValue: (row) => Number(row.collectionMTD || 0),
				aggregate: 'sum'
			},
			{
				key: 'ordersMTD',
				label: `Orders ${timeSuffix}`,
				category: 'Revenue',
				defaultVisible: false,
				align: 'right',
				render: (row) => formatNumber(row.ordersMTD),
				sortValue: (row) => Number(row.ordersMTD || 0),
				aggregate: 'sum'
			},
			{
				key: 'avgOrderValue',
				label: `Avg Order Value ${timeSuffix}`,
				category: 'Revenue',
				defaultVisible: false,
				align: 'right',
				render: (row) => formatCurrency(avgOrderValue(row.revenueMTD, row.ordersMTD)),
				sortValue: (row) => avgOrderValue(row.revenueMTD, row.ordersMTD)
			},
			{
				key: 'collectionRatio',
				label: 'Collection Ratio',
				category: 'Revenue',
				defaultVisible: false,
				align: 'center',
				render: (row) => {
					const value = collectionRatio(row.collectionMTD, row.revenueMTD);
					return <span className={colorForPercent(value, 90, 75)}>{formatNumber(value, 0)}%</span>;
				},
				sortValue: (row) => collectionRatio(row.collectionMTD, row.revenueMTD)
			},
			{
				key: 'revenuePerOutlet',
				label: `Rev / Outlet ${timeSuffix}`,
				category: 'Productivity',
				defaultVisible: true,
				align: 'right',
				render: (row) => formatCurrency(revenuePerOutlet(row.revenueMTD, row.outletsVisited)),
				sortValue: (row) => revenuePerOutlet(row.revenueMTD, row.outletsVisited)
			},
			{
				key: 'storesPerDay',
				label: 'Stores / Day',
				category: 'Productivity',
				defaultVisible: true,
				align: 'center',
				render: (row) => formatNumber(storesPerDay(row.outletsVisited, dayCount), 1),
				sortValue: (row) => storesPerDay(row.outletsVisited, dayCount)
			},
			{
				key: 'coverage',
				label: `Coverage ${timeSuffix}`,
				category: 'Activity',
				defaultVisible: false,
				align: 'center',
				render: (row) => `${formatNumber(row.outletsVisited)}/${formatNumber(row.outletsTotal)}`,
				sortValue: (row) => Number(row.outletsVisited || 0)
			},
			{
				key: 'coveragePct',
				label: 'Coverage %',
				category: 'Activity',
				defaultVisible: false,
				align: 'center',
				render: (row) => {
					const value = coveragePercent(row.outletsVisited, row.outletsTotal);
					return <span className={colorForPercent(value, 85, 70)}>{formatNumber(value, 0)}%</span>;
				},
				sortValue: (row) => coveragePercent(row.outletsVisited, row.outletsTotal)
			},
			{
				key: 'beatAdherence',
				label: 'Beat Adherence',
				category: 'Activity',
				defaultVisible: true,
				align: 'center',
				render: (row) => (
					<span className={colorForPercent(Number(row.beatAdherence || 0), 90, 75)}>
						{formatNumber(row.beatAdherence, 0)}%
					</span>
				),
				sortValue: (row) => Number(row.beatAdherence || 0)
			},
			{
				key: 'route',
				label: 'Route',
				category: 'Context',
				defaultVisible: false,
				render: (row) => <span className={styles.exploreMutedText}>{row.route || '-'}</span>,
				sortValue: (row) => row.route
			},
			{
				key: 'manager',
				label: 'Manager',
				category: 'Context',
				defaultVisible: false,
				render: (row) => <span className={styles.exploreMutedText}>{row.manager || '-'}</span>,
				sortValue: (row) => row.manager
			},
			{
				key: 'distributor',
				label: 'Distributor',
				category: 'Context',
				defaultVisible: false,
				render: (row) => <span className={styles.exploreMutedText}>{row.distributor || '-'}</span>,
				sortValue: (row) => row.distributor
			},
			{
				key: 'lastActive',
				label: 'Last Active',
				category: 'Context',
				defaultVisible: false,
				align: 'center',
				render: (row) => <span className={styles.exploreMutedText}>{formatDateTime(row.lastActive)}</span>,
				sortValue: (row) => row.lastActive || ''
			},
			{
				key: 'code',
				label: 'Employee Code',
				category: 'Identity',
				defaultVisible: true,
				render: (row) => <span className={styles.exploreMutedText}>{row.code || '-'}</span>,
				sortValue: (row) => row.code
			}
		];
	}

	if (entityType === 'retailer') {
		return [
			{ key: 'name', label: 'Retailer Name', category: 'Identity', defaultVisible: true, render: (row) => <span>{row.name}</span>, sortValue: (row) => row.name },
			{ key: 'code', label: 'Outlet Code', category: 'Identity', defaultVisible: true, render: (row) => <span className={styles.exploreMutedText}>{row.code || '-'}</span>, sortValue: (row) => row.code },
			{ key: 'lastOrderDate', label: 'Last Order', category: 'Orders', defaultVisible: true, align: 'center', render: (row) => row.lastOrderDate || '-', sortValue: (row) => row.lastOrderDate || '' },
			{ key: 'daysSinceOrder', label: 'Days Since', category: 'Orders', defaultVisible: true, align: 'center', render: (row) => `${formatNumber(row.dormancyDays)}d`, sortValue: (row) => Number(row.dormancyDays || 0) },
			{ key: 'lastBillValue', label: 'Last Bill', category: 'Orders', defaultVisible: false, align: 'right', render: (row) => formatCurrency(row.lastBillValue), sortValue: (row) => Number(row.lastBillValue || 0) },
			{ key: 'aov', label: 'AOV', category: 'Orders', defaultVisible: true, align: 'right', render: (row) => formatCurrency(row.aov), sortValue: (row) => Number(row.aov || 0) },
			{ key: 'repeatOrderFrequency', label: 'Frequency', category: 'Orders', defaultVisible: true, align: 'center', render: (row) => `${formatNumber(row.repeatOrderFrequency, 1)}d`, sortValue: (row) => Number(row.repeatOrderFrequency || 0) },
			{
				key: 'monthlyPotential',
				label: 'Monthly Potential',
				category: 'Potential',
				defaultVisible: false,
				align: 'right',
				render: (row) => {
					const idealFrequency = 3;
					const potential = row.aov * (30 / idealFrequency);
					return formatCurrency(potential);
				},
				sortValue: (row) => row.aov * 10
			},
			{ key: 'outstanding', label: 'Outstanding', category: 'Finance', defaultVisible: true, align: 'right', render: (row) => formatCurrency(row.outstanding), sortValue: (row) => Number(row.outstanding || 0), aggregate: 'sum' },
			{ key: 'salesman', label: 'Salesman', category: 'Context', defaultVisible: false, render: (row) => <span className={styles.exploreMutedText}>{row.salesman || '-'}</span>, sortValue: (row) => row.salesman },
			{ key: 'distributor', label: 'Distributor', category: 'Context', defaultVisible: false, render: (row) => <span className={styles.exploreMutedText}>{row.distributor || '-'}</span>, sortValue: (row) => row.distributor }
		];
	}

	if (entityType === 'beat') {
		return [
			{ key: 'beatName', label: 'Beat', category: 'Identity', defaultVisible: true, render: (row) => <span>{row.beatName}</span>, sortValue: (row) => row.beatName },
			{ key: 'revenueMTD', label: `Revenue ${timeSuffix}`, category: 'Revenue', defaultVisible: true, align: 'right', render: (row) => formatCurrency(row.revenueMTD), sortValue: (row) => Number(row.revenueMTD || 0), aggregate: 'sum' },
			{ key: 'ebv', label: 'EBV', category: 'Revenue', defaultVisible: true, align: 'right', render: (row) => formatCurrency(row.ebv), sortValue: (row) => Number(row.ebv || 0), aggregate: 'sum' },
			{
				key: 'realizedValue',
				label: 'Realized',
				category: 'Revenue',
				defaultVisible: false,
				align: 'right',
				render: (row) => formatCurrency(row.revenueMTD),
				sortValue: (row) => Number(row.revenueMTD || 0)
			},
			{ key: 'activeOutlets', label: 'Active / Total', category: 'Activity', defaultVisible: true, align: 'center', render: (row) => `${formatNumber(row.activeOutlets)}/${formatNumber(row.totalOutlets)}`, sortValue: (row) => Number(row.activeOutlets || 0) },
			{ key: 'coveragePct', label: 'Coverage %', category: 'Activity', defaultVisible: false, align: 'center', render: (row) => `${formatNumber(row.coveragePct, 0)}%`, sortValue: (row) => Number(row.coveragePct || 0) },
			{ key: 'realizationPct', label: '% Realized', category: 'Activity', defaultVisible: true, align: 'center', render: (row) => `${formatNumber(row.realizationPct, 0)}%`, sortValue: (row) => Number(row.realizationPct || 0) },
			{ key: 'code', label: 'Beat Code', category: 'Identity', defaultVisible: true, render: (row) => <span className={styles.exploreMutedText}>{row.code || '-'}</span>, sortValue: (row) => row.code },
			{ key: 'salesman', label: 'Salesman', category: 'Context', defaultVisible: false, render: (row) => <span className={styles.exploreMutedText}>{row.salesman || '-'}</span>, sortValue: (row) => row.salesman },
			{ key: 'distributor', label: 'Distributor', category: 'Context', defaultVisible: false, render: (row) => <span className={styles.exploreMutedText}>{row.distributor || '-'}</span>, sortValue: (row) => row.distributor }
		];
	}

	if (entityType === 'sku') {
		return [
			{ key: 'skuName', label: 'SKU', category: 'Identity', defaultVisible: true, render: (row) => <span>{row.skuName}</span>, sortValue: (row) => row.skuName },
			{ key: 'code', label: 'SKU Code', category: 'Identity', defaultVisible: true, render: (row) => <span className={styles.exploreMutedText}>{row.code || '-'}</span>, sortValue: (row) => row.code },
			{ key: 'category', label: 'Brand', category: 'Identity', defaultVisible: false, render: (row) => <span className={styles.exploreMutedText}>{row.category || '-'}</span>, sortValue: (row) => row.category },
			{ key: 'revenueMTD', label: `Revenue ${timeSuffix}`, category: 'Revenue', defaultVisible: true, align: 'right', render: (row) => formatCurrency(row.revenueMTD), sortValue: (row) => Number(row.revenueMTD || 0), aggregate: 'sum' },
			{ key: 'unitsMTD', label: `Units ${timeSuffix}`, category: 'Revenue', defaultVisible: true, align: 'right', render: (row) => formatNumber(row.unitsMTD), sortValue: (row) => Number(row.unitsMTD || 0), aggregate: 'sum' },
			{ key: 'outletsMTD', label: `Outlets ${timeSuffix}`, category: 'Activity', defaultVisible: true, align: 'right', render: (row) => formatNumber(row.outletsMTD), sortValue: (row) => Number(row.outletsMTD || 0) },
			{ key: 'penetrationPct', label: 'Penetration %', category: 'Activity', defaultVisible: true, align: 'center', render: (row) => `${formatNumber(row.penetrationPct, 0)}%`, sortValue: (row) => Number(row.penetrationPct || 0) },
			{
				key: 'growthPct',
				label: 'Growth %',
				category: 'Activity',
				defaultVisible: true,
				align: 'center',
				render: (row) => (
					<span className={Number(row.growthPct || 0) >= 0 ? styles.explorePositiveText : styles.exploreDangerText}>
						{formatNumber(row.growthPct, 1)}%
					</span>
				),
				sortValue: (row) => Number(row.growthPct || 0)
			}
		];
	}

	return [
		{ key: 'distributorName', label: 'Distributor', category: 'Identity', defaultVisible: true, render: (row) => <span>{row.distributorName}</span>, sortValue: (row) => row.distributorName },
		{ key: 'code', label: 'Distributor Code', category: 'Identity', defaultVisible: true, render: (row) => <span className={styles.exploreMutedText}>{row.code || '-'}</span>, sortValue: (row) => row.code },
		{ key: 'revenueMTD', label: `Revenue ${timeSuffix}`, category: 'Revenue', defaultVisible: true, align: 'right', render: (row) => formatCurrency(row.revenueMTD), sortValue: (row) => Number(row.revenueMTD || 0), aggregate: 'sum' },
		{ key: 'ordersMTD', label: `Orders ${timeSuffix}`, category: 'Revenue', defaultVisible: false, align: 'right', render: (row) => formatNumber(row.ordersMTD), sortValue: (row) => Number(row.ordersMTD || 0), aggregate: 'sum' },
		{ key: 'activeSalesmen', label: 'Active Salesmen', category: 'Network', defaultVisible: true, align: 'center', render: (row) => formatNumber(row.activeSalesmen), sortValue: (row) => Number(row.activeSalesmen || 0) },
		{ key: 'activeOutlets', label: 'Active Outlets', category: 'Network', defaultVisible: true, align: 'center', render: (row) => formatNumber(row.activeOutlets), sortValue: (row) => Number(row.activeOutlets || 0) },
		{ key: 'outstanding', label: 'Outstanding', category: 'Finance', defaultVisible: true, align: 'right', render: (row) => formatCurrency(row.outstanding), sortValue: (row) => Number(row.outstanding || 0), aggregate: 'sum' },
		{ key: 'fulfilmentPct', label: 'Fulfilment %', category: 'Operations', defaultVisible: false, align: 'center', render: (row) => `${formatNumber(row.fulfilmentPct, 1)}%`, sortValue: (row) => Number(row.fulfilmentPct || 0) },
		{ key: 'damagePct', label: 'Damage %', category: 'Operations', defaultVisible: false, align: 'center', render: (row) => `${formatNumber(row.damagePct, 1)}%`, sortValue: (row) => Number(row.damagePct || 0) }
	];
}
