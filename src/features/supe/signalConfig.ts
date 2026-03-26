export type Operator = 'lt' | 'gt';

export interface ThresholdRule {
  pattern: string;
  signalDefinitionId?: number;
  signalKey: string;
  metric: string;
  unit: string;
  operator: Operator;
  nationalDefault: number;
  zoneOverrides: Record<string, number>;
  entity: string;
  description: string;
  isEnabled: boolean;
}

export const ZONES = ['NORTH', 'SOUTH', 'CENTRAL', 'EAST', 'WEST'];

export function cloneRules(rules: ThresholdRule[]) {
  return rules.map((rule) => ({ ...rule, zoneOverrides: { ...rule.zoneOverrides } }));
}

function prettifyMetric(metricKey: string) {
  return String(metricKey || '')
    .replace(/_/g, ' ')
    .replace(/\bpct\b/i, '%')
    .replace(/\b\w/g, (value) => value.toUpperCase());
}

export function mapSignalConfigResponse(data: any): ThresholdRule[] {
  const overridesBySignalKey = new Map<string, Record<string, number>>();
  (data?.overrides || []).forEach((item: any) => {
    const signalKey = String(item.signal_key || '');
    const zone = String(item.zone || '').toUpperCase();
    const existing = overridesBySignalKey.get(signalKey) || {};
    existing[zone] = Number(item.threshold_value || 0);
    overridesBySignalKey.set(signalKey, existing);
  });

  return (data?.defaults || []).map((row: any) => ({
    pattern: String(row.signal_key || row.metric_key || row.id),
    signalDefinitionId: Number(row.id),
    signalKey: String(row.signal_key || ''),
    metric: prettifyMetric(String(row.metric_key || row.signal_key || '')),
    unit: row.unit || row.unit_label || row.value_unit || '',
    operator: String(row.comparison_operator || 'LT').toLowerCase().startsWith('g') ? 'gt' : 'lt',
    nationalDefault: Number(row.tenant_threshold ?? row.threshold_value ?? 0),
    zoneOverrides: overridesBySignalKey.get(String(row.signal_key || '')) || {},
    entity: String(row.entity_type || ''),
    description: `Threshold for ${prettifyMetric(String(row.metric_key || row.signal_key || ''))}`,
    isEnabled: row.tenant_enabled === undefined ? true : Boolean(row.tenant_enabled)
  }));
}

export function buildSignalConfigPayload(rules: ThresholdRule[]) {
  return {
    defaults: rules.map((rule) => ({
      signalDefinitionId: rule.signalDefinitionId,
      entityType: rule.entity,
      signalKey: rule.signalKey,
      thresholdValue: Number(rule.nationalDefault || 0),
      isEnabled: rule.isEnabled !== false
    })),
    replaceSignalDefinitionIds: Array.from(
      new Set(rules.map((rule) => Number(rule.signalDefinitionId)).filter((value) => Number.isFinite(value) && value > 0))
    ),
    overrides: rules.flatMap((rule) =>
      Object.entries(rule.zoneOverrides || {}).map(([zone, thresholdValue]) => ({
        signalDefinitionId: rule.signalDefinitionId,
        entityType: rule.entity,
        signalKey: rule.signalKey,
        zone,
        thresholdValue: Number(thresholdValue || 0),
        isEnabled: rule.isEnabled !== false
      }))
    )
  };
}

export function isModified(rule: ThresholdRule, baseline: ThresholdRule) {
  return (
    baseline.nationalDefault !== rule.nationalDefault ||
    baseline.isEnabled !== rule.isEnabled ||
    JSON.stringify(baseline.zoneOverrides || {}) !== JSON.stringify(rule.zoneOverrides || {})
  );
}

export function hasZoneOverrides(rule: ThresholdRule) {
  return Object.keys(rule.zoneOverrides || {}).length > 0;
}
