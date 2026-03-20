import { useEffect, useMemo, useState } from 'react';
import { Card, Col, Progress, Row, Spin, Tag } from 'antd';
import { useNavigate } from 'react-router-dom';
import {
	ArrowRightOutlined,
	CheckCircleOutlined,
	CompassOutlined,
	DollarOutlined,
	DownOutlined,
	FundOutlined,
	RadarChartOutlined,
	TeamOutlined,
	ThunderboltOutlined,
	WarningOutlined
} from '@ant-design/icons';
import supeApi from '../api';
import styles from '../index.module.scss';
import {
	supeBeatRoute,
	supeDistributorRoute,
	supeRetailerRoute,
	supeSalesmanRoute,
	supeSummaryRoute,
	supeSkuRoute,
	supeTrajectoryRoute
} from '../constants';

type SummaryData = Record<string, any>;

const METRIC_ICON_MAP: Record<string, JSX.Element> = {
	revenue: <DollarOutlined />,
	collection: <FundOutlined />,
	outstanding: <DollarOutlined />,
	coverage: <TeamOutlined />,
	adherence: <CompassOutlined />
};

const ENTITY_ROUTE_MAP: Record<string, string> = {
	salesman: supeSalesmanRoute,
	retailer: supeRetailerRoute,
	sku: supeSkuRoute,
	distributor: supeDistributorRoute,
	beat: supeBeatRoute
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

export function DashboardView() {
	const navigate = useNavigate();
	const [loading, setLoading] = useState(true);
	const [summaryData, setSummaryData] = useState<SummaryData | null>(null);
	const [error, setError] = useState('');
	const [collapsedSections, setCollapsedSections] = useState({
		keyMetrics: false,
		periodIntelligence: false,
		entityPulse: true
	});

	useEffect(() => {
		let active = true;
		const loadSummary = async () => {
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

		loadSummary();
		return () => {
			active = false;
		};
	}, []);

	const metricCards = useMemo(() => summaryData?.summarySection?.metricCards || [], [summaryData]);
	const goals = useMemo(() => summaryData?.summarySection?.goals || [], [summaryData]);
	const periodIntelligence = useMemo(() => summaryData?.summarySection?.periodIntelligence || [], [summaryData]);
	const entityPulseCards = useMemo(() => summaryData?.summarySection?.entityPulseCards || [], [summaryData]);

	const periodLabel = summaryData?.period?.label || '-';
	const dayElapsed = summaryData?.period?.dayElapsed || 0;
	const daysInPeriod = summaryData?.period?.daysInPeriod || 0;
	const quarterLabel = summaryData?.period?.quarter || '-';

	const onTrackGoalCount = goals.filter((goal: any) => ['On Track', 'Accelerating'].includes(goal.status)).length;
	const laggingGoalCount = goals.length - onTrackGoalCount;

	const toggleSection = (section: 'keyMetrics' | 'periodIntelligence' | 'entityPulse') => {
		setCollapsedSections((prev) => ({ ...prev, [section]: !prev[section] }));
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
			<div className={styles.observeHeaderRow}>
				<div>
					<div className={styles.observeGreeting}>Supe Summary</div>
					<div className={styles.observeMeta}>
						{periodLabel} · Day {dayElapsed} of {daysInPeriod} · {quarterLabel}
					</div>
				</div>
				<div className={styles.observeHeaderActions}>
					<div className={styles.observeChip}>{summaryData?.intelligence?.length || 0} live signals</div>
				</div>
			</div>

			<Card className={styles.observeSectionCard} bordered={false}>
				<button type="button" className={styles.observeSectionToggle} onClick={() => toggleSection('keyMetrics')}>
					<div className={styles.observeSectionTitle}>
						<span className={styles.observeSectionIcon}>
							<TeamOutlined />
						</span>
						Key Metrics <span>{periodLabel}</span>
					</div>
					<DownOutlined
						className={`${styles.observeSectionChevron} ${
							collapsedSections.keyMetrics ? styles.observeSectionChevronCollapsed : ''
						}`}
					/>
				</button>
				<div
					className={`${styles.observeSectionBody} ${
						collapsedSections.keyMetrics ? styles.observeSectionBodyCollapsed : ''
					}`}
				>
					<div className={styles.observeSectionBodyInner}>
						<div className={styles.observeMetricsRow}>
							{metricCards.map((metric: any) => (
								<Card bordered={false} className={styles.observeMetricCard} key={metric.key}>
									<div className={styles.observeMetricHead}>
										<span style={{ color: metric.accent }}>{METRIC_ICON_MAP[metric.key] || <DollarOutlined />}</span>
										<span>{metric.title}</span>
									</div>
									<div className={styles.observeMetricValue} style={{ color: metric.accent }}>
										{metric.value}
									</div>
									<div className={styles.observeMetricSub}>{metric.subtitle}</div>
									<div className={styles.observeMetricNote} style={{ color: metric.accent }}>
										{metric.note}
									</div>
								</Card>
							))}
						</div>
					</div>
				</div>
			</Card>

			<Card className={styles.observeSectionCard} bordered={false}>
				<div className={styles.observeSectionTitleRow}>
					<div className={styles.observeSectionTitle}>
						<span className={styles.observeSectionIcon}>
							<CompassOutlined />
						</span>
						Goals & Trajectory <span>{goals.length} active · {onTrackGoalCount} on track · {laggingGoalCount} lagging</span>
					</div>
					<button
						type="button"
						className={styles.observeInlineAction}
						onClick={() => navigate(supeTrajectoryRoute)}
					>
						View Trajectory <ArrowRightOutlined />
					</button>
				</div>
				<Row gutter={[12, 12]}>
					{goals.map((goal: any) => (
						<Col xs={24} lg={12} key={goal.id || goal.name}>
							<div className={styles.observeGoalRow}>
								<div className={styles.observeGoalTop}>
									<strong>{goal.name}</strong>
									<Tag color={goal.statusColor}>{goal.status}</Tag>
								</div>
								<div className={styles.observeGoalAmounts}>
									<span>{goal.baseline}</span>
									<span>{goal.target}</span>
								</div>
								<Progress percent={goal.value} showInfo={false} strokeColor={goal.accent} trailColor="#e5e7eb" />
								<div className={styles.observeGoalCurrent}>Current: {goal.current}</div>
								<div className={styles.observeGoalDays}>{goal.daysLeft}</div>
							</div>
						</Col>
					))}
				</Row>
			</Card>

			<Card className={styles.observeSectionCard} bordered={false}>
				<button type="button" className={styles.observeSectionToggle} onClick={() => toggleSection('periodIntelligence')}>
					<div className={styles.observeSectionTitle}>
						<span className={styles.observeSectionIcon}>
							<ThunderboltOutlined />
						</span>
						Period Intelligence <span>{periodIntelligence.length}</span>
					</div>
					<DownOutlined
						className={`${styles.observeSectionChevron} ${
							collapsedSections.periodIntelligence ? styles.observeSectionChevronCollapsed : ''
						}`}
					/>
				</button>
				<div
					className={`${styles.observeSectionBody} ${
						collapsedSections.periodIntelligence ? styles.observeSectionBodyCollapsed : ''
					}`}
				>
					<div className={styles.observeSectionBodyInner}>
						<div className={styles.observeIntelligenceWrap}>
							{periodIntelligence.map((item: any) => (
								<div key={item.key} className={styles.observeIntelligenceRow}>
									<div className={styles.observeIntelligenceText}>
										<span className={styles.observeIntelligenceIcon}>
											{item.type === 'positive' ? <CheckCircleOutlined /> : <WarningOutlined />}
										</span>
										<span>
											{item.label} <b>{item.detail}</b>
										</span>
									</div>
									{item.action && getIntelligenceActionRoute(item) && (
										<button
											type="button"
											className={styles.observeInlineAction}
											onClick={() => navigate(getIntelligenceActionRoute(item))}
										>
											{item.action} <ArrowRightOutlined />
										</button>
									)}
								</div>
							))}
						</div>
					</div>
				</div>
			</Card>

			<Card className={styles.observeSectionCard} bordered={false}>
				<button type="button" className={styles.observeSectionToggle} onClick={() => toggleSection('entityPulse')}>
					<div className={styles.observeSectionTitle}>
						<span className={styles.observeSectionIcon}>
							<RadarChartOutlined />
						</span>
						Entity Pulse <span>Quick health by entity</span>
					</div>
					<DownOutlined
						className={`${styles.observeSectionChevron} ${
							collapsedSections.entityPulse ? styles.observeSectionChevronCollapsed : ''
						}`}
					/>
				</button>
				<div
					className={`${styles.observeSectionBody} ${
						collapsedSections.entityPulse ? styles.observeSectionBodyCollapsed : ''
					}`}
				>
					<div className={styles.observeSectionBodyInner}>
						<Row gutter={[12, 12]}>
							{entityPulseCards.map((card: any) => (
								<Col xs={24} md={12} xl={card.key === 'distributor' || card.key === 'beat' ? 12 : 8} key={card.key}>
									<button
										type="button"
										className={styles.observeEntityCard}
										onClick={() => navigate(ENTITY_ROUTE_MAP[card.key] || supeSummaryRoute)}
									>
										<div className={styles.observeEntityTop}>
											<strong>{card.title}</strong>
											<ArrowRightOutlined />
										</div>
										<div className={styles.observeEntityStats}>
											<div>
												<span>{card.labelOne}</span>
												<b>{card.valueOne}</b>
											</div>
											<div>
												<span>{card.labelTwo}</span>
												<b>{card.valueTwo}</b>
											</div>
											<div>
												<span>{card.labelThree}</span>
												<b className={styles.observeEntityAlert}>{card.valueThree}</b>
											</div>
										</div>
										<div className={styles.observeEntityFoot}>
											<i
												className={
													card.indicator === 'critical'
														? styles.observeEntityDotCritical
														: styles.observeEntityDotWarning
												}
											/>
											{card.footnote}
										</div>
									</button>
								</Col>
							))}
						</Row>
					</div>
				</div>
			</Card>
		</div>
	);
}
