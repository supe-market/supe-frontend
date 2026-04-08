import { useEffect, useMemo, useState, type ComponentType } from 'react';
import {
  Alert,
  Card,
  Empty,
  Select,
  Spin
} from 'antd';
import {
  BarChartOutlined,
  BoxPlotOutlined,
  DotChartOutlined,
  FundOutlined,
  SlidersOutlined,
  SwapOutlined
} from '@ant-design/icons';
import styles from '../index.module.scss';
import supeApi from '../api';

type CompareEntityType = 'geography' | 'sku' | 'distributor';
type AnalysisTab = 'heatmap' | 'index' | 'gaps' | 'h2h' | 'trends';

type MetricDef = {
  key: string;
  label: string;
  shortLabel: string;
  unit: 'currency' | 'number' | 'percent';
  higherIsBetter?: boolean;
};

type CompareEntityOption = {
  id: string;
  name: string;
  sub?: string;
};

type CompareEntityRow = {
  id: string;
  name: string;
  metrics: Record<string, number>;
};

const ENTITY_OPTIONS: Array<{ key: CompareEntityType; label: string }> = [
  { key: 'geography', label: 'Geography' },
  { key: 'distributor', label: 'Distributor' },
  { key: 'sku', label: 'SKU' }
];

const TIME_OPTIONS = [
  { label: 'Today', value: 'today' },
  { label: 'MTD', value: 'mtd' },
  { label: 'Last 7 Days', value: 'last7d' },
  { label: 'Last 30 Days', value: 'last30d' },
  { label: 'Last 90 Days', value: 'last90d' }
];

const MODE_COLORS = ['#4c66ea', '#ec2f88', '#6d11d2', '#4a1db8', '#53c1ec', '#14b8a6', '#f59e0b', '#ef4444'];

const METRIC_OPTIONS: Record<CompareEntityType, MetricDef[]> = {
  geography: [
    { key: 'revenue', label: 'Revenue', shortLabel: 'Revenue', unit: 'currency', higherIsBetter: true },
    { key: 'collection', label: 'Collection', shortLabel: 'Collection', unit: 'currency', higherIsBetter: true },
    { key: 'orders', label: 'Orders', shortLabel: 'Orders', unit: 'number', higherIsBetter: true },
    { key: 'coverage', label: 'Coverage', shortLabel: 'Coverage', unit: 'percent', higherIsBetter: true }
  ],
  sku: [
    { key: 'revenue', label: 'Revenue', shortLabel: 'Revenue', unit: 'currency', higherIsBetter: true },
    { key: 'qty', label: 'Units', shortLabel: 'Units', unit: 'number', higherIsBetter: true },
    { key: 'penetration', label: 'Penetration', shortLabel: 'Penetration', unit: 'percent', higherIsBetter: true },
    { key: 'growth', label: 'Growth', shortLabel: 'Growth', unit: 'percent', higherIsBetter: true }
  ],
  distributor: [
    { key: 'revenue', label: 'Revenue', shortLabel: 'Revenue', unit: 'currency', higherIsBetter: true },
    { key: 'orders', label: 'Orders', shortLabel: 'Orders', unit: 'number', higherIsBetter: true },
    { key: 'fulfilmentRate', label: 'Fulfilment', shortLabel: 'Fulfilment', unit: 'percent', higherIsBetter: true },
    { key: 'damage', label: 'Damage', shortLabel: 'Damage', unit: 'percent', higherIsBetter: false }
  ]
};

const ANALYSIS_TABS: Array<{ key: AnalysisTab; label: string; icon: ComponentType }> = [
  { key: 'heatmap', label: 'Performance Matrix', icon: BoxPlotOutlined },
  { key: 'index', label: 'Index to Average', icon: BarChartOutlined },
  { key: 'gaps', label: 'Gap Opportunities', icon: DotChartOutlined },
  { key: 'h2h', label: 'Head to Head', icon: SwapOutlined },
  { key: 'trends', label: 'Trend Divergence', icon: FundOutlined }
];

function extractEntity(entityType: CompareEntityType, row: any): CompareEntityOption {
  if (entityType === 'geography') {
    return {
      id: String(row.id),
      name: row.name || row.region || row.zone || String(row.id),
      sub: row.zone || row.area || ''
    };
  }
  if (entityType === 'sku') {
    return {
      id: String(row.skuId),
      name: row.skuName || row.sku || String(row.skuId),
      sub: row.brandName || ''
    };
  }
  return {
    id: String(row.distributorId),
    name: row.distributorName || String(row.distributorId),
    sub: row.region || row.zone || ''
  };
}

function formatMetricValue(metric: MetricDef, value: number) {
  const safeValue = Number(value || 0);
  if (metric.unit === 'currency') {
    if (Math.abs(safeValue) >= 100000) {
      return `₹${(safeValue / 100000).toFixed(1)}L`;
    }
    return `₹${safeValue.toLocaleString('en-IN')}`;
  }
  if (metric.unit === 'percent') {
    return `${safeValue.toFixed(1)}%`;
  }
  return safeValue.toLocaleString('en-IN', { maximumFractionDigits: 0 });
}

function getPercentile(values: number[], current: number, higherIsBetter = true) {
  const sorted = [...values].sort((left, right) => (higherIsBetter ? right - left : left - right));
  const index = sorted.findIndex((value) => value === current);
  if (index === -1) {
    return 50;
  }
  if (sorted.length === 1) {
    return 100;
  }
  return Math.round(((sorted.length - index - 1) / (sorted.length - 1)) * 100);
}

function percentileTone(percentile: number) {
  if (percentile >= 75) {
    return styles.compareMetricCellTop;
  }
  if (percentile <= 25) {
    return styles.compareMetricCellBottom;
  }
  return styles.compareMetricCellMid;
}

function buildRows(compareData: any, selectedMetrics: string[], entityType: CompareEntityType) {
  const metrics = METRIC_OPTIONS[entityType].filter((metric) => selectedMetrics.includes(metric.key));
  const entities: CompareEntityRow[] = (compareData?.entities || []).map((row: any) => ({
    id: String(row.id || row.entityId || row.name),
    name: String(row.name || row.entityName || row.id),
    metrics: Object.fromEntries(
      metrics.map((metric) => [metric.key, Number(row.metrics?.[metric.key] || 0)])
    )
  }));

  const metricValues = Object.fromEntries(
    metrics.map((metric) => [metric.key, entities.map((entity) => entity.metrics[metric.key] || 0)])
  );

  return entities.map((entity) => {
    const percentiles = Object.fromEntries(
      metrics.map((metric) => [
        metric.key,
        getPercentile(metricValues[metric.key] || [], entity.metrics[metric.key] || 0, metric.higherIsBetter !== false)
      ])
    );
    const overallScore = metrics.length
      ? Math.round(metrics.reduce((sum, metric) => sum + Number(percentiles[metric.key] || 0), 0) / metrics.length)
      : 0;
    return {
      ...entity,
      percentiles,
      overallScore
    };
  }).sort((left, right) => right.overallScore - left.overallScore);
}

function buildGapCards(rows: ReturnType<typeof buildRows>, entityType: CompareEntityType, selectedMetrics: string[]) {
  const metrics = METRIC_OPTIONS[entityType].filter((metric) => selectedMetrics.includes(metric.key));
  return metrics.map((metric) => {
    const sorted = [...rows].sort((left, right) =>
      metric.higherIsBetter === false
        ? (left.metrics[metric.key] || 0) - (right.metrics[metric.key] || 0)
        : (right.metrics[metric.key] || 0) - (left.metrics[metric.key] || 0)
    );
    const best = sorted[0];
    const median = sorted[Math.floor(sorted.length / 2)];
    const worst = sorted[sorted.length - 1];
    const bestValue = Number(best?.metrics?.[metric.key] || 0);
    const worstValue = Number(worst?.metrics?.[metric.key] || 0);
    const medianValue = Number(median?.metrics?.[metric.key] || 0);
    const spread = bestValue ? Math.abs(((bestValue - worstValue) * 100) / bestValue) : 0;
    return {
      metric,
      best,
      median,
      worst,
      bestValue,
      medianValue,
      worstValue,
      spread,
      gapToMedian: Math.abs(medianValue - worstValue)
    };
  });
}

export function CompareView() {
  const [entityType, setEntityType] = useState<CompareEntityType>('geography');
  const [timeRange, setTimeRange] = useState('mtd');
  const [loadingEntities, setLoadingEntities] = useState(true);
  const [entityOptions, setEntityOptions] = useState<CompareEntityOption[]>([]);
  const [selectedEntityIds, setSelectedEntityIds] = useState<string[]>([]);
  const [selectedMetrics, setSelectedMetrics] = useState<string[]>(METRIC_OPTIONS.geography.map((item) => item.key));
  const [compareLoading, setCompareLoading] = useState(false);
  const [compareError, setCompareError] = useState('');
  const [compareData, setCompareData] = useState<any>(null);
  const [analysisTab, setAnalysisTab] = useState<AnalysisTab>('heatmap');
  const [focusMetric, setFocusMetric] = useState(METRIC_OPTIONS.geography[0].key);
  const [headToHeadLeft, setHeadToHeadLeft] = useState<string>('');
  const [headToHeadRight, setHeadToHeadRight] = useState<string>('');

  const periodLabel = useMemo(() => {
    const now = new Date();
    return `${now.toLocaleString('en-IN', { month: 'short', year: 'numeric' })} · ${timeRange.toUpperCase()}`;
  }, [timeRange]);

  useEffect(() => {
    setSelectedMetrics(METRIC_OPTIONS[entityType].map((item) => item.key));
    setFocusMetric(METRIC_OPTIONS[entityType][0]?.key || '');
    setSelectedEntityIds([]);
    setCompareData(null);
    setAnalysisTab('heatmap');
  }, [entityType]);

  useEffect(() => {
    let active = true;
    const loadEntities = async () => {
      try {
        setLoadingEntities(true);
        setCompareError('');
        const response = await supeApi.getObserveEntityList(entityType, { timeRange, limit: 500, page: 1 });
        if (!active) {
          return;
        }
        const options = (response?.data?.data || []).map((row: any) => extractEntity(entityType, row));
        setEntityOptions(options);
      } catch (error: any) {
        if (active) {
          setCompareError(error?.response?.data?.message || 'Failed to load compare entities');
        }
      } finally {
        if (active) {
          setLoadingEntities(false);
        }
      }
    };

    void loadEntities();
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
    } catch (error: any) {
      setCompareError(error?.response?.data?.message || 'Failed to compare entities');
      setCompareData(null);
    } finally {
      setCompareLoading(false);
    }
  };

  const selectedMetricDefs = useMemo(
    () => METRIC_OPTIONS[entityType].filter((metric) => selectedMetrics.includes(metric.key)),
    [entityType, selectedMetrics]
  );

  const selectedEntities = useMemo(
    () => entityOptions.filter((entity) => selectedEntityIds.includes(entity.id)),
    [entityOptions, selectedEntityIds]
  );

  const compareRows = useMemo(
    () => buildRows(compareData, selectedMetrics, entityType),
    [compareData, entityType, selectedMetrics]
  );

  const gapCards = useMemo(
    () => buildGapCards(compareRows, entityType, selectedMetrics),
    [compareRows, entityType, selectedMetrics]
  );

  useEffect(() => {
    if (!compareRows.length) {
      setHeadToHeadLeft('');
      setHeadToHeadRight('');
      return;
    }
    setHeadToHeadLeft((current) => (compareRows.some((row) => row.id === current) ? current : compareRows[0]?.id || ''));
    setHeadToHeadRight((current) => {
      if (compareRows.some((row) => row.id === current) && current !== headToHeadLeft) {
        return current;
      }
      return compareRows[1]?.id || compareRows[0]?.id || '';
    });
  }, [compareRows, headToHeadLeft]);

  const leftRow = compareRows.find((row) => row.id === headToHeadLeft) || compareRows[0];
  const rightRow = compareRows.find((row) => row.id === headToHeadRight) || compareRows[1];

  return (
    <div className={styles.comparePage}>
      <div className={styles.compareHero}>
        <div className={styles.compareHeroCopy}>
          <div className={styles.compareHeroTitle}>
            <SwapOutlined />
            <h2>Compare</h2>
            <span>{periodLabel}</span>
          </div>
          <p>Multi-entity analytical comparison — discover patterns, quantify gaps, track divergence.</p>
        </div>
        <div className={styles.compareMetaChip}>{selectedEntityIds.length} entities · {selectedMetrics.length}/{METRIC_OPTIONS[entityType].length} metrics</div>
      </div>

      <Card className={styles.compareCard} bordered={false}>
        <div className={styles.compareToolbar}>
          <div className={styles.compareModeSwitch}>
            {ENTITY_OPTIONS.map((option) => (
              <button
                key={option.key}
                type="button"
                className={entityType === option.key ? styles.compareModeActive : undefined}
                onClick={() => setEntityType(option.key)}
              >
                {option.label}
              </button>
            ))}
          </div>

          <div className={styles.compareControlBlock} style={{ minWidth: 200 }}>
            <label>Time Range</label>
            <Select value={timeRange} onChange={setTimeRange} options={TIME_OPTIONS} />
          </div>

          <div className={`${styles.compareControlBlock} ${styles.compareControlBlockWide}`} style={{ minWidth: 280 }}>
            <label>Entities</label>
            <Select
              mode="multiple"
              value={selectedEntityIds}
              loading={loadingEntities}
              placeholder="Select entities"
              onChange={(values) => setSelectedEntityIds(values as string[])}
              options={entityOptions.map((entity) => ({
                label: entity.name,
                value: entity.id
              }))}
            />
          </div>

          <div className={`${styles.compareControlBlock} ${styles.compareControlBlockWide}`} style={{ minWidth: 240 }}>
            <label>Metrics</label>
            <Select
              mode="multiple"
              value={selectedMetrics}
              onChange={(values) => setSelectedMetrics(values as string[])}
              options={METRIC_OPTIONS[entityType].map((metric) => ({
                label: metric.label,
                value: metric.key
              }))}
            />
          </div>

          <button type="button" className={styles.compareSelectButton} onClick={runCompare}>
            <BarChartOutlined />
            <b>Compare</b>
          </button>
        </div>

        {selectedEntities.length ? (
          <div className={styles.compareChipRow} style={{ padding: '0 24px 18px' }}>
            {selectedEntities.map((entity, index) => (
              <span
                key={entity.id}
                className={styles.compareEntityChip}
                style={{ backgroundColor: MODE_COLORS[index % MODE_COLORS.length] }}
              >
                {entity.name}
                <button type="button" onClick={() => setSelectedEntityIds((current) => current.filter((value) => value !== entity.id))}>
                  ×
                </button>
              </span>
            ))}
          </div>
        ) : null}

        {compareError ? <Alert className={styles.compareAlert} type="error" showIcon message={compareError} /> : null}

        <div className={styles.compareTabsRow}>
          {ANALYSIS_TABS.map((tab) => {
            const Icon = tab.icon;
            return (
              <button key={tab.key} type="button" className={analysisTab === tab.key ? styles.compareTabActive : undefined} onClick={() => setAnalysisTab(tab.key)}>
                <Icon />
                {tab.label}
              </button>
            );
          })}
        </div>
      </Card>

      {compareLoading ? (
        <Card className={styles.compareCard} bordered={false}>
          <Spin />
        </Card>
      ) : compareRows.length ? (
        <>
          {analysisTab === 'heatmap' ? (
            <Card className={styles.compareCard} bordered={false}>
              <div className={styles.compareCardHead}>
                <div>
                  <h3>Performance Matrix</h3>
                  <p>Cells colored by percentile rank within selection · Sorted by composite score</p>
                </div>
                <div className={styles.compareLegend}>
                  <span className={styles.top} /> Top
                  <span className={styles.mid} /> Mid
                  <span className={styles.bottom} /> Bottom
                </div>
              </div>

              <div className={styles.compareMatrixTable}>
                <div className={styles.compareMatrixHeader}>
                  <div>Entity</div>
                  <div>Score</div>
                  {selectedMetricDefs.map((metric) => (
                    <div key={metric.key}>{metric.shortLabel}</div>
                  ))}
                </div>

                {compareRows.map((row, rowIndex) => (
                  <div key={row.id} className={styles.compareMatrixRow}>
                    <div className={styles.compareEntityCell}>
                      <span style={{ backgroundColor: MODE_COLORS[rowIndex % MODE_COLORS.length] }}>{rowIndex + 1}</span>
                      <div>
                        <strong>{row.name}</strong>
                        <small>{selectedEntities.find((entity) => entity.name === row.name)?.sub || entityType}</small>
                      </div>
                    </div>
                    <div className={styles.compareScoreBubble}>{row.overallScore}</div>
                    {selectedMetricDefs.map((metric) => (
                      <div key={metric.key} className={`${styles.compareMetricCell} ${percentileTone(Number(row.percentiles[metric.key] || 0))}`}>
                        <b>{formatMetricValue(metric, row.metrics[metric.key] || 0)}</b>
                        <small>P{row.percentiles[metric.key] || 0}</small>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </Card>
          ) : null}

          {analysisTab === 'index' ? (
            <Card className={styles.compareCard} bordered={false}>
              <div className={styles.compareCardHead}>
                <div>
                  <h3>Index to Average</h3>
                  <p>100 = group average. Use the focus metric pills to compare relative lift or drag.</p>
                </div>
              </div>

              <div className={styles.compareMetricToggles}>
                {selectedMetricDefs.map((metric) => (
                  <button
                    key={metric.key}
                    type="button"
                    className={focusMetric === metric.key ? styles.compareMetricToggleActive : undefined}
                    onClick={() => setFocusMetric(metric.key)}
                  >
                    {metric.label}
                  </button>
                ))}
              </div>

              <div className={styles.compareIndexTable}>
                <div className={styles.compareIndexHeader}>
                  <div>Entity</div>
                  {selectedMetricDefs.map((metric) => (
                    <div key={metric.key}>{metric.shortLabel}</div>
                  ))}
                </div>

                {compareRows.map((row) => (
                  <div key={row.id} className={styles.compareIndexRow}>
                    <div>{row.name}</div>
                    {selectedMetricDefs.map((metric) => {
                      const metricAverage =
                        compareRows.reduce((sum, entry) => sum + Number(entry.metrics[metric.key] || 0), 0) / Math.max(compareRows.length, 1);
                      const index = metricAverage ? Math.round((Number(row.metrics[metric.key] || 0) * 100) / metricAverage) : 0;
                      const tone = index >= 100 ? styles.compareGood : styles.compareBad;
                      return (
                        <div key={metric.key} className={tone}>
                          {index}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </Card>
          ) : null}

          {analysisTab === 'gaps' ? (
            <Card className={styles.compareCard} bordered={false}>
              <div className={styles.compareCardHead}>
                <div>
                  <h3>Gap Opportunities</h3>
                  <p>How far does the weakest entity sit from median and best-in-group performance?</p>
                </div>
              </div>

              <div className={styles.compareGapGrid}>
                {gapCards.map((card) => (
                  <div key={card.metric.key} style={{ padding: '18px 20px', borderTop: '1px solid #edf1f7' }}>
                    <div className={styles.compareGapHead}>
                      <h4>{card.metric.label}</h4>
                      <span>{card.spread.toFixed(0)}% spread</span>
                    </div>
                    <div className={styles.compareGapTrack}>
                      <div style={{ width: `${Math.max(Math.min(card.bestValue ? (card.worstValue / card.bestValue) * 100 : 4, 100), 4)}%` }} />
                      <i />
                    </div>
                    <div className={styles.compareGapValues}>
                      <div>
                        <small>Weakest</small>
                        <b>{formatMetricValue(card.metric, card.worstValue)}</b>
                        <span>{card.worst?.name}</span>
                      </div>
                      <div>
                        <small style={{ color: '#d97706' }}>Median</small>
                        <b>{formatMetricValue(card.metric, card.medianValue)}</b>
                        <span>Group P50</span>
                      </div>
                      <div>
                        <small style={{ color: '#10b981' }}>Strongest</small>
                        <b>{formatMetricValue(card.metric, card.bestValue)}</b>
                        <span>{card.best?.name}</span>
                      </div>
                    </div>
                    <div className={styles.compareGapFoot}>Gap to median: {formatMetricValue(card.metric, card.gapToMedian)}</div>
                  </div>
                ))}
              </div>
            </Card>
          ) : null}

          {analysisTab === 'h2h' ? (
            <Card className={styles.compareCard} bordered={false}>
              <div className={styles.compareCardHead}>
                <div>
                  <h3>Head to Head</h3>
                  <p>Pick two entities and inspect where each one wins or loses.</p>
                </div>
              </div>

              <div className={styles.compareH2hSelectors}>
                <Select value={headToHeadLeft} onChange={setHeadToHeadLeft} options={compareRows.map((row) => ({ label: row.name, value: row.id }))} />
                <span>VS</span>
                <Select value={headToHeadRight} onChange={setHeadToHeadRight} options={compareRows.map((row) => ({ label: row.name, value: row.id }))} />
              </div>

              {leftRow && rightRow ? (
                <>
                  <div className={styles.compareH2hScore}>
                    <div>
                      <b>1</b>
                      <span>{leftRow.name}</span>
                    </div>
                    <SwapOutlined />
                    <div>
                      <b>2</b>
                      <span>{rightRow.name}</span>
                    </div>
                  </div>

                  {selectedMetricDefs.map((metric) => {
                    const leftValue = Number(leftRow.metrics[metric.key] || 0);
                    const rightValue = Number(rightRow.metrics[metric.key] || 0);
                    const maxValue = Math.max(leftValue, rightValue, 1);
                    return (
                      <div key={metric.key} className={styles.compareH2hRow}>
                        <div className={styles.compareH2hBarLeft}>
                          <div style={{ width: `${(leftValue * 100) / maxValue}%` }} />
                        </div>
                        <div className={styles.compareH2hMid}>
                          <b>{metric.label}</b>
                          <span>{formatMetricValue(metric, leftValue)} · {formatMetricValue(metric, rightValue)}</span>
                        </div>
                        <div className={styles.compareH2hBarRight}>
                          <div style={{ width: `${(rightValue * 100) / maxValue}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </>
              ) : null}
            </Card>
          ) : null}

          {analysisTab === 'trends' ? (
            <Card className={styles.compareCard} bordered={false}>
              <div className={styles.compareCardHead}>
                <div>
                  <h3>Trend Divergence</h3>
                  <p>The current compare API only returns a live snapshot, so this view highlights current spread by metric until history is wired in.</p>
                </div>
              </div>

              <div className={styles.compareTrendCards}>
                {gapCards.map((card, index) => (
                  <div key={card.metric.key} style={{ padding: '18px 20px', borderTop: '1px solid #edf1f7' }}>
                    <div className={styles.compareTrendCardInner}>
                      <span style={{ backgroundColor: MODE_COLORS[index % MODE_COLORS.length] }} />
                      <h4>{card.metric.label}</h4>
                      <div className={styles.compareSummaryMeta}>
                        <span>Leader: {card.best?.name}</span>
                        <span>Laggard: {card.worst?.name}</span>
                        <span>Spread: {card.spread.toFixed(0)}%</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          ) : null}
        </>
      ) : (
        <Card className={styles.compareCard} bordered={false}>
          <Empty
            description="Select at least two entities and a metric set, then run the comparison."
            image={Empty.PRESENTED_IMAGE_SIMPLE}
          />
        </Card>
      )}
    </div>
  );
}
