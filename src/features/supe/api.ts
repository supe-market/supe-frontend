import { analyticsApi } from '../../lib/http';

function normalizeGoalMetric(metric: string) {
  return metric === 'coverage_pct' ? 'coverage' : metric;
}

export const supeApi = {
  getObserveSummary(params: Record<string, unknown> = {}) {
    return analyticsApi.get('/observe/summary', { params });
  },
  getObserveEntityList(entityType: string, params: Record<string, unknown> = {}) {
    return analyticsApi.get(`/observe/${entityType}`, { params });
  },
  getObserveEntityInsights(entityType: string, id: string, params: Record<string, unknown> = {}) {
    return analyticsApi.get(`/observe/${entityType}/${id}`, { params });
  },
  listGoals() {
    return analyticsApi.get('/targets').then((response) => {
      const targets = response?.data?.data?.targets || [];
      const goals = targets.map((target: any) => ({
        id: String(target.id),
        name: target.notes || `${target.metric} goal`,
        metricKey: normalizeGoalMetric(target.metric),
        geoKey: `${target.scopeLevel || 'national'}:${target.scopeValue || 'all_india'}`,
        baseline: Number(target.baselineValue || 0),
        current: Number(target.actualValue || 0),
        target: Number(target.targetValue || 0),
        progressPercent: Number(target.attainmentPct || 0),
        startDate: target.startDate,
        endDate: target.endDate,
        status: target.status === 'paused' ? 'paused' : target.status,
        snapshots: target.snapshots || []
      }));
      return {
        ...response,
        data: {
          ...response.data,
          data: { goals }
        }
      };
    });
  },
  createGoal(payload: Record<string, any>) {
    return analyticsApi
      .post('/targets', {
        salesmanId: null,
        assignmentEntityType: payload.assignmentEntityType || 'salesman',
        metric: payload.metricKey,
        scope: {
          level: String(payload.geoKey || 'national:all_india').split(':')[0] || 'national',
          value: String(payload.geoKey || 'national:all_india').split(':')[1] || 'all_india'
        },
        baselineValue: payload.baseline,
        targetValue: payload.target,
        periodLabel: payload.name || payload.metricKey,
        startDate: payload.startDate,
        endDate: payload.endDate,
        notes: payload.name || null
      })
      .then((response) => ({
        ...response,
        data: {
          ...response.data,
          data: {
            goal: {
              id: String(response?.data?.data?.target?.id || ''),
              ...payload
            }
          }
        }
      }));
  },
  updateGoal(id: string, payload: Record<string, any>) {
    const status =
      payload.status === 'archived'
        ? 'completed'
        : payload.status === 'paused'
          ? 'paused'
          : payload.status || 'active';

    return analyticsApi.patch(`/targets/${id}`, {
      status,
      targetValue: payload.target
    });
  },
  compareEntities(payload: Record<string, any>) {
    return analyticsApi.post('/compare/run', {
      compareDimension: payload.entityType,
      selectedEntities: payload.entityIds || payload.selectedEntities || [],
      selectedMetrics: payload.metrics || payload.selectedMetrics || [],
      periodLabel: payload.timeRange || payload.periodLabel || 'mtd'
    });
  },
  listTargets() {
    return analyticsApi.get('/targets');
  },
  createTarget(payload: Record<string, unknown>) {
    return analyticsApi.post('/targets', payload);
  },
  updateTarget(id: string, payload: Record<string, unknown>) {
    return analyticsApi.patch(`/targets/${id}`, payload);
  },
  deleteTarget(id: string) {
    return analyticsApi.delete(`/targets/${id}`);
  },
  uploadImport(formData: FormData) {
    return analyticsApi.post('/imports', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
  },
  listImports(params: Record<string, unknown> = {}) {
    return analyticsApi.get('/imports', { params });
  },
  getImport(id: string | number) {
    return analyticsApi.get(`/imports/${id}`);
  },
  downloadImportTemplate() {
    return analyticsApi.get('/imports/template', { responseType: 'blob' });
  },
  getSignals(params: Record<string, unknown> = {}) {
    return analyticsApi.get('/signals', { params });
  },
  getSignalConfig() {
    return analyticsApi.get('/signals/config');
  },
  updateSignalDefaults(defaults: any[]) {
    return analyticsApi.put('/signals/config/defaults', { defaults });
  },
  updateSignalOverrides(payload: { overrides: any[]; replaceSignalDefinitionIds?: number[] }) {
    return analyticsApi.put('/signals/config/overrides', payload);
  },
  resetSignalConfig() {
    return analyticsApi.post('/signals/config/reset');
  },
  evaluateSignals() {
    return analyticsApi.post('/signals/evaluate');
  },
  getActionsDashboard() {
    return analyticsApi.get('/actions/dashboard');
  },
  listActions(params: Record<string, unknown> = {}) {
    return analyticsApi.get('/actions', { params });
  },
  getAction(id: string | number) {
    return analyticsApi.get(`/actions/${id}`);
  },
  createAction(payload: Record<string, any>) {
    return analyticsApi.post('/actions', payload);
  },
  updateAction(id: string | number, payload: Record<string, any>) {
    return analyticsApi.patch(`/actions/${id}`, payload);
  },
  appendActionEvent(id: string | number, payload: Record<string, any>) {
    return analyticsApi.post(`/actions/${id}/events`, payload);
  },
  getActionLog() {
    return analyticsApi.get('/action-log');
  },
  listTasks() {
    return analyticsApi.get('/tasks');
  },
  createTask(payload: Record<string, any>) {
    return analyticsApi.post('/tasks', payload);
  },
  updateTask(id: string | number, payload: Record<string, any>) {
    return analyticsApi.patch(`/tasks/${id}`, payload);
  },
  deleteTask(id: string | number) {
    return analyticsApi.delete(`/tasks/${id}`);
  }
};

export default supeApi;
