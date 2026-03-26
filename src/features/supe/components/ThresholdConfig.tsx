import { useEffect, useMemo, useState } from 'react';
import { InputNumber, Spin, message } from 'antd';
import {
  CheckOutlined,
  CloseOutlined,
  DeleteOutlined,
  DownOutlined,
  EnvironmentOutlined,
  GlobalOutlined,
  PlusOutlined,
  ReloadOutlined,
  SettingOutlined
} from '@ant-design/icons';
import styles from '../index.module.scss';
import {
  buildSignalConfigPayload,
  cloneRules,
  hasZoneOverrides,
  isModified,
  mapSignalConfigResponse,
  ZONES,
  type ThresholdRule
} from '../signalConfig';
import supeApi from '../api';

const ENTITY_ORDER = ['salesman', 'retailer', 'sku', 'distributor', 'beat'] as const;

const ENTITY_META: Record<string, { label: string; pillClassName: string }> = {
  salesman: { label: 'Salesman', pillClassName: styles.thresholdSectionPillBlue },
  retailer: { label: 'Retailer', pillClassName: styles.thresholdSectionPillPurple },
  sku: { label: 'SKU', pillClassName: styles.thresholdSectionPillAmber },
  distributor: { label: 'Distributor', pillClassName: styles.thresholdSectionPillGreen },
  beat: { label: 'Beat', pillClassName: styles.thresholdSectionPillRed }
};

interface ThresholdConfigPanelProps {
  open: boolean;
  onClose: () => void;
  onApply?: () => void;
}

function formatThresholdValue(value: number, unit: string) {
  const safeValue = Number.isFinite(Number(value)) ? Number(value) : 0;
  const normalizedUnit = String(unit || '').trim().toLowerCase();
  if (normalizedUnit === '%') return `${safeValue}%`;
  if (normalizedUnit === 'days') return `${safeValue}days`;
  if (normalizedUnit === 'inr' || normalizedUnit === '₹') return `${safeValue}₹`;
  return `${safeValue}${unit || ''}`;
}

export function ThresholdConfigPanel({ open, onClose, onApply }: ThresholdConfigPanelProps) {
  const [rules, setRules] = useState<ThresholdRule[]>([]);
  const [baselineRules, setBaselineRules] = useState<ThresholdRule[]>([]);
  const [expandedPatterns, setExpandedPatterns] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    let active = true;
    const load = async () => {
      try {
        setLoading(true);
        const response = await supeApi.getSignalConfig();
        if (!active) return;
        const mapped = cloneRules(mapSignalConfigResponse(response?.data?.data || {}));
        setRules(mapped);
        setBaselineRules(cloneRules(mapped));
      } catch (error: any) {
        if (active) {
          message.error(error?.response?.data?.message || 'Failed to load thresholds');
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, [open]);

  const groupedRules = useMemo(() => {
    const grouped = new Map<string, ThresholdRule[]>();
    rules.forEach((rule) => {
      const existing = grouped.get(rule.entity) || [];
      existing.push(rule);
      grouped.set(rule.entity, existing);
    });
    return ENTITY_ORDER
      .filter((entity) => grouped.has(entity))
      .map((entity) => [entity, grouped.get(entity) || []] as const);
  }, [rules]);

  const modifiedCount = rules.filter((rule) => {
    const baseline = baselineRules.find((item) => item.pattern === rule.pattern);
    return baseline ? isModified(rule, baseline) : false;
  }).length;
  const overrideCount = rules.filter((rule) => hasZoneOverrides(rule)).length;
  const applyDisabled = modifiedCount === 0;

  const updateRule = (pattern: string, updater: (rule: ThresholdRule) => ThresholdRule) => {
    setRules((current) => current.map((rule) => (rule.pattern === pattern ? updater(rule) : rule)));
  };

  const toggleExpanded = (pattern: string) => {
    setExpandedPatterns((current) => ({ ...current, [pattern]: !current[pattern] }));
  };

  const handleReset = () => {
    void (async () => {
      try {
        setSaving(true);
        await supeApi.resetSignalConfig();
        await supeApi.evaluateSignals();
        const response = await supeApi.getSignalConfig();
        const mapped = cloneRules(mapSignalConfigResponse(response?.data?.data || {}));
        setRules(mapped);
        setBaselineRules(cloneRules(mapped));
        message.success('Thresholds reset');
        onApply?.();
      } catch (error: any) {
        message.error(error?.response?.data?.message || 'Failed to reset thresholds');
      } finally {
        setSaving(false);
      }
    })();
  };

  const handleApply = () => {
    void (async () => {
      try {
        setSaving(true);
        const payload = buildSignalConfigPayload(rules);
        await supeApi.updateSignalDefaults(payload.defaults);
        await supeApi.updateSignalOverrides({
          overrides: payload.overrides,
          replaceSignalDefinitionIds: payload.replaceSignalDefinitionIds
        });
        await supeApi.evaluateSignals();
        setBaselineRules(cloneRules(rules));
        message.success('Thresholds updated');
        onApply?.();
        onClose();
      } catch (error: any) {
        message.error(error?.response?.data?.message || 'Failed to apply thresholds');
      } finally {
        setSaving(false);
      }
    })();
  };

  if (!open) return null;

  return (
    <>
      <div className={styles.thresholdDrawerBackdrop} onClick={onClose} />
      <div className={styles.thresholdDrawerPanel}>
        <div className={styles.thresholdDrawerShell}>
        <div className={styles.thresholdDrawerHeader}>
          <div className={styles.thresholdDrawerTitleRow}>
            <div className={styles.thresholdDrawerIcon}>
              <SettingOutlined />
            </div>
            <div>
              <h3>Signal Thresholds</h3>
              <p>National defaults + zone-level overrides</p>
            </div>
          </div>

          <button type="button" className={styles.thresholdDrawerClose} onClick={onClose}>
            <CloseOutlined />
          </button>
        </div>

        <div className={styles.thresholdDrawerStats}>
          <span>
            <strong className={styles.thresholdStatsDot}>{rules.length}</strong> rules
          </span>
          {modifiedCount > 0 ? (
            <span className={styles.thresholdStatsModified}>
              <i />
              {modifiedCount} modified
            </span>
          ) : null}
          {overrideCount > 0 ? (
            <span className={styles.thresholdStatsOverride}>
              <EnvironmentOutlined />
              {overrideCount} zone override{overrideCount > 1 ? 's' : ''}
            </span>
          ) : null}
        </div>

        <div className={styles.thresholdDrawerBody}>
          {loading ? (
            <div className={styles.thresholdLoadingWrap}>
              <Spin />
            </div>
          ) : groupedRules.map(([entity, entityRules]) => {
            const meta = ENTITY_META[entity] || { label: entity, pillClassName: styles.thresholdSectionPillBlue };

            return (
              <div key={entity} className={styles.thresholdSection}>
                <div className={styles.thresholdSectionHeader}>
                  <span className={`${styles.thresholdSectionPill} ${meta.pillClassName}`}>{meta.label}</span>
                  <i />
                </div>

                <div className={styles.thresholdRuleList}>
                  {entityRules.map((rule) => {
                    const expanded = Boolean(expandedPatterns[rule.pattern]);
                    const availableZones = ZONES.filter((zone) => !(zone in rule.zoneOverrides));
                    const strictnessLabel = rule.operator === 'lt' ? 'below' : 'above';
                    const baselineRule = baselineRules.find((item) => item.pattern === rule.pattern);

                    return (
                      <div
                        key={rule.pattern}
                        className={`${styles.thresholdRuleCard} ${expanded ? styles.thresholdRuleCardExpanded : ''}`}
                      >
                        <button
                          type="button"
                          className={styles.thresholdRuleHead}
                          onClick={() => toggleExpanded(rule.pattern)}
                        >
                          <span className={styles.thresholdRuleChevron}>
                            {expanded ? <DownOutlined /> : <DownOutlined rotate={270} />}
                          </span>

                          <div className={styles.thresholdRuleText}>
                            <div className={styles.thresholdRuleTitle}>
                              {rule.metric}
                              {baselineRule && isModified(rule, baselineRule) ? <span className={styles.thresholdStatsDot}>modified</span> : null}
                              {hasZoneOverrides(rule) ? (
                                <span className={styles.thresholdRuleZoneCount}>
                                  {Object.keys(rule.zoneOverrides).length} zone overrides
                                </span>
                              ) : null}
                            </div>
                            <div className={styles.thresholdRuleDesc}>
                              Flag when {strictnessLabel} threshold. {rule.description}
                            </div>
                          </div>

                          <div className={styles.thresholdRuleValue}>
                            <GlobalOutlined />
                            <strong>
                              {formatThresholdValue(rule.nationalDefault, rule.unit)}
                            </strong>
                          </div>
                        </button>

                        {expanded ? (
                          <div className={styles.thresholdRuleExpanded}>
                            <div className={styles.thresholdNationalRow}>
                              <div className={styles.thresholdNationalLabel}>
                                <GlobalOutlined />
                                National Default
                              </div>
                              <div className={styles.thresholdInputWrap}>
                                <span>Threshold</span>
                                <InputNumber
                                  className={styles.thresholdInput}
                                  value={rule.nationalDefault}
                                  onChange={(value) => {
                                    if (typeof value === 'number') {
                                      updateRule(rule.pattern, (current) => ({ ...current, nationalDefault: value }));
                                    }
                                  }}
                                />
                              </div>
                            </div>

                            <div className={styles.thresholdZoneBlock}>
                              <div className={styles.thresholdZoneLabel}>ZONE OVERRIDES</div>

                              <div className={styles.thresholdZoneRows}>
                                {Object.entries(rule.zoneOverrides).map(([zone, value]) => (
                                  <div key={zone} className={styles.thresholdZoneRow}>
                                    <div className={styles.thresholdZoneName}>
                                      <EnvironmentOutlined />
                                      {zone}
                                    </div>
                                    <InputNumber
                                      className={styles.thresholdInput}
                                      value={value}
                                      onChange={(nextValue) => {
                                        if (typeof nextValue === 'number') {
                                          updateRule(rule.pattern, (current) => ({
                                            ...current,
                                            zoneOverrides: {
                                              ...current.zoneOverrides,
                                              [zone]: nextValue
                                            }
                                          }));
                                        }
                                      }}
                                    />
                                    <button
                                      type="button"
                                      className={styles.thresholdDeleteZone}
                                      onClick={() => {
                                        updateRule(rule.pattern, (current) => {
                                          const nextOverrides = { ...current.zoneOverrides };
                                          delete nextOverrides[zone];
                                          return { ...current, zoneOverrides: nextOverrides };
                                        });
                                      }}
                                    >
                                      <DeleteOutlined />
                                    </button>
                                  </div>
                                ))}
                              </div>

                              {availableZones.length > 0 ? (
                                <div className={styles.thresholdAddZonesRow}>
                                  {availableZones.map((zone) => (
                                    <button
                                      key={zone}
                                      type="button"
                                      className={styles.thresholdAddZoneButton}
                                      onClick={() => {
                                        updateRule(rule.pattern, (current) => ({
                                          ...current,
                                          zoneOverrides: {
                                            ...current.zoneOverrides,
                                            [zone]: current.nationalDefault
                                          }
                                        }));
                                      }}
                                    >
                                      <PlusOutlined /> Add {zone}
                                    </button>
                                  ))}
                                </div>
                              ) : null}
                            </div>
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}

          <div className={styles.thresholdInfoCard}>
            <h4>How zone overrides work</h4>
            <p>
              Each signal has a <strong>national default</strong> threshold. You can add <strong>zone-level overrides</strong> for North, South, Central, East, or West.
              When evaluating an entity, the system uses the zone threshold when present and falls back to the national default otherwise.
            </p>
            <p>
              Example: Coverage national = 70%. Set South = 60% for rural beats and North = 80% for stricter metro-heavy territory.
            </p>
          </div>
        </div>

        <div className={styles.thresholdDrawerFooter}>
          <button type="button" className={styles.thresholdResetButton} onClick={handleReset} disabled={saving || loading}>
            <ReloadOutlined />
            Reset all to defaults
          </button>

          <button
            type="button"
            className={`${styles.thresholdApplyButton} ${applyDisabled ? styles.thresholdApplyButtonDisabled : ''}`}
            onClick={handleApply}
            disabled={applyDisabled || saving || loading}
          >
            <CheckOutlined />
            {saving ? 'Saving…' : 'Apply & Refresh'}
          </button>
        </div>
      </div>
      </div>
    </>
  );
}
