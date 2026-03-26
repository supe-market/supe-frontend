import { useEffect, useMemo, useState } from 'react';
import { Button, Card, Spin } from 'antd';
import type { SVGProps } from 'react';
import { useNavigate } from 'react-router-dom';
import {
	DownOutlined,
	ArrowRightOutlined,
	SettingOutlined,
	ThunderboltOutlined,
	TeamOutlined,
	AimOutlined,
	ExclamationCircleOutlined,
} from '@ant-design/icons';
import supeApi from '../api';
import ActionDrawer from '../components/ActionDrawer';
import { ThresholdConfigPanel } from '../components/ThresholdConfig';
import styles from '../index.module.scss';
import {
	supeActRoute,
	supeAskRoute,
	supeBeatRoute,
	supeDistributorRoute,
	supeExploreRoute,
	supeRetailerRoute,
	supeSalesmanRoute,
	supeSummaryRoute,
	supeSkuRoute
} from '../constants';
import type { ActionContext } from '../actionTypes';

type SummaryData = Record<string, any>;

const FALLBACK_METRIC_CARDS = [
	{
		key: 'revenue',
		title: 'Revenue MTD',
		value: '₹0',
		subtitle: '0% of ₹0 target',
		accent: '#4463ea'
	},
	{
		key: 'coverage',
		title: 'Coverage',
		value: '0.0%',
		subtitle: '0 of 0 outlets visited',
		accent: '#0f9d58'
	},
	{
		key: 'collection',
		title: 'Collection',
		value: '₹0',
		subtitle: '0% of billing collected',
		accent: '#0f9d58'
	},
	{
		key: 'outstanding',
		title: 'Outstanding',
		value: '₹0',
		subtitle: 'Across 0 retailers',
		accent: '#d97706'
	}
];

const FALLBACK_PERIOD_INTELLIGENCE: any[] = [];
const ZERO_TEAM = {
	totalSalesmen: 0,
	onTarget: 0,
	atRisk: 0,
	behind: 0,
	topPerformer: { name: '-', revenue: '₹0', pct: 0 },
	bottomPerformer: { name: '-', revenue: '₹0', pct: 0 }
};
const ZERO_WHAT_CHANGED = {
	period: { current: '-', previous: '-' },
	improvingCount: 0,
	decliningCount: 0,
	flatCount: 0,
	highlights: [],
	bigMovers: []
};
const ZERO_RETAILER_HEALTH = {
	totalRetailers: 0,
	tiers: [
		{ tier: 'platinum', label: 'Platinum', count: 0, dormantCount: 0 },
		{ tier: 'gold', label: 'Gold', count: 0, dormantCount: 0 },
		{ tier: 'silver', label: 'Silver', count: 0, dormantCount: 0 },
		{ tier: 'bronze', label: 'Bronze', count: 0, dormantCount: 0 }
	]
};
const ZERO_GOALS = { count: 0, items: [] };
const ZERO_ACTIONS = { runningCount: 0, draftCount: 0, items: [] };
const ZERO_ANOMALIES = { criticalCount: 0, warningCount: 0, totalCount: 0, items: [] };

const TIER_COLORS: Record<string, string> = {
	platinum: '#8b5cf6',
	gold: '#f59e0b',
	silver: '#94a3b8',
	bronze: '#f97316'
};

const GOAL_STATUS_CLASS: Record<string, string> = {
	'On Track': styles.observeGoalFillBlue,
	'At Risk': styles.observeGoalFillAmber,
	Behind: styles.observeGoalFillRed
};

const CHANGE_SEVERITY_CLASS: Record<string, string> = {
	positive: styles.observeChangeHighlightPositive,
	negative: styles.observeChangeHighlightNegative,
	neutral: styles.observeChangeHighlightNeutral
};

function getIntelligenceActionRoute(item: Record<string, any>) {
	const key = String(item?.key || '').toLowerCase();
	if (key.includes('salesman') || key.includes('coverage')) return supeSalesmanRoute;
	if (key.includes('retailer') || key.includes('outstanding')) return supeRetailerRoute;
	if (key.includes('sku')) return supeSkuRoute;
	if (key.includes('distributor')) return supeDistributorRoute;
	if (key.includes('beat')) return supeBeatRoute;
	return '';
}

function QuickAskIcon(props: SVGProps<SVGSVGElement>) {
	return (
		<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
			<path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z" />
		</svg>
	);
}

function QuickExploreIcon(props: SVGProps<SVGSVGElement>) {
	return (
		<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
			<circle cx="11" cy="11" r="7" />
			<path d="m21 21-4.35-4.35" />
		</svg>
	);
}

function QuickActionIcon(props: SVGProps<SVGSVGElement>) {
	return (
		<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
			<path d="M13 2 4 14h6l-1 8 9-12h-6z" />
		</svg>
	);
}

function QuickTargetsIcon(props: SVGProps<SVGSVGElement>) {
	return (
		<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
			<circle cx="12" cy="12" r="9" />
			<circle cx="12" cy="12" r="5" />
			<circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" />
		</svg>
	);
}

function QuickTrajectoryIcon(props: SVGProps<SVGSVGElement>) {
	return (
		<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
			<path d="M3 17 9 11l4 4 8-8" />
			<path d="M15 7h6v6" />
		</svg>
	);
}

function getSignalRoute(item: Record<string, any>) {
	const entityType = String(item?.entityType || '').toLowerCase();
	if (entityType === 'salesman') return `${supeExploreRoute}?entity=salesman`;
	if (entityType === 'retailer') return `${supeExploreRoute}?entity=retailer`;
	if (entityType === 'sku') return `${supeExploreRoute}?entity=sku`;
	if (entityType === 'distributor') return `${supeExploreRoute}?entity=distributor`;
	if (entityType === 'beat') return `${supeExploreRoute}?entity=beat`;
	return item?.drillPath || supeSummaryRoute;
}

export function DashboardView() {
	const navigate = useNavigate();
	const [loading, setLoading] = useState(true);
	const [summaryData, setSummaryData] = useState<SummaryData | null>(null);
	const [error, setError] = useState('');
	const [thresholdOpen, setThresholdOpen] = useState(false);
	const [whatChangedOpen, setWhatChangedOpen] = useState(false);
	const [anomaliesOpen, setAnomaliesOpen] = useState(false);
	const [actionDrawerOpen, setActionDrawerOpen] = useState(false);
	const [actionContext, setActionContext] = useState<ActionContext | null>(null);

	const loadSummary = async () => {
		try {
			setLoading(true);
			setError('');
			const response = await supeApi.getObserveSummary({ timeRange: 'mtd' });
			setSummaryData(response?.data?.data || null);
		} catch (err: any) {
			setError(err?.response?.data?.message || 'Failed to load summary data');
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		let active = true;
		const loadSummarySafe = async () => {
			try {
				setLoading(true);
				setError('');
				const response = await supeApi.getObserveSummary({ timeRange: 'mtd' });
				if (!active) {
					return;
				}
				setSummaryData(response?.data?.data || null);
			} catch (err: any) {
				if (!active) {
					return;
				}
				setError(err?.response?.data?.message || 'Failed to load summary data');
			} finally {
				if (active) {
					setLoading(false);
				}
			}
		};

		loadSummarySafe();
		return () => {
			active = false;
		};
	}, []);

	const apiMetricCards = useMemo(() => summaryData?.summarySection?.metricCards || [], [summaryData]);
	const apiPeriodIntelligence = useMemo(() => summaryData?.summarySection?.periodIntelligence || [], [summaryData]);
	const briefing = summaryData?.briefing || {};
	const team = briefing.team || ZERO_TEAM;
	const retailerHealth = briefing.retailerHealth || ZERO_RETAILER_HEALTH;
	const goalsPreview = briefing.goalsPreview || ZERO_GOALS;
	const activeActions = briefing.activeActions || ZERO_ACTIONS;
	const anomalies = briefing.anomalies || ZERO_ANOMALIES;
	const topAlerts = briefing.attention || [];
	const isZeroState = apiMetricCards.length === 0 && anomalies.totalCount === 0;
	const metricCards = apiMetricCards.length > 0 ? apiMetricCards : FALLBACK_METRIC_CARDS;
	const periodIntelligence = apiPeriodIntelligence.length > 0 ? apiPeriodIntelligence : FALLBACK_PERIOD_INTELLIGENCE;

	const now = new Date();
	const fallbackDayElapsed = now.getDate();
	const fallbackDaysInPeriod = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
	const fallbackHeaderDateLabel = now.toLocaleDateString('en-IN', {
		weekday: 'long',
		day: 'numeric',
		month: 'long',
		year: 'numeric',
	});
	const rawDayElapsed = Number(summaryData?.period?.dayElapsed || 0);
	const rawDaysInPeriod = Number(summaryData?.period?.daysInPeriod || 0);
	const dayElapsed = rawDayElapsed > 0 ? rawDayElapsed : fallbackDayElapsed;
	const daysInPeriod = rawDaysInPeriod > 0 ? rawDaysInPeriod : fallbackDaysInPeriod;
	const liveSignalsCount = anomalies.totalCount || summaryData?.intelligence?.length || periodIntelligence.length || 0;
	const criticalCount = anomalies.criticalCount || periodIntelligence.filter((item: any) => item.type !== 'positive').length;
	const warningCount = anomalies.warningCount || 0;
	const periodProgress = daysInPeriod > 0 ? Math.max(0, Math.min(100, Math.round((dayElapsed * 100) / daysInPeriod))) : 0;
	const rawHeaderDateLabel = String(summaryData?.period?.dateLabel || '-').trim();
	const headerDateLabel = rawHeaderDateLabel && rawHeaderDateLabel !== '-' ? rawHeaderDateLabel : fallbackHeaderDateLabel;
	const fallbackCurrentPeriodLabel = now.toLocaleDateString('en-IN', {
		month: 'short',
		year: 'numeric',
	});
	const fallbackPreviousDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
	const fallbackPreviousPeriodLabel = fallbackPreviousDate.toLocaleDateString('en-IN', {
		month: 'short',
		year: 'numeric',
	});
	const rawWhatChanged = briefing.whatChanged || ZERO_WHAT_CHANGED;
	const rawCurrentChangeLabel = String(rawWhatChanged?.period?.current || '-').trim();
	const rawPreviousChangeLabel = String(rawWhatChanged?.period?.previous || '-').trim();
	const whatChanged = {
		...rawWhatChanged,
		period: {
			current: rawCurrentChangeLabel && rawCurrentChangeLabel !== '-' ? rawCurrentChangeLabel : fallbackCurrentPeriodLabel,
			previous: rawPreviousChangeLabel && rawPreviousChangeLabel !== '-' ? rawPreviousChangeLabel : fallbackPreviousPeriodLabel
		}
	};

	const openActionComposer = (context: ActionContext) => {
		setActionContext(context);
		setActionDrawerOpen(true);
	};

	if (loading) {
		return (
			<div className={styles.observeSummaryPage}>
				<Card className={styles.observeSectionCard} bordered={false}>
					<Spin />
				</Card>
			</div>
		);
	}

	if (error) {
		return (
			<div className={styles.observeSummaryPage}>
				<Card className={styles.observeSectionCard} bordered={false}>
					<div>{error}</div>
				</Card>
			</div>
		);
	}

	return (
		<div className={styles.observeSummaryPage}>
			<div className={styles.observeBriefingHero}>
				<div className={styles.observeBriefingHeroInner}>
					<div>
						<div className={styles.observeBriefingTitle}>Morning Briefing</div>
						<div className={styles.observeBriefingMeta}>
							<span>{headerDateLabel}</span>
							<span>·</span>
							<span>Day {dayElapsed} of {daysInPeriod}</span>
							<div className={styles.observeBriefingProgressTrack}>
								<i style={{ width: `${periodProgress}%` }} />
							</div>
						</div>
					</div>
					<div className={styles.observeBriefingBadges}>
						{criticalCount > 0 ? (
							<div className={styles.observeBadgeCritical}>
								<i />
								{criticalCount}
							</div>
						) : null}
						{warningCount > 0 ? (
							<div className={styles.observeBadgeWarning}>
								<i />
								{warningCount}
							</div>
						) : null}
						<div className={styles.observeBadgeControl}>{liveSignalsCount} signals</div>
						<button
							type="button"
							className={styles.observeThresholdButton}
							onClick={() => setThresholdOpen(true)}
						>
							<SettingOutlined />
							Thresholds
						</button>
					</div>
				</div>
			</div>

			<div className={styles.observeBriefingContent}>
				<div className={styles.observeScorecardRow}>
					{metricCards.slice(0, 4).map((metric: any) => (
						<div className={styles.observeScorecard} key={metric.key}>
							<div className={styles.observeScorecardLabel}>{metric.title}</div>
							<div className={styles.observeScorecardValue} style={{ color: metric.accent }}>
								{metric.value}
							</div>
							<div className={styles.observeScorecardSub}>{metric.subtitle}</div>
							{metric.note ? <div className={styles.observeScorecardNote}>{metric.note}</div> : null}
						</div>
					))}
				</div>

				<div className={styles.observeAttentionCard}>
					<div className={styles.observeAttentionHeader}>
						<span className={styles.observeAttentionIcon}>
							<ThunderboltOutlined />
						</span>
						<span>Needs Attention</span>
					</div>
					{topAlerts.length > 0 ? (
						topAlerts.map((item: any) => (
							<div
								key={item.id || item.key}
								className={styles.observeAttentionRow}
								onClick={() => navigate(getSignalRoute(item) || getIntelligenceActionRoute(item) || supeSummaryRoute)}
								role="button"
								tabIndex={0}
								onKeyDown={(event) => {
									if (event.key === 'Enter' || event.key === ' ') {
										navigate(getSignalRoute(item) || getIntelligenceActionRoute(item) || supeSummaryRoute);
									}
								}}
							>
								<div className={styles.observeAttentionText}>
									<i
										className={
											item.severity === 'warning'
												? styles.observeAttentionDotWarning
												: item.severity === 'info'
													? styles.observeAttentionDotInfo
													: styles.observeAttentionDotCritical
										}
									/>
									<span>
										{item.label} {item.detail ? <b>{item.detail}</b> : null}
									</span>
								</div>
								<button
									type="button"
									className={styles.observeInlineAction}
									onClick={(event) => {
										event.stopPropagation();
										openActionComposer({
											sourceKind: 'signal',
											sourceKey: item.sourceKey || item.key || null,
											sourceEntityType: item.entityType || null,
											sourceEntityId: item.entityId || null,
											sourceEntityName: item.entityName || item.label || null,
											title: item.label,
											note: item.detail,
											askQuery: item.label,
											targets:
												item.entityId && item.entityType
													? [{ entityType: item.entityType, entityId: String(item.entityId), entityName: item.entityName || item.label }]
													: []
										});
									}}
								>
									Act
								</button>
								<ArrowRightOutlined className={styles.observeAttentionChevron} />
							</div>
						))
					) : (
						<div className={`${styles.observeAttentionRow} ${styles.observeAttentionRowStatic}`}>
							<div className={styles.observeAttentionText}>
								<i className={styles.observeAttentionDotPositive} />
								<span>No active signals for this period</span>
							</div>
						</div>
					)}
				</div>

				<button
					type="button"
					className={styles.observeTeamCard}
					onClick={() => navigate(`${supeExploreRoute}?entity=salesman`)}
				>
					<div className={styles.observeTeamHeader}>
						<div className={styles.observeBriefingSectionTitleWrap}>
							<div className={`${styles.observeBriefingSectionIcon} ${styles.observeBriefingSectionIconNeutral}`}>
								<TeamOutlined />
							</div>
							<div className={styles.observeTeamLabel}>
								<span>Team</span>
								<small>{team.totalSalesmen} salesmen</small>
							</div>
						</div>
						<div className={styles.observeTeamTrackInline}>
							<i className={styles.observeTeamTrackGood} style={{ width: `${team.totalSalesmen ? (team.onTarget * 100) / team.totalSalesmen : 0}%` }} />
							<i className={styles.observeTeamTrackWarn} style={{ width: `${team.totalSalesmen ? (team.atRisk * 100) / team.totalSalesmen : 0}%` }} />
							<i className={styles.observeTeamTrackBad} style={{ width: `${team.totalSalesmen ? (team.behind * 100) / team.totalSalesmen : 0}%` }} />
						</div>
						<div className={styles.observeTeamLegend}>
							<span><i className={styles.observeTeamDotGood} /> {team.onTarget}</span>
							<span><i className={styles.observeTeamDotWarn} /> {team.atRisk}</span>
							<span><i className={styles.observeTeamDotBad} /> {team.behind}</span>
						</div>
						<div className={styles.observeTeamLeaders}>
							<span className={styles.observeTeamLeaderGood}>★ {team.topPerformer.name}</span>
							<span className={styles.observeTeamLeaderDivider}>|</span>
							<span className={styles.observeTeamLeaderBad}>▾ {team.bottomPerformer.name}</span>
						</div>
						<ArrowRightOutlined className={styles.observeAttentionChevron} />
					</div>
				</button>

				<div className={styles.observeBriefingSectionCard}>
					<button
						type="button"
						className={styles.observeBriefingSectionHeader}
						onClick={() => setWhatChangedOpen((value) => !value)}
					>
						<div className={styles.observeBriefingSectionTitleWrap}>
							<div className={styles.observeBriefingSectionIcon}>↗</div>
							<div className={styles.observeBriefingSectionTitleBlock}>
								<div className={styles.observeBriefingSectionTitle}>What Changed</div>
								<div className={styles.observeBriefingSectionSubtitle}>
									{whatChanged.period.previous} → {whatChanged.period.current}
								</div>
							</div>
						</div>
						<div className={styles.observeSectionCounts}>
							<span className={styles.observeCountPositive}>↗ {whatChanged.improvingCount}</span>
							<span className={styles.observeCountNegative}>↘ {whatChanged.decliningCount}</span>
							<DownOutlined className={whatChangedOpen ? styles.observeSectionArrowOpen : styles.observeSectionArrow} />
						</div>
					</button>
					{whatChangedOpen ? (
						<div className={styles.observeBriefingSectionBody}>
							<div className={styles.observeChangeHighlights}>
								{whatChanged.highlights.length > 0 ? (
									whatChanged.highlights.map((item: any) => (
										<button
											type="button"
											key={item.id}
											className={`${styles.observeChangeHighlight} ${CHANGE_SEVERITY_CLASS[item.severity] || styles.observeChangeHighlightNeutral}`}
											onClick={() => navigate(item.drillPath || supeSummaryRoute)}
										>
											<span>{item.text}</span>
											<ArrowRightOutlined />
										</button>
									))
								) : (
									<div className={styles.observeEmptyInline}>No period-over-period changes available yet</div>
								)}
							</div>
							<div className={styles.observeBigMoversBlock}>
								<div className={styles.observeBigMoversLabel}>Biggest Moves</div>
								<div className={styles.observeBigMoversList}>
									{whatChanged.bigMovers.map((item: any) => (
										<button
											type="button"
											key={item.id}
											className={styles.observeBigMoverRow}
											onClick={() => navigate(item.drillPath || supeSummaryRoute)}
										>
											<span className={item.direction === 'up' ? styles.observeBigMoverPositive : styles.observeBigMoverNegative}>
												{item.direction === 'up' ? '↑' : '↓'} {Math.abs(Number(item.deltaPercent || 0))}%
											</span>
											<span className={styles.observeBigMoverName}>{item.name}</span>
											<span className={styles.observeBigMoverMetric}>{item.metricLabel}</span>
										</button>
									))}
								</div>
							</div>
						</div>
					) : null}
				</div>

				<div className={styles.observeSplitGrid}>
					<button
						type="button"
						className={styles.observeBriefingSectionCard}
						onClick={() => navigate(`${supeExploreRoute}?entity=retailer`)}
					>
						<div className={styles.observeSplitHeader}>
							<div className={styles.observeBriefingSectionTitle}>Retailer Health</div>
							<div className={styles.observeBriefingSectionSubtitle}>{retailerHealth.totalRetailers} retailers</div>
							<ArrowRightOutlined className={styles.observeAttentionChevron} />
						</div>
						<div className={styles.observeRetailerTrack}>
							{retailerHealth.tiers.map((tier: any) => (
								<i
									key={tier.tier}
									style={{
										width: `${retailerHealth.totalRetailers ? (tier.count * 100) / retailerHealth.totalRetailers : 0}%`,
										background: TIER_COLORS[tier.tier] || '#cbd5e1'
									}}
								/>
							))}
						</div>
						<div className={styles.observeRetailerLegend}>
							{retailerHealth.tiers.map((tier: any) => (
								<div key={tier.tier} className={styles.observeRetailerLegendItem}>
									<div className={styles.observeRetailerLegendLabel}>
										<i style={{ background: TIER_COLORS[tier.tier] || '#cbd5e1' }} />
										<span>{tier.label}</span>
										<b>{tier.count}</b>
									</div>
									{tier.dormantCount > 0 ? (
										<small>({tier.dormantCount} dormant)</small>
									) : null}
								</div>
							))}
						</div>
					</button>

					<button
						type="button"
						className={styles.observeBriefingSectionCard}
						onClick={() => navigate('/trajectory')}
					>
						<div className={styles.observeSplitHeader}>
							<div className={styles.observeBriefingSectionTitleWrap}>
								<div className={`${styles.observeBriefingSectionIcon} ${styles.observeBriefingSectionIconBlue}`}>
									<AimOutlined />
								</div>
								<div className={styles.observeBriefingSectionTitleBlock}>
									<div className={styles.observeBriefingSectionTitle}>Goals</div>
									<div className={styles.observeBriefingSectionSubtitle}>{goalsPreview.count} active</div>
								</div>
							</div>
							<ArrowRightOutlined className={styles.observeAttentionChevron} />
						</div>
						<div className={styles.observeGoalsList}>
							{goalsPreview.items.length > 0 ? (
								goalsPreview.items.map((goal: any) => (
									<div key={goal.id} className={styles.observeGoalRow}>
										<span className={styles.observeGoalName}>{goal.name}</span>
										<div className={styles.observeGoalTrack}>
											<i
												className={GOAL_STATUS_CLASS[goal.status] || styles.observeGoalFillBlue}
												style={{ width: `${Math.max(0, Math.min(100, Number(goal.progressPercent || 0)))}%` }}
											/>
										</div>
										<span className={styles.observeGoalPct}>{Math.round(Number(goal.progressPercent || 0))}%</span>
									</div>
								))
							) : (
								<div className={styles.observeEmptyInline}>No active goals configured</div>
							)}
						</div>
					</button>
				</div>

				<div className={styles.observeBriefingSectionCard}>
					<div className={styles.observeSplitHeader}>
						<div className={styles.observeBriefingSectionTitleWrap}>
							<div className={`${styles.observeBriefingSectionIcon} ${styles.observeBriefingSectionIconBlue}`}>
								<ThunderboltOutlined />
							</div>
							<div className={styles.observeBriefingSectionTitleBlock}>
								<div className={styles.observeBriefingSectionTitle}>Active Actions</div>
								<div className={styles.observeBriefingSectionSubtitle}>
									{activeActions.runningCount} running{activeActions.draftCount ? ` · ${activeActions.draftCount} draft` : ''}
								</div>
							</div>
						</div>
					</div>
					<div className={styles.observeActionsList}>
						{activeActions.items.length > 0 ? (
							activeActions.items.map((item: any) => (
								<button
									type="button"
									key={item.id}
									className={styles.observeActionRow}
									onClick={() => navigate(supeActRoute)}
								>
									<span className={styles.observeActionType}>{item.type}</span>
									<span className={styles.observeActionName}>{item.title}</span>
									<span className={styles.observeActionMeta}>{item.deliverySummary}</span>
								</button>
							))
						) : (
							<div className={styles.observeEmptyInline}>No active actions yet</div>
						)}
					</div>
				</div>

				<div className={styles.observeBriefingSectionCard}>
					<button
						type="button"
						className={styles.observeBriefingSectionHeader}
						onClick={() => setAnomaliesOpen((value) => !value)}
					>
						<div className={styles.observeBriefingSectionTitleWrap}>
							<div className={`${styles.observeBriefingSectionIcon} ${styles.observeBriefingSectionIconMuted}`}>
								<ExclamationCircleOutlined />
							</div>
							<div className={styles.observeBriefingSectionTitleBlock}>
								<div className={styles.observeBriefingSectionTitle}>All Anomalies</div>
							</div>
						</div>
						<div className={styles.observeSectionCounts}>
							<span className={styles.observeAnomalyBadgeCritical}>{anomalies.criticalCount} critical</span>
							<span className={styles.observeAnomalyBadgeWarning}>{anomalies.warningCount} warning</span>
							<span className={styles.observeAnomalyTotal}>{anomalies.totalCount} total</span>
							<DownOutlined className={anomaliesOpen ? styles.observeSectionArrowOpen : styles.observeSectionArrow} />
						</div>
					</button>
					{anomaliesOpen ? (
						<div className={styles.observeBriefingSectionBody}>
							<div className={styles.observeAnomalyList}>
								{anomalies.items.length > 0 ? (
									anomalies.items.map((item: any) => (
										<div key={item.id} className={styles.observeAnomalyRow}>
											<div className={styles.observeAnomalyText}>
												<i
													className={
														item.severity === 'warning'
															? styles.observeAttentionDotWarning
															: item.severity === 'info'
																? styles.observeAttentionDotInfo
																: styles.observeAttentionDotCritical
													}
												/>
												<div>
													<div className={styles.observeAnomalyLabel}>{item.label}</div>
													{item.detail ? <div className={styles.observeAnomalyDetail}>{item.detail}</div> : null}
												</div>
											</div>
											<button
												type="button"
												className={styles.observeInlineAction}
												onClick={() =>
													openActionComposer({
														sourceKind: 'signal',
														sourceKey: item.sourceKey || item.key || null,
														sourceEntityType: item.entityType || null,
														sourceEntityId: item.entityId || null,
														sourceEntityName: item.entityName || item.label || null,
														title: item.label,
														note: item.detail,
														askQuery: item.label,
														targets:
															item.entityId && item.entityType
																? [{ entityType: item.entityType, entityId: String(item.entityId), entityName: item.entityName || item.label }]
																: []
													})
												}
											>
												Act
											</button>
											<ArrowRightOutlined className={styles.observeAttentionChevron} />
										</div>
									))
								) : (
									<div className={styles.observeEmptyInline}>No anomalies detected for this period</div>
								)}
							</div>
						</div>
					) : null}
				</div>

				<div className={styles.observeQuickActions}>
					<button type="button" className={`${styles.observeQuickAction} ${styles.observeQuickActionAsk}`} onClick={() => navigate(supeAskRoute)}>
						<QuickAskIcon className={styles.observeQuickActionIconSvg} />
						<span>Ask a question</span>
					</button>
					<button type="button" className={`${styles.observeQuickAction} ${styles.observeQuickActionExplore}`} onClick={() => navigate(`${supeExploreRoute}?entity=salesman`)}>
						<QuickExploreIcon className={styles.observeQuickActionIconSvg} />
						<span>Explore data</span>
					</button>
					<button type="button" className={`${styles.observeQuickAction} ${styles.observeQuickActionCreate}`} onClick={() => navigate(supeActRoute)}>
						<QuickActionIcon className={styles.observeQuickActionIconSvg} />
						<span>Create action</span>
					</button>
					<button type="button" className={`${styles.observeQuickAction} ${styles.observeQuickActionTargets}`} onClick={() => navigate('/targets')}>
						<QuickTargetsIcon className={styles.observeQuickActionIconSvg} />
						<span>Set targets</span>
					</button>
					<button type="button" className={`${styles.observeQuickAction} ${styles.observeQuickActionTrajectory}`} onClick={() => navigate('/trajectory')}>
						<QuickTrajectoryIcon className={styles.observeQuickActionIconSvg} />
						<span>View trajectory</span>
					</button>
				</div>
			</div>
			<ThresholdConfigPanel
				open={thresholdOpen}
				onClose={() => setThresholdOpen(false)}
				onApply={async () => {
					try {
						await loadSummary();
					} catch {
						// no-op; the next page refresh will pick up the change
					}
				}}
			/>
			<ActionDrawer
				open={actionDrawerOpen}
				onClose={() => setActionDrawerOpen(false)}
				context={actionContext}
				onCreated={() => {
					void loadSummary();
					setActionDrawerOpen(false);
				}}
			/>
		</div>
	);
}
