import { useEffect, useMemo, useState, type ComponentType } from 'react';
import { Alert, Card, Empty, Select, Spin } from 'antd';
import {
  BarChartOutlined,
  BoxPlotOutlined,
  DotChartOutlined,
  FundOutlined,
  LineChartOutlined,
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

const ENTITY_OPTIONS: Array<{ key: CompareEntityType; label: string }> = [
  { key: 'geography', label: 'Geography' },
  { key: 'distributor', label: 'Distributor' },
  { key: 'sku', label: 'SKU' }
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

function formatMetricValue(metric: Pick<MetricDef, 'unit'> | undefined, value: number) {
  const safeValue = Number(value || 0);
  if (metric?.unit === 'currency') {
    if (Math.abs(safeValue) >= 100000) {
      return `₹${(safeValue / 100000).toFixed(1)}L`;
    }
    return `₹${safeValue.toLocaleString('en-IN')}`;
  }
  if (metric?.unit === 'percent') {
    return `${safeValue.toFixed(1)}%`;
  }
  return safeValue.toLocaleString('en-IN', { maximumFractionDigits: 0 });
}

function metricToneClass(tone?: string) {
  if (tone === 'top') {
    return styles.compareMetricCellTop;
  }
  if (tone === 'bottom') {
    return styles.compareMetricCellBottom;
  }
  return styles.compareMetricCellMid;
}

export function CompareView() {
  const [entityType, setEntityType] = useState<CompareEntityType>('geography');
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

  useEffect(() => {
    setSelectedMetrics(METRIC_OPTIONS[entityType].map((item) => item.key));
    setFocusMetric(METRIC_OPTIONS[entityType][0]?.key || '');
    setSelectedEntityIds([]);
    setCompareData(null);
    setCompareError('');
    setAnalysisTab('heatmap');
  }, [entityType]);

  useEffect(() => {
    let active = true;
    const loadEntities = async () => {
      try {
        setLoadingEntities(true);
        setCompareError('');
        const response = await supeApi.getObserveEntityList(entityType, { timeRange: 'mtd', limit: 500, page: 1 });
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
  }, [entityType]);

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
        timeRange: 'mtd'
      });
      setCompareData(response?.data?.data || null);
    } catch (error: any) {
      setCompareError(error?.response?.data?.message || 'Failed to compare entities');
      setCompareData(null);
    } finally {
      setCompareLoading(false);
    }
  };

  const selectedEntities = useMemo(
    () => entityOptions.filter((entity) => selectedEntityIds.includes(entity.id)),
    [entityOptions, selectedEntityIds]
  );

  const metricDefinitions: MetricDef[] = useMemo(() => {
    const backendMetrics = Array.isArray(compareData?.metricDefinitions) ? compareData.metricDefinitions : [];
    if (backendMetrics.length) {
      return backendMetrics.map((metric: any) => ({
        key: String(metric.key),
        label: String(metric.label),
        shortLabel: String(metric.shortLabel || metric.label),
        unit: metric.unit,
        higherIsBetter: metric.higherIsBetter !== false
      }));
    }
    return METRIC_OPTIONS[entityType].filter((metric) => selectedMetrics.includes(metric.key));
  }, [compareData?.metricDefinitions, entityType, selectedMetrics]);

  const matrixRows = compareData?.sections?.performanceMatrix?.rows || [];
  const indexRows = compareData?.sections?.indexToAverage?.rows || [];
  const gapCards = compareData?.sections?.gapOpportunities || [];
  const headToHeadPairs = compareData?.sections?.headToHead?.pairs || [];
  const trendMetrics = compareData?.sections?.trendDivergence?.metrics || [];

  useEffect(() => {
    const defaultLeft = compareData?.sections?.headToHead?.defaultLeftEntityId || '';
    const defaultRight = compareData?.sections?.headToHead?.defaultRightEntityId || '';
    setHeadToHeadLeft(defaultLeft);
    setHeadToHeadRight(defaultRight && defaultRight !== defaultLeft ? defaultRight : defaultLeft);
  }, [compareData]);

  const selectedHeadToHead = useMemo(() => {
    return (
      headToHeadPairs.find(
        (pair: any) =>
          (pair.leftEntityId === headToHeadLeft && pair.rightEntityId === headToHeadRight) ||
          (pair.leftEntityId === headToHeadRight && pair.rightEntityId === headToHeadLeft)
      ) || headToHeadPairs[0]
    );
  }, [headToHeadLeft, headToHeadPairs, headToHeadRight]);

  const activeTrendMetric = useMemo(() => {
    return trendMetrics.find((metric: any) => metric.metricKey === focusMetric) || trendMetrics[0] || null;
  }, [focusMetric, trendMetrics]);

  return (
    <div className={styles.comparePage}>
      <div className={styles.compareHero}>
        <div className={styles.compareHeroCopy}>
          <div className={styles.compareHeroTitle}>
            <SwapOutlined />
            <h2>Compare</h2>
            <span>MTD</span>
          </div>
          <p>Benchmark selected entities against the same live snapshot the Explore tables are using.</p>
        </div>
        <div className={styles.compareMetaChip}>{selectedEntityIds.length} entities · {selectedMetrics.length}/{METRIC_OPTIONS[entityType].length} metrics</div>
      </div>

      <Card className={styles.compareCard} bordered={false}>
        <div className={styles.compareControlGrid}>
          <div className={styles.compareControlBlock}>
            <label>Entity</label>
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
          </div>

          <div className={styles.compareControlBlock}>
            <label>Time Range</label>
            <div className={styles.compareStaticControl}>MTD</div>
          </div>

          <div className={`${styles.compareControlBlock} ${styles.compareControlBlockWide}`}>
            <label>Entities</label>
            <Select
              mode="multiple"
              value={selectedEntityIds}
              loading={loadingEntities}
              placeholder="Choose at least 2 entities"
              onChange={(values) => setSelectedEntityIds(values as string[])}
              options={entityOptions.map((entity) => ({
                label: entity.name,
                value: entity.id
              }))}
            />
          </div>

          <div className={`${styles.compareControlBlock} ${styles.compareControlBlockWide}`}>
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
        </div>

        <div className={styles.compareToolbar}>
          <div className={styles.compareSelectionMeta}>
            <span>{selectedEntityIds.length} entities selected</span>
            <span>{selectedMetrics.length} metrics active</span>
          </div>
          <button type="button" className={styles.compareSelectButton} onClick={runCompare}>
            <LineChartOutlined />
            <b>Run Compare</b>
          </button>
        </div>

        {selectedEntities.length ? (
          <div className={styles.compareChipRow}>
            {selectedEntities.map((entity, index) => (
              <span key={entity.id} className={styles.compareEntityChip} style={{ backgroundColor: MODE_COLORS[index % MODE_COLORS.length] }}>
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
          <div className={styles.compareState}><Spin /></div>
        </Card>
      ) : !compareData ? (
        <Card className={styles.compareCard} bordered={false}>
          <div className={styles.compareState}>
            <Empty description="Choose entities and metrics, then run a comparison to inspect relative performance." />
          </div>
        </Card>
      ) : (
        <>
          {analysisTab === 'heatmap' ? (
            <Card className={styles.compareCard} bordered={false}>
              <div className={styles.compareCardHead}>
                <div>
                  <h3>Performance Matrix</h3>
                  <p>Cells are colored by cohort percentile and rows are sorted by composite score.</p>
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
                  {metricDefinitions.map((metric) => (
                    <div key={metric.key}>{metric.shortLabel}</div>
                  ))}
                </div>

                {matrixRows.map((row: any, rowIndex: number) => (
                  <div key={row.entityId} className={styles.compareMatrixRow}>
                    <div className={styles.compareEntityCell}>
                      <span style={{ backgroundColor: MODE_COLORS[rowIndex % MODE_COLORS.length] }}>{row.rank}</span>
                      <div>
                        <strong>{row.entityName}</strong>
                        <small>{row.region || row.zone || row.area || entityType}</small>
                      </div>
                    </div>
                    <div className={styles.compareScoreBubble}>{row.score}</div>
                    {metricDefinitions.map((metric) => {
                      const card = row.metricCards?.find((item: any) => item.metricKey === metric.key);
                      return (
                        <div key={metric.key} className={`${styles.compareMetricCell} ${metricToneClass(card?.tone)}`}>
                          <b>{formatMetricValue(metric, Number(card?.value || 0))}</b>
                          <small>P{Math.round(Number(card?.percentile || 0))}</small>
                        </div>
                      );
                    })}
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
                  <p>100 equals the selected cohort average for this MTD snapshot.</p>
                </div>
              </div>

              <div className={styles.compareMetricToggles}>
                {metricDefinitions.map((metric) => (
                  <button key={metric.key} type="button" className={focusMetric === metric.key ? styles.compareMetricToggleActive : undefined} onClick={() => setFocusMetric(metric.key)}>
                    {metric.label}
                  </button>
                ))}
              </div>

              <div className={styles.compareIndexTable}>
                <div className={styles.compareIndexHeader}>
                  <div>Entity</div>
                  {metricDefinitions.map((metric) => (
                    <div key={metric.key}>{metric.shortLabel}</div>
                  ))}
                </div>
                {indexRows.map((row: any) => (
                  <div key={row.entityId} className={styles.compareIndexRow}>
                    <div>{row.entityName}</div>
                    {metricDefinitions.map((metric) => {
                      const index = Math.round(Number(row.indices?.[metric.key]?.index || 0));
                      return (
                        <div key={metric.key} className={index >= 100 ? styles.compareGood : styles.compareBad}>
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
                  <p>Compare weakest, median, and strongest cohort positions for each metric.</p>
                </div>
              </div>

              <div className={styles.compareGapGrid}>
                {gapCards.map((card: any) => {
                  const metric = metricDefinitions.find((item) => item.key === card.metricKey);
                  return (
                    <div key={card.metricKey} className={styles.compareGapCard}>
                      <div className={styles.compareGapHead}>
                        <h4>{card.label}</h4>
                        <span>{Number(card.spreadPct || 0).toFixed(0)}% spread</span>
                      </div>
                      <div className={styles.compareGapTrack}>
                        <div style={{ width: `${Math.max(Math.min(100 - Math.min(Number(card.spreadPct || 0), 92), 100), 8)}%` }} />
                        <i />
                      </div>
                      <div className={styles.compareGapValues}>
                        <div>
                          <small>Weakest</small>
                          <b>{formatMetricValue(metric, Number(card.worst?.value || 0))}</b>
                          <span>{card.worst?.entityName || '-'}</span>
                        </div>
                        <div>
                          <small style={{ color: '#d97706' }}>Median</small>
                          <b>{formatMetricValue(metric, Number(card.median?.value || 0))}</b>
                          <span>{card.median?.entityName || 'Cohort median'}</span>
                        </div>
                        <div>
                          <small style={{ color: '#10b981' }}>Strongest</small>
                          <b>{formatMetricValue(metric, Number(card.best?.value || 0))}</b>
                          <span>{card.best?.entityName || '-'}</span>
                        </div>
                      </div>
                      <div className={styles.compareGapFoot}>Gap to median: {formatMetricValue(metric, Number(card.opportunityToMedian || 0))}</div>
                    </div>
                  );
                })}
              </div>
            </Card>
          ) : null}

          {analysisTab === 'h2h' ? (
            <Card className={styles.compareCard} bordered={false}>
              <div className={styles.compareCardHead}>
                <div>
                  <h3>Head to Head</h3>
                  <p>Backend-computed pairwise comparison for the selected entities and active metrics.</p>
                </div>
              </div>

              <div className={styles.compareH2hSelectors}>
                <Select value={headToHeadLeft} onChange={setHeadToHeadLeft} options={compareData.entities.map((entity: any) => ({ label: entity.name, value: entity.id }))} />
                <span>VS</span>
                <Select value={headToHeadRight} onChange={setHeadToHeadRight} options={compareData.entities.map((entity: any) => ({ label: entity.name, value: entity.id }))} />
              </div>

              {selectedHeadToHead ? (
                <>
                  <div className={styles.compareH2hScore}>
                    <div>
                      <b>{selectedHeadToHead.leftScore}</b>
                      <span>{selectedHeadToHead.leftEntityName}</span>
                    </div>
                    <SwapOutlined />
                    <div>
                      <b>{selectedHeadToHead.rightScore}</b>
                      <span>{selectedHeadToHead.rightEntityName}</span>
                    </div>
                  </div>

                  {selectedHeadToHead.metrics.map((metricRow: any) => {
                    const metric = metricDefinitions.find((item) => item.key === metricRow.metricKey);
                    const leftValue = Number(metricRow.leftValue || 0);
                    const rightValue = Number(metricRow.rightValue || 0);
                    const maxValue = Math.max(Math.abs(leftValue), Math.abs(rightValue), 1);
                    return (
                      <div key={metricRow.metricKey} className={styles.compareH2hRow}>
                        <div className={styles.compareH2hBarLeft}>
                          <div style={{ width: `${(Math.abs(leftValue) * 100) / maxValue}%` }} />
                        </div>
                        <div className={styles.compareH2hMid}>
                          <b>{metricRow.label}</b>
                          <span>
                            {formatMetricValue(metric, leftValue)} · {formatMetricValue(metric, rightValue)}
                          </span>
                        </div>
                        <div className={styles.compareH2hBarRight}>
                          <div style={{ width: `${(Math.abs(rightValue) * 100) / maxValue}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </>
              ) : (
                <div className={styles.compareState}>
                  <Empty description="Select at least two entities to see a head-to-head comparison." />
                </div>
              )}
            </Card>
          ) : null}

          {analysisTab === 'trends' ? (
            <Card className={styles.compareCard} bordered={false}>
              <div className={styles.compareCardHead}>
                <div>
                  <h3>Trend Divergence</h3>
                  <p>Historical snapshot spread across the selected MTD metrics.</p>
                </div>
              </div>

              <div className={styles.compareMetricToggles}>
                {metricDefinitions.map((metric) => (
                  <button key={metric.key} type="button" className={focusMetric === metric.key ? styles.compareMetricToggleActive : undefined} onClick={() => setFocusMetric(metric.key)}>
                    {metric.label}
                  </button>
                ))}
              </div>

              {activeTrendMetric ? (
                <div className={styles.compareTrendCards}>
                  {activeTrendMetric.series.map((series: any, index: number) => (
                    <div key={series.entityId} className={styles.compareTrendCard}>
                      <div className={styles.compareTrendCardInner}>
                        <span style={{ backgroundColor: MODE_COLORS[index % MODE_COLORS.length] }} />
                        <div>{series.entityName}</div>
                        <b>{formatMetricValue(metricDefinitions.find((item) => item.key === activeTrendMetric.metricKey), Number(series.latestValue || 0))}</b>
                        <small>{Number(series.changePct || 0).toFixed(1)}% vs oldest point</small>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className={styles.compareState}>
                  <Empty description="No historical trend data is available for the selected cohort." />
                </div>
              )}
            </Card>
          ) : null}
        </>
      )}
    </div>
  );
}
