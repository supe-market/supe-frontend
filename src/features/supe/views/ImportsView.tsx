import { useEffect, useMemo, useState } from 'react';
import type { UploadFile } from 'antd/es/upload/interface';
import {
  Alert,
  Button,
  Card,
  Descriptions,
  Empty,
  message,
  Space,
  Spin,
  Table,
  Tag,
  Typography,
  Upload
} from 'antd';
import { DownloadOutlined, InboxOutlined, ReloadOutlined, UploadOutlined } from '@ant-design/icons';
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

export function ImportsView() {
  const [imports, setImports] = useState<ImportBatchRow[]>([]);
  const [selectedBatchId, setSelectedBatchId] = useState<number | null>(null);
  const [selectedBatch, setSelectedBatch] = useState<ImportBatchRow | null>(null);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [downloadingTemplate, setDownloadingTemplate] = useState(false);
  const [fileList, setFileList] = useState<UploadFile[]>([]);
  const [pendingFile, setPendingFile] = useState<File | null>(null);

  const selectedErrors = useMemo(() => selectedBatch?.errors || [], [selectedBatch]);

  const loadImports = async (preferredBatchId?: number | null) => {
    try {
      setLoadingList(true);
      const response = await supeApi.listImports({ limit: 20 });
      const batches = response?.data?.data || [];
      setImports(batches);

      const nextSelectedId =
        preferredBatchId ?? selectedBatchId ?? (batches.length ? Number(batches[0].id) : null);
      setSelectedBatchId(nextSelectedId);
      if (nextSelectedId) {
        void loadBatch(nextSelectedId);
      } else {
        setSelectedBatch(null);
      }
    } catch (error: any) {
      message.error(error?.response?.data?.message || 'Failed to load imports');
    } finally {
      setLoadingList(false);
    }
  };

  const loadBatch = async (batchId: number) => {
    try {
      setLoadingDetail(true);
      const response = await supeApi.getImport(batchId);
      const batch = response?.data?.data;
      setSelectedBatch(batch);
      setImports((current) => current.map((row) => (Number(row.id) === Number(batchId) ? { ...row, ...batch } : row)));
    } catch (error: any) {
      message.error(error?.response?.data?.message || 'Failed to load import details');
    } finally {
      setLoadingDetail(false);
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

    const intervalId = window.setInterval(() => {
      void loadBatch(selectedBatchId);
      void loadImports(selectedBatchId);
    }, 3000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [selectedBatch, selectedBatchId]);

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

  const handleUpload = async () => {
    const uploadFile = pendingFile;
    if (!uploadFile) {
      message.error('Select an .xlsx file first');
      return;
    }

    try {
      setUploading(true);
      const formData = new FormData();
      formData.append('file', uploadFile);
      const response = await supeApi.uploadImport(formData);
      const batchId = Number(response?.data?.data?.batchId || 0);
      setFileList([]);
      setPendingFile(null);
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
    }
  };

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <Card>
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          <div>
            <Typography.Title level={4} style={{ marginBottom: 4 }}>
              Strict Excel Import
            </Typography.Title>
            <Typography.Text type="secondary">
              Upload only the finalized <code>orders_book</code> <code>.xlsx</code> template. CSV, XLS, and alternate sheet names are not supported.
            </Typography.Text>
          </div>

          <Alert
            type="info"
            showIcon
            message="Upload contract"
            description="The importer validates the template header during upload, then processes rows asynchronously in the background."
          />

          <Upload.Dragger
            accept=".xlsx"
            multiple={false}
            beforeUpload={(file) => {
              setPendingFile(file);
              setFileList([
                {
                  uid: String(file.uid || file.name),
                  name: file.name,
                  status: 'done',
                  size: file.size,
                  type: file.type
                } as UploadFile
              ]);
              return false;
            }}
            fileList={fileList}
            onRemove={() => {
              setFileList([]);
              setPendingFile(null);
              return true;
            }}
            style={{ background: '#fff' }}
          >
            <p className="ant-upload-drag-icon">
              <InboxOutlined />
            </p>
            <p className="ant-upload-text">Drop an .xlsx file here or click to select</p>
            <p className="ant-upload-hint">Only the strict customer data template is accepted.</p>
          </Upload.Dragger>

          <Space wrap>
            <Button icon={<DownloadOutlined />} loading={downloadingTemplate} onClick={() => void handleTemplateDownload()}>
              Download Template
            </Button>
            <Button type="primary" icon={<UploadOutlined />} loading={uploading} onClick={() => void handleUpload()}>
              Upload Import
            </Button>
            <Button icon={<ReloadOutlined />} onClick={() => void loadImports(selectedBatchId)}>
              Refresh
            </Button>
          </Space>
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
