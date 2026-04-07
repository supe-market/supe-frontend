import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Descriptions,
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
  CloudUploadOutlined,
  DownloadOutlined,
  ReloadOutlined
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
  errors?: ImportErrorRow[];
};

const ACTIVE_IMPORT_STATUSES = new Set(['QUEUED', 'PROCESSING', 'IMPORTED']);

function renderStatusTag(status: string) {
  const normalized = String(status || '').toUpperCase();
  if (normalized === 'COMPLETED') return <Tag color="green">{normalized}</Tag>;
  if (normalized === 'FAILED') return <Tag color="red">{normalized}</Tag>;
  if (normalized === 'PROCESSING') return <Tag color="blue">{normalized}</Tag>;
  if (normalized === 'IMPORTED') return <Tag color="purple">{normalized}</Tag>;
  return <Tag color="gold">{normalized || 'UNKNOWN'}</Tag>;
}

function formatDateTime(value?: string | null) {
  if (!value) return '-';
  try {
    return new Date(value).toLocaleString('en-IN');
  } catch {
    return value;
  }
}

function formatBytes(bytes: number) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
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

  const loadImports = async (preferredBatchId?: number | null, options: { silent?: boolean } = {}) => {
    try {
      if (!options.silent) setLoadingList(true);
      const response = await supeApi.listImports({ limit: 20 });
      const batches = response?.data?.data || [];
      setImports(batches);

      const nextSelectedId =
        preferredBatchId ?? selectedBatchId ?? (batches.length ? Number(batches[0].id) : null);
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
      setImports((current) => current.map((row) => (Number(row.id) === Number(batchId) ? { ...row, ...batch } : row)));
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
    if (!selectedBatchId) {
      return;
    }
    if (!selectedBatch || !ACTIVE_IMPORT_STATUSES.has(String(selectedBatch.importStatus || '').toUpperCase())) {
      return;
    }

    // Cap polling: stop after ~10 minutes so a stuck batch doesn't keep the
    // tab requesting forever. The server-side sweeper will mark it FAILED.
    const MAX_POLLS = 200; // 200 * 3s = 10 minutes
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

  const startUpload = useCallback(
    async (file: File) => {
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
        // Reset input so the same filename can be picked again.
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
      }
    },
    []
  );

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

  const dropzoneBorder = isDragging ? '#1677ff' : uploading ? '#1677ff' : '#d9d9d9';
  const dropzoneBg = isDragging ? '#e6f4ff' : '#fafafa';

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <Card>
        <Space direction="vertical" size={20} style={{ width: '100%' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 320px' }}>
              <Typography.Title level={4} style={{ marginBottom: 4 }}>
                Strict Excel Import
              </Typography.Title>
              <Typography.Text type="secondary">
                Drop an <code>orders_book</code> <code>.xlsx</code> file to upload it instantly. CSV, XLS, and alternate sheet names are not supported.
              </Typography.Text>
            </div>
            <Space wrap>
              <Button
                icon={<DownloadOutlined />}
                loading={downloadingTemplate}
                onClick={() => void handleTemplateDownload()}
                style={{ cursor: 'pointer' }}
              >
                Download Template
              </Button>
              <Button
                icon={<ReloadOutlined />}
                onClick={() => void loadImports(selectedBatchId)}
                style={{ cursor: 'pointer' }}
              >
                Refresh
              </Button>
            </Space>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={handleFileSelect}
            style={{ display: 'none' }}
            aria-label="Select an .xlsx file to import"
          />

          <div
            role="button"
            tabIndex={0}
            onClick={uploading ? undefined : triggerFilePicker}
            onKeyDown={(e) => {
              if (uploading) return;
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                triggerFilePicker();
              }
            }}
            onDrop={uploading ? undefined : handleDrop}
            onDragOver={uploading ? undefined : handleDragOver}
            onDragLeave={uploading ? undefined : handleDragLeave}
            style={{
              border: `2px dashed ${dropzoneBorder}`,
              borderRadius: 12,
              background: dropzoneBg,
              padding: '40px 24px',
              textAlign: 'center',
              cursor: uploading ? 'progress' : 'pointer',
              transition: 'border-color 200ms ease, background 200ms ease',
              outline: 'none'
            }}
          >
            {uploading && uploadedFile ? (
              <Space direction="vertical" size={12} style={{ width: '100%', maxWidth: 480, margin: '0 auto' }}>
                <CloudUploadOutlined style={{ fontSize: 40, color: '#1677ff' }} />
                <Typography.Text strong style={{ display: 'block' }}>
                  Uploading {uploadedFile.name}
                </Typography.Text>
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  {formatBytes(uploadedFile.size)}
                </Typography.Text>
                <Progress percent={uploadProgress} status={uploadProgress >= 100 ? 'success' : 'active'} />
                {uploadProgress >= 100 && (
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    Server is validating the template…
                  </Typography.Text>
                )}
              </Space>
            ) : uploadedFile ? (
              <Space direction="vertical" size={8}>
                <CheckCircleFilled style={{ fontSize: 40, color: '#52c41a' }} />
                <Typography.Text strong>{uploadedFile.name}</Typography.Text>
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  Uploaded · {formatBytes(uploadedFile.size)}
                </Typography.Text>
                <Typography.Link onClick={(e) => { e.stopPropagation(); triggerFilePicker(); }}>
                  Upload another file
                </Typography.Link>
              </Space>
            ) : (
              <Space direction="vertical" size={8}>
                <CloudUploadOutlined style={{ fontSize: 48, color: isDragging ? '#1677ff' : '#8c8c8c' }} />
                <Typography.Text strong style={{ fontSize: 16 }}>
                  {isDragging ? 'Drop to upload' : 'Drop your .xlsx file here'}
                </Typography.Text>
                <Typography.Text type="secondary">
                  or <Typography.Link>click to browse</Typography.Link>
                </Typography.Text>
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  Upload starts automatically
                </Typography.Text>
              </Space>
            )}
          </div>

          <Alert
            type="info"
            showIcon
            message="The importer validates the template header on upload, then processes rows asynchronously in the background."
          />
        </Space>
      </Card>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 420px) minmax(0, 1fr)', gap: 16, alignItems: 'start' }}>
        <Card title="Recent Imports">
          {loadingList ? (
            <div style={{ minHeight: 180, display: 'grid', placeItems: 'center' }}>
              <Spin />
            </div>
          ) : imports.length ? (
            <Table
              rowKey="id"
              pagination={false}
              dataSource={imports}
              size="small"
              onRow={(record) => ({
                onClick: () => {
                  setSelectedBatchId(Number(record.id));
                  void loadBatch(Number(record.id));
                }
              })}
              rowClassName={(record) => (Number(record.id) === Number(selectedBatchId) ? 'ant-table-row-selected' : '')}
              columns={[
                {
                  title: 'File',
                  dataIndex: 'sourceFileName',
                  key: 'sourceFileName',
                  render: (value: string) => <Typography.Text strong>{value}</Typography.Text>
                },
                {
                  title: 'Status',
                  dataIndex: 'importStatus',
                  key: 'importStatus',
                  render: (value: string) => renderStatusTag(value)
                },
                {
                  title: 'Rows',
                  key: 'rows',
                  render: (_: unknown, record: ImportBatchRow) => `${record.validRows || 0}/${record.totalRows || 0}`
                },
                {
                  title: '',
                  key: 'actions',
                  width: 60,
                  render: (_: unknown, record: ImportBatchRow) => {
                    const isActive = ACTIVE_IMPORT_STATUSES.has(
                      String(record.importStatus || '').toUpperCase()
                    );
                    if (!isActive) return null;
                    return (
                      <Button
                        type="text"
                        size="small"
                        danger
                        onClick={(e) => {
                          e.stopPropagation();
                          void handleStopImport(Number(record.id));
                        }}
                        style={{ cursor: 'pointer' }}
                      >
                        Stop
                      </Button>
                    );
                  }
                }
              ]}
            />
          ) : (
            <Empty description="No imports yet" />
          )}
        </Card>

        <Card title="Batch Details">
          {loadingDetail ? (
            <div style={{ minHeight: 220, display: 'grid', placeItems: 'center' }}>
              <Spin />
            </div>
          ) : !selectedBatch ? (
            <Empty description="Select an import batch" />
          ) : (
            <Space direction="vertical" size={16} style={{ width: '100%' }}>
              <Descriptions size="small" column={2} bordered>
                <Descriptions.Item label="Batch ID">{selectedBatch.id}</Descriptions.Item>
                <Descriptions.Item label="Status">{renderStatusTag(selectedBatch.importStatus)}</Descriptions.Item>
                <Descriptions.Item label="File">{selectedBatch.sourceFileName}</Descriptions.Item>
                <Descriptions.Item label="Columns">{selectedBatch.totalColumns || 0}</Descriptions.Item>
                <Descriptions.Item label="Total Rows">{selectedBatch.totalRows || 0}</Descriptions.Item>
                <Descriptions.Item label="Valid Rows">{selectedBatch.validRows || 0}</Descriptions.Item>
                <Descriptions.Item label="Rejected Rows">{selectedBatch.rejectedRows || 0}</Descriptions.Item>
                <Descriptions.Item label="Error Count">{selectedBatch.errorCount || 0}</Descriptions.Item>
                <Descriptions.Item label="Created">{formatDateTime(selectedBatch.createdAt)}</Descriptions.Item>
                <Descriptions.Item label="Started">{formatDateTime(selectedBatch.startedAt)}</Descriptions.Item>
                <Descriptions.Item label="Completed">{formatDateTime(selectedBatch.completedAt)}</Descriptions.Item>
                <Descriptions.Item label="Notes">{selectedBatch.notes || '-'}</Descriptions.Item>
              </Descriptions>

              {selectedErrors.length ? (
                <Table
                  rowKey={(record) => `${record.phase}-${record.rowNumber}-${record.column}-${record.message}`}
                  pagination={false}
                  size="small"
                  dataSource={selectedErrors}
                  columns={[
                    { title: 'Phase', dataIndex: 'phase', key: 'phase', width: 110 },
                    { title: 'S.no', dataIndex: 'sNo', key: 'sNo', width: 80 },
                    { title: 'Row', dataIndex: 'rowNumber', key: 'rowNumber', width: 80 },
                    { title: 'Column', dataIndex: 'column', key: 'column', width: 220 },
                    { title: 'Message', dataIndex: 'message', key: 'message' }
                  ]}
                />
              ) : (
                <Alert
                  type="success"
                  showIcon
                  message="No validation errors captured for this batch"
                  description="Queued and successful batches will show status updates here while processing continues."
                />
              )}
            </Space>
          )}
        </Card>
      </div>
    </div>
  );
}
