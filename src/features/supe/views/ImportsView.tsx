import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Empty,
  message,
  Progress,
  Space,
  Spin,
  Table,
  Tag,
  Typography
} from 'antd';
import {
  CheckCircleFilled,
  ClockCircleOutlined,
  CloudUploadOutlined,
  DownloadOutlined,
  ExclamationCircleOutlined,
  ReloadOutlined,
  StopOutlined
} from '@ant-design/icons';
import supeApi from '../api';

type ImportErrorRow = {
  rowNumber: number;
  sNo: string;
  column: string;
  message: string;
  phase: string;
  createdAt?: string;
};

type ImportBatchRow = {
  id: number;
  sourceFileName: string;
  totalRows: number;
  totalColumns?: number;
  validRows: number;
  rejectedRows: number;
  errorCount: number;
  importStatus: string;
  notes?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
  createdAt?: string | null;
  refreshJobId?: number | null;
  refreshStatus?: string | null;
  refreshRequestedAt?: string | null;
  refreshStartedAt?: string | null;
  refreshCompletedAt?: string | null;
  refreshError?: string | null;
  errors?: ImportErrorRow[];
};

const ACTIVE_IMPORT_STATUSES = new Set(['QUEUED', 'PROCESSING']);
const ACTIVE_REFRESH_STATUSES = new Set(['QUEUED', 'RUNNING']);
const IMPORT_STATUS_META: Record<string, { color: string; bg: string; border: string; text: string }> = {
  COMPLETED: { color: '#287D3C', bg: '#F3FFF5', border: '#B7EB8F', text: 'Committed' },
  FAILED: { color: '#AF3029', bg: '#FFF3F1', border: '#FFCCC7', text: 'Failed' },
  PROCESSING: { color: '#1554C0', bg: '#F0F6FF', border: '#B7D6FF', text: 'Processing' },
  QUEUED: { color: '#8C5A11', bg: '#FFF7E6', border: '#FFD591', text: 'Queued' },
  RUNNING: { color: '#1554C0', bg: '#F0F6FF', border: '#B7D6FF', text: 'Running' }
};

function renderStatusPill(status?: string | null, emptyLabel = 'Unknown') {
  const normalized = String(status || '').toUpperCase();
  const meta = IMPORT_STATUS_META[normalized] || {
    color: '#3F3F46',
    bg: '#F5F5F5',
    border: '#E4E4E7',
    text: normalized || emptyLabel
  };
  return (
    <Tag
      style={{
        marginInlineEnd: 0,
        borderRadius: 999,
        paddingInline: 10,
        paddingBlock: 4,
        fontWeight: 600,
        color: meta.color,
        background: meta.bg,
        borderColor: meta.border
      }}
    >
      {meta.text}
    </Tag>
  );
}

function isBatchActive(batch?: ImportBatchRow | null) {
  if (!batch) return false;
  const importStatus = String(batch.importStatus || '').toUpperCase();
  const refreshStatus = String(batch.refreshStatus || '').toUpperCase();
  return ACTIVE_IMPORT_STATUSES.has(importStatus) || ACTIVE_REFRESH_STATUSES.has(refreshStatus);
}

function formatDateTime(value?: string | null) {
  if (!value) return 'Not recorded';
  try {
    return new Date(value).toLocaleString('en-IN');
  } catch {
    return String(value);
  }
}

function formatBytes(bytes: number) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function formatCompactNumber(value: number) {
  return Number(value || 0).toLocaleString('en-IN');
}

function summarizeRefreshError(value?: string | null) {
  const message = String(value || '').trim();
  if (!message) return null;
  if (message.includes('invalid input syntax for type date')) {
    return 'Refresh worker rejected a malformed date while rebuilding snapshots.';
  }
  return message;
}

function truncateMiddle(value: string, max = 42) {
  if (!value || value.length <= max) return value;
  const head = Math.ceil((max - 3) / 2);
  const tail = Math.floor((max - 3) / 2);
  return `${value.slice(0, head)}...${value.slice(-tail)}`;
}

function metricCard(label: string, value: string, tone: 'default' | 'danger' | 'accent' = 'default') {
  const tones = {
    default: { bg: '#FFFFFF', border: '#E7E9EE', value: '#111827' },
    danger: { bg: '#FFF6F5', border: '#FFD2CC', value: '#AF3029' },
    accent: { bg: '#F2F7FF', border: '#C8DBFF', value: '#1554C0' }
  } as const;
  const theme = tones[tone];
  return (
    <div
      style={{
        background: theme.bg,
        border: `1px solid ${theme.border}`,
        borderRadius: 16,
        padding: '14px 16px',
        minHeight: 88
      }}
    >
      <Typography.Text
        style={{
          display: 'block',
          fontSize: 12,
          letterSpacing: 0.3,
          textTransform: 'uppercase',
          color: '#6B7280'
        }}
      >
        {label}
      </Typography.Text>
      <Typography.Text
        style={{
          display: 'block',
          marginTop: 8,
          fontSize: 24,
          lineHeight: 1.1,
          fontWeight: 700,
          color: theme.value
        }}
      >
        {value}
      </Typography.Text>
    </div>
  );
}

function detailCell(label: string, value: React.ReactNode) {
  return (
    <div
      style={{
        border: '1px solid #E6EAF2',
        borderRadius: 16,
        padding: '14px 16px',
        background: '#FFFFFF'
      }}
    >
      <Typography.Text style={{ display: 'block', fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.3, color: '#6B7280' }}>
        {label}
      </Typography.Text>
      <div style={{ marginTop: 8, color: '#111827', fontSize: 15, lineHeight: 1.5 }}>{value}</div>
    </div>
  );
}

export function ImportsView() {
  const [imports, setImports] = useState<ImportBatchRow[]>([]);
  const [selectedBatchId, setSelectedBatchId] = useState<number | null>(null);
  const [selectedBatch, setSelectedBatch] = useState<ImportBatchRow | null>(null);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadedFile, setUploadedFile] = useState<{ name: string; size: number } | null>(null);
  const [downloadingTemplate, setDownloadingTemplate] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const selectedErrors = useMemo(() => selectedBatch?.errors || [], [selectedBatch]);
  const refreshSummary = useMemo(() => summarizeRefreshError(selectedBatch?.refreshError), [selectedBatch?.refreshError]);

  const dashboardStats = useMemo(() => {
    let activeImports = 0;
    let refreshQueue = 0;
    let refreshFailures = 0;
    let committedRows = 0;
    for (const batch of imports) {
      if (ACTIVE_IMPORT_STATUSES.has(String(batch.importStatus || '').toUpperCase())) activeImports += 1;
      if (ACTIVE_REFRESH_STATUSES.has(String(batch.refreshStatus || '').toUpperCase())) refreshQueue += 1;
      if (String(batch.refreshStatus || '').toUpperCase() === 'FAILED') refreshFailures += 1;
      if (String(batch.importStatus || '').toUpperCase() === 'COMPLETED') committedRows += Number(batch.validRows || 0);
    }
    return { activeImports, refreshQueue, refreshFailures, committedRows };
  }, [imports]);

  const selectedCompletionPct = useMemo(() => {
    if (!selectedBatch) return 0;
    if (!selectedBatch.totalRows) {
      return String(selectedBatch.importStatus || '').toUpperCase() === 'COMPLETED' ? 100 : 0;
    }
    return Math.max(0, Math.min(100, Math.round((Number(selectedBatch.validRows || 0) / Number(selectedBatch.totalRows || 1)) * 100)));
  }, [selectedBatch]);

  const loadImports = async (preferredBatchId?: number | null, options: { silent?: boolean } = {}) => {
    try {
      if (!options.silent) setLoadingList(true);
      const response = await supeApi.listImports({ limit: 20 });
      const batches = response?.data?.data || [];
      setImports(batches);

      const nextSelectedId = preferredBatchId ?? selectedBatchId ?? (batches.length ? Number(batches[0].id) : null);
      setSelectedBatchId(nextSelectedId);
      if (nextSelectedId) {
        void loadBatch(nextSelectedId, { silent: options.silent });
      } else {
        setSelectedBatch(null);
      }
    } catch (error: any) {
      if (!options.silent) message.error(error?.response?.data?.message || 'Failed to load imports');
    } finally {
      if (!options.silent) setLoadingList(false);
    }
  };

  const loadBatch = async (batchId: number, options: { silent?: boolean } = {}) => {
    try {
      if (!options.silent) setLoadingDetail(true);
      const response = await supeApi.getImport(batchId);
      const batch = response?.data?.data;
      setSelectedBatch(batch);
      setImports((current) =>
        current.map((row) => (Number(row.id) === Number(batchId) ? { ...row, ...batch } : row))
      );
    } catch (error: any) {
      if (!options.silent) message.error(error?.response?.data?.message || 'Failed to load import details');
    } finally {
      if (!options.silent) setLoadingDetail(false);
    }
  };

  useEffect(() => {
    void loadImports();
  }, []);

  useEffect(() => {
    if (!selectedBatchId || !isBatchActive(selectedBatch)) {
      return;
    }

    const MAX_POLLS = 200;
    let pollCount = 0;
    const intervalId = window.setInterval(() => {
      pollCount += 1;
      if (pollCount > MAX_POLLS) {
        window.clearInterval(intervalId);
        return;
      }
      void loadBatch(selectedBatchId, { silent: true });
      void loadImports(selectedBatchId, { silent: true });
    }, 3000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [selectedBatch, selectedBatchId]);

  const handleStopImport = async (batchId: number) => {
    try {
      await supeApi.cancelImport(batchId);
      message.success('Import stopped');
      await loadImports(batchId);
    } catch (error: any) {
      message.error(error?.response?.data?.message || 'Failed to stop import');
    }
  };

  const handleTemplateDownload = async () => {
    try {
      setDownloadingTemplate(true);
      const response = await supeApi.downloadImportTemplate();
      const blob = new Blob([response.data], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      });
      const href = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = href;
      link.download = 'customer-data-template.xlsx';
      link.click();
      URL.revokeObjectURL(href);
    } catch (error: any) {
      message.error(error?.response?.data?.message || 'Failed to download template');
    } finally {
      setDownloadingTemplate(false);
    }
  };

  const startUpload = useCallback(async (file: File) => {
    if (!file.name.toLowerCase().endsWith('.xlsx')) {
      message.error('Only .xlsx files are accepted');
      return;
    }
    setUploadedFile({ name: file.name, size: file.size });
    setUploading(true);
    setUploadProgress(0);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const response = await supeApi.uploadImport(formData, (event) => {
        if (event.total) {
          setUploadProgress(Math.round((event.loaded / event.total) * 100));
        }
      });
      setUploadProgress(100);
      const batchId = Number(response?.data?.data?.batchId || 0);
      await loadImports(batchId || null);
      if (batchId) {
        await loadBatch(batchId);
      }
      message.success('Import queued');
    } catch (error: any) {
      const batchId = Number(error?.response?.data?.batchId || 0);
      if (batchId) {
        setSelectedBatchId(batchId);
        await loadImports(batchId);
        await loadBatch(batchId);
      }
      message.error(error?.response?.data?.message || 'Import upload failed');
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  }, []);

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) void startUpload(file);
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
    const file = event.dataTransfer.files?.[0];
    if (file) void startUpload(file);
  };

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (!isDragging) setIsDragging(true);
  };

  const handleDragLeave = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
  };

  const triggerFilePicker = () => {
    fileInputRef.current?.click();
  };

  const dropzoneBorder = isDragging ? '#1D4ED8' : uploading ? '#1D4ED8' : '#BFD0EA';
  const dropzoneBg = isDragging ? 'linear-gradient(180deg, rgba(29,78,216,0.09), rgba(29,78,216,0.02))' : '#FFFFFF';

  return (
    <div style={{ display: 'grid', gap: 20 }}>
      <div
        style={{
          borderRadius: 28,
          overflow: 'hidden',
          border: '1px solid #D9E2F2',
          background: 'linear-gradient(145deg, #FBFCFF 0%, #F3F7FF 55%, #EEF4FF 100%)',
          boxShadow: '0 24px 60px rgba(30, 58, 138, 0.08)'
        }}
      >
        <div style={{ padding: 28, display: 'grid', gap: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
            <div style={{ maxWidth: 760 }}>
              <Typography.Text
                style={{
                  display: 'inline-block',
                  marginBottom: 12,
                  padding: '6px 12px',
                  borderRadius: 999,
                  background: '#E9F1FF',
                  color: '#1E3A8A',
                  fontWeight: 700,
                  letterSpacing: 0.4,
                  textTransform: 'uppercase',
                  fontSize: 12
                }}
              >
                Import Control Room
              </Typography.Text>
              <Typography.Title level={2} style={{ margin: 0, color: '#111827' }}>
                Upload once. See commit state and refresh health immediately.
              </Typography.Title>
              <Typography.Paragraph style={{ marginTop: 12, marginBottom: 0, fontSize: 16, color: '#4B5563', maxWidth: 820 }}>
                The importer accepts an <code>orders_book</code> <code>.xlsx</code>, derives missing outlet, brand, and line
                identifiers when business fields are present, commits valid rows in the background, then runs snapshot refresh as
                a separate job. This screen keeps those two stages visibly separate.
              </Typography.Paragraph>
            </div>
            <Space wrap>
              <Button
                icon={<DownloadOutlined />}
                loading={downloadingTemplate}
                onClick={() => void handleTemplateDownload()}
                style={{ cursor: 'pointer', height: 44, paddingInline: 18 }}
              >
                Download Template
              </Button>
              <Button
                icon={<ReloadOutlined />}
                onClick={() => void loadImports(selectedBatchId)}
                style={{ cursor: 'pointer', height: 44, paddingInline: 18 }}
              >
                Refresh
              </Button>
            </Space>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
            {metricCard('Active imports', formatCompactNumber(dashboardStats.activeImports), dashboardStats.activeImports ? 'accent' : 'default')}
            {metricCard('Refresh queue', formatCompactNumber(dashboardStats.refreshQueue), dashboardStats.refreshQueue ? 'accent' : 'default')}
            {metricCard('Refresh failures', formatCompactNumber(dashboardStats.refreshFailures), dashboardStats.refreshFailures ? 'danger' : 'default')}
            {metricCard('Committed rows', formatCompactNumber(dashboardStats.committedRows), 'default')}
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'minmax(320px, 1.25fr) minmax(320px, 0.9fr)',
              gap: 16,
              alignItems: 'stretch'
            }}
          >
            <div
              style={{
                borderRadius: 24,
                border: '1px solid #DCE7F7',
                padding: 20,
                background: 'rgba(255,255,255,0.74)',
                backdropFilter: 'blur(12px)'
              }}
            >
              <Typography.Text style={{ display: 'block', fontWeight: 700, color: '#1F2937' }}>
                What happens after upload
              </Typography.Text>
              <div style={{ display: 'grid', gap: 10, marginTop: 14 }}>
                {[
                  ['1', 'Template gate', 'Headers are validated before the batch is accepted.'],
                  ['2', 'Bulk commit', 'Rows are normalized, missing technical IDs are derived where possible, and data is inserted in bulk.'],
                  ['3', 'Refresh job', 'Snapshots and downstream state rebuild after the import is already committed.']
                ].map(([step, title, body]) => (
                  <div
                    key={step}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '40px minmax(0, 1fr)',
                      gap: 12,
                      alignItems: 'start',
                      padding: '12px 0',
                      borderBottom: step === '3' ? 'none' : '1px solid #E7ECF5'
                    }}
                  >
                    <div
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: 14,
                        display: 'grid',
                        placeItems: 'center',
                        fontWeight: 700,
                        color: '#1D4ED8',
                        background: '#EAF1FF'
                      }}
                    >
                      {step}
                    </div>
                    <div>
                      <Typography.Text style={{ display: 'block', fontWeight: 700, color: '#111827' }}>{title}</Typography.Text>
                      <Typography.Text style={{ color: '#4B5563' }}>{body}</Typography.Text>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div
              role="button"
              tabIndex={0}
              onClick={uploading ? undefined : triggerFilePicker}
              onKeyDown={(event) => {
                if (uploading) return;
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  triggerFilePicker();
                }
              }}
              onDrop={uploading ? undefined : handleDrop}
              onDragOver={uploading ? undefined : handleDragOver}
              onDragLeave={uploading ? undefined : handleDragLeave}
              style={{
                borderRadius: 24,
                border: `1.5px dashed ${dropzoneBorder}`,
                background: dropzoneBg,
                padding: 22,
                cursor: uploading ? 'progress' : 'pointer',
                transition: 'border-color 180ms ease, transform 180ms ease, background 180ms ease',
                minHeight: 240,
                display: 'grid',
                alignContent: 'center'
              }}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                onChange={handleFileSelect}
                style={{ display: 'none' }}
                aria-label="Select an .xlsx file to import"
              />

              {uploading && uploadedFile ? (
                <Space direction="vertical" size={12} style={{ width: '100%', textAlign: 'left' }}>
                  <CloudUploadOutlined style={{ fontSize: 38, color: '#1D4ED8' }} />
                  <Typography.Text style={{ fontSize: 12, color: '#6B7280', textTransform: 'uppercase', letterSpacing: 0.3 }}>
                    Upload in progress
                  </Typography.Text>
                  <Typography.Title level={4} style={{ margin: 0 }}>
                    {truncateMiddle(uploadedFile.name, 54)}
                  </Typography.Title>
                  <Typography.Text style={{ color: '#6B7280' }}>{formatBytes(uploadedFile.size)}</Typography.Text>
                  <Progress percent={uploadProgress} status={uploadProgress >= 100 ? 'success' : 'active'} strokeColor="#1D4ED8" />
                  <Typography.Text style={{ color: '#4B5563' }}>
                    {uploadProgress >= 100 ? 'File sent. Server is validating structure and queueing the batch.' : 'Streaming workbook to the import service.'}
                  </Typography.Text>
                </Space>
              ) : uploadedFile ? (
                <Space direction="vertical" size={10}>
                  <CheckCircleFilled style={{ fontSize: 40, color: '#3FA646' }} />
                  <Typography.Text style={{ fontSize: 12, color: '#6B7280', textTransform: 'uppercase', letterSpacing: 0.3 }}>
                    Last uploaded workbook
                  </Typography.Text>
                  <Typography.Title level={4} style={{ margin: 0 }}>{truncateMiddle(uploadedFile.name, 54)}</Typography.Title>
                  <Typography.Text style={{ color: '#6B7280' }}>Uploaded · {formatBytes(uploadedFile.size)}</Typography.Text>
                  <Typography.Link onClick={(event) => { event.stopPropagation(); triggerFilePicker(); }}>
                    Choose another file
                  </Typography.Link>
                </Space>
              ) : (
                <Space direction="vertical" size={12}>
                  <CloudUploadOutlined style={{ fontSize: 42, color: isDragging ? '#1D4ED8' : '#6B7280' }} />
                  <Typography.Text style={{ fontSize: 12, color: '#6B7280', textTransform: 'uppercase', letterSpacing: 0.3 }}>
                    Strict workbook intake
                  </Typography.Text>
                  <Typography.Title level={4} style={{ margin: 0 }}>
                    {isDragging ? 'Drop the workbook to start import' : 'Drop your .xlsx here or click to browse'}
                  </Typography.Title>
                  <Typography.Text style={{ color: '#4B5563' }}>
                    CSV, XLS, and loose headers are rejected immediately. Outlet, brand, and line IDs can be inferred if the
                    business fields are present.
                  </Typography.Text>
                </Space>
              )}
            </div>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 360px) minmax(0, 1fr)', gap: 20, alignItems: 'start' }}>
        <Card
          bordered={false}
          style={{ borderRadius: 24, boxShadow: '0 18px 36px rgba(15, 23, 42, 0.06)' }}
          bodyStyle={{ padding: 0 }}
        >
          <div style={{ padding: 22, borderBottom: '1px solid #EEF2F7' }}>
            <Typography.Title level={4} style={{ margin: 0 }}>
              Recent Imports
            </Typography.Title>
            <Typography.Text style={{ color: '#6B7280' }}>
              Select a batch to inspect import and refresh state separately.
            </Typography.Text>
          </div>

          {loadingList ? (
            <div style={{ minHeight: 220, display: 'grid', placeItems: 'center' }}>
              <Spin />
            </div>
          ) : imports.length ? (
            <div style={{ display: 'grid', gap: 10, padding: 14, maxHeight: 860, overflowY: 'auto' }}>
              {imports.map((record) => {
                const selected = Number(record.id) === Number(selectedBatchId);
                const importStatus = String(record.importStatus || '').toUpperCase();
                return (
                  <button
                    key={record.id}
                    type="button"
                    onClick={() => {
                      setSelectedBatchId(Number(record.id));
                      void loadBatch(Number(record.id));
                    }}
                    style={{
                      textAlign: 'left',
                      borderRadius: 18,
                      border: selected ? '1px solid #93C5FD' : '1px solid #E7EAF0',
                      background: selected ? 'linear-gradient(180deg, #F3F8FF 0%, #EBF3FF 100%)' : '#FFFFFF',
                      boxShadow: selected ? '0 12px 30px rgba(37, 99, 235, 0.12)' : 'none',
                      padding: 16,
                      cursor: 'pointer',
                      transition: 'transform 180ms ease, box-shadow 180ms ease, border-color 180ms ease'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
                      <div style={{ minWidth: 0 }}>
                        <Typography.Text
                          strong
                          style={{
                            display: '-webkit-box',
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: 'vertical',
                            overflow: 'hidden',
                            fontSize: 15,
                            color: '#111827'
                          }}
                        >
                          {record.sourceFileName}
                        </Typography.Text>
                        <Typography.Text style={{ display: 'block', marginTop: 6, fontSize: 12, color: '#6B7280' }}>
                          Batch #{record.id} · {formatDateTime(record.createdAt)}
                        </Typography.Text>
                      </div>
                      {ACTIVE_IMPORT_STATUSES.has(importStatus) ? (
                        <Button
                          type="text"
                          danger
                          icon={<StopOutlined />}
                          size="small"
                          onClick={(event) => {
                            event.stopPropagation();
                            void handleStopImport(Number(record.id));
                          }}
                          style={{ cursor: 'pointer' }}
                        />
                      ) : null}
                    </div>

                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
                      {renderStatusPill(record.importStatus)}
                      {renderStatusPill(record.refreshStatus, 'No refresh')}
                    </div>

                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
                        gap: 10,
                        marginTop: 14
                      }}
                    >
                      <div>
                        <Typography.Text style={{ display: 'block', fontSize: 12, color: '#6B7280' }}>Rows</Typography.Text>
                        <Typography.Text strong>{formatCompactNumber(record.validRows || 0)}/{formatCompactNumber(record.totalRows || 0)}</Typography.Text>
                      </div>
                      <div>
                        <Typography.Text style={{ display: 'block', fontSize: 12, color: '#6B7280' }}>Errors</Typography.Text>
                        <Typography.Text strong style={{ color: record.errorCount ? '#AF3029' : '#111827' }}>
                          {formatCompactNumber(record.errorCount || 0)}
                        </Typography.Text>
                      </div>
                      <div>
                        <Typography.Text style={{ display: 'block', fontSize: 12, color: '#6B7280' }}>Refresh job</Typography.Text>
                        <Typography.Text strong>{record.refreshJobId || '-'}</Typography.Text>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <div style={{ padding: 24 }}>
              <Empty description="No imports yet" />
            </div>
          )}
        </Card>

        <Card
          bordered={false}
          style={{ borderRadius: 24, boxShadow: '0 18px 36px rgba(15, 23, 42, 0.06)' }}
          bodyStyle={{ padding: 0 }}
        >
          {loadingDetail ? (
            <div style={{ minHeight: 320, display: 'grid', placeItems: 'center' }}>
              <Spin />
            </div>
          ) : !selectedBatch ? (
            <div style={{ padding: 24 }}>
              <Empty description="Select an import batch" />
            </div>
          ) : (
            <div style={{ display: 'grid', gap: 22, padding: 22 }}>
              <div
                style={{
                  borderRadius: 24,
                  padding: 22,
                  background: 'linear-gradient(135deg, #0F172A 0%, #172554 100%)',
                  color: '#FFFFFF'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                  <div style={{ minWidth: 0, maxWidth: 900 }}>
                    <Typography.Text style={{ display: 'block', color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase', letterSpacing: 0.5, fontSize: 12 }}>
                      Batch #{selectedBatch.id}
                    </Typography.Text>
                    <Typography.Title level={3} style={{ color: '#FFFFFF', marginTop: 8, marginBottom: 8 }}>
                      {selectedBatch.sourceFileName}
                    </Typography.Title>
                    <Typography.Text style={{ color: 'rgba(255,255,255,0.76)', fontSize: 15 }}>
                      Import commit and refresh are tracked independently so a refresh failure does not hide successfully committed rows.
                    </Typography.Text>
                  </div>
                  <Space wrap size={10}>
                    {renderStatusPill(selectedBatch.importStatus)}
                    {renderStatusPill(selectedBatch.refreshStatus, 'No refresh')}
                  </Space>
                </div>

                <div style={{ marginTop: 18 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
                    <Typography.Text style={{ color: 'rgba(255,255,255,0.72)' }}>
                      Committed rows: {formatCompactNumber(selectedBatch.validRows || 0)} / {formatCompactNumber(selectedBatch.totalRows || 0)}
                    </Typography.Text>
                    <Typography.Text style={{ color: 'rgba(255,255,255,0.72)' }}>
                      Columns: {formatCompactNumber(selectedBatch.totalColumns || 0)}
                    </Typography.Text>
                  </div>
                  <Progress
                    percent={selectedCompletionPct}
                    showInfo={false}
                    strokeColor="#60A5FA"
                    trailColor="rgba(255,255,255,0.12)"
                    style={{ marginTop: 10 }}
                  />
                </div>
              </div>

              {selectedBatch.refreshStatus === 'FAILED' && refreshSummary ? (
                <Alert
                  type="error"
                  showIcon
                  icon={<ExclamationCircleOutlined />}
                  message="Refresh job failed after import commit"
                  description={
                    <div style={{ display: 'grid', gap: 8 }}>
                      <Typography.Text style={{ color: '#7F1D1D' }}>{refreshSummary}</Typography.Text>
                      <Typography.Text style={{ color: '#7F1D1D' }}>
                        Imported rows are committed. Only derived snapshots and downstream refresh outputs need another run.
                      </Typography.Text>
                      {selectedBatch.refreshError && selectedBatch.refreshError !== refreshSummary ? (
                        <Typography.Text code style={{ whiteSpace: 'pre-wrap' }}>
                          {selectedBatch.refreshError}
                        </Typography.Text>
                      ) : null}
                    </div>
                  }
                />
              ) : null}

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
                {metricCard('Total rows', formatCompactNumber(selectedBatch.totalRows || 0))}
                {metricCard('Valid rows', formatCompactNumber(selectedBatch.validRows || 0), selectedBatch.validRows ? 'accent' : 'default')}
                {metricCard('Rejected rows', formatCompactNumber(selectedBatch.rejectedRows || 0), selectedBatch.rejectedRows ? 'danger' : 'default')}
                {metricCard('Error count', formatCompactNumber(selectedBatch.errorCount || 0), selectedBatch.errorCount ? 'danger' : 'default')}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
                {detailCell('Created', formatDateTime(selectedBatch.createdAt))}
                {detailCell('Started', formatDateTime(selectedBatch.startedAt))}
                {detailCell('Completed', formatDateTime(selectedBatch.completedAt))}
                {detailCell('Refresh requested', formatDateTime(selectedBatch.refreshRequestedAt))}
                {detailCell('Refresh started', formatDateTime(selectedBatch.refreshStartedAt))}
                {detailCell('Refresh completed', formatDateTime(selectedBatch.refreshCompletedAt))}
                {detailCell('Refresh job', selectedBatch.refreshJobId || 'Not queued')}
                {detailCell('Notes', selectedBatch.notes || 'No notes recorded')}
              </div>

              {selectedErrors.length ? (
                <Card
                  title="Validation and processing errors"
                  bordered={false}
                  style={{ borderRadius: 20, background: '#FFFFFF', border: '1px solid #EDF0F5' }}
                  bodyStyle={{ paddingTop: 0 }}
                >
                  <Table
                    rowKey={(record) => `${record.phase}-${record.rowNumber}-${record.column}-${record.message}`}
                    pagination={false}
                    size="small"
                    dataSource={selectedErrors}
                    scroll={{ x: 880 }}
                    columns={[
                      { title: 'Phase', dataIndex: 'phase', key: 'phase', width: 120 },
                      { title: 'S.no', dataIndex: 'sNo', key: 'sNo', width: 90 },
                      { title: 'Row', dataIndex: 'rowNumber', key: 'rowNumber', width: 90 },
                      { title: 'Column', dataIndex: 'column', key: 'column', width: 240 },
                      { title: 'Message', dataIndex: 'message', key: 'message' }
                    ]}
                  />
                </Card>
              ) : (
                <Alert
                  type={selectedBatch.refreshStatus === 'FAILED' ? 'warning' : 'success'}
                  showIcon
                  icon={selectedBatch.refreshStatus === 'FAILED' ? <ClockCircleOutlined /> : <CheckCircleFilled />}
                  message={
                    selectedBatch.refreshStatus === 'FAILED'
                      ? 'Import succeeded, refresh needs attention'
                      : 'No validation errors captured for this batch'
                  }
                  description={
                    selectedBatch.refreshStatus === 'FAILED'
                      ? 'Canonical data is committed. Investigate the refresh job error above and rerun the refresh path after the backend fix is deployed.'
                      : 'This batch passed validation and has no stored row-level errors.'
                  }
                />
              )}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
