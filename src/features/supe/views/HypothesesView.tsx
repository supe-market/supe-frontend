/**
 * Ask workspace view.
 *
 * This screen renders the full Ask flow: thread history, message timeline,
 * live run events, result artifacts, and the generated Python code tab.
 */
import {
	Button,
	Empty,
	List,
	Select,
	Skeleton,
	Space,
	Table,
	Tag,
	Tabs,
	Typography
} from 'antd';
import {
	CodeOutlined,
	MessageOutlined,
	PlusOutlined,
	StopOutlined
} from '@ant-design/icons';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
	Bar,
	CartesianGrid,
	ComposedChart,
	Legend,
	Line,
	ResponsiveContainer,
	Tooltip,
	XAxis,
	YAxis
} from 'recharts';
import supeApi from '../api';
import type {
	ISupeAskArtifact,
	ISupeAskEvent,
	ISupeAskMessage,
	ISupeAskRun,
	ISupeAskThread
} from '../types';
import { LEADERSHIP_PROMPT_SUGGESTIONS, PromptCommandBar } from '../components/PromptCommandBar';
import styles from '../index.module.scss';

const ASK_CHART_COLORS = ['#1d4ed8', '#0f766e', '#b45309', '#be123c', '#7c3aed', '#0369a1'];

function formatStatus(status?: string | null) {
	/** Map run status values to Ant Design tag colors. */
	switch (status) {
		case 'completed':
			return 'success';
		case 'failed':
			return 'error';
		case 'cancelled':
			return 'default';
		case 'running':
			return 'processing';
		default:
			return 'warning';
	}
}

function describeEvent(eventType: string) {
	/** Convert raw backend event types into human-readable status labels. */
	switch (eventType) {
		case 'run.created':
			return 'Run created';
		case 'run.retrieval.started':
			return 'Retrieval started';
		case 'run.retrieval.iteration.started':
			return 'Retrieval iteration started';
		case 'run.retrieval.action':
			return 'Retrieval action';
		case 'run.retrieval.profile.completed':
			return 'Profiling completed';
		case 'run.retrieval.iteration.completed':
			return 'Retrieval iteration completed';
		case 'run.retrieval.completed':
			return 'Retrieval completed';
		case 'run.codegen.started':
			return 'Code generation started';
		case 'run.codegen.completed':
			return 'Code generation completed';
		case 'run.execution.started':
			return 'Execution started';
		case 'run.execution.progress':
			return 'Execution update';
		case 'run.completed':
			return 'Completed';
		case 'run.failed':
			return 'Failed';
		case 'run.cancelled':
			return 'Cancelled';
		default:
			return eventType;
	}
}

function buildRunLabel(run: ISupeAskRun, index: number) {
	/** Prefer the generated title, then fall back to a stable run label. */
	return run.title || `Run ${index + 1}`;
}

function AskChart({ artifact }: { artifact: ISupeAskArtifact }) {
	/** Render a lightweight chart preview from stored plotly-style artifact data. */
	const payload = artifact.payload || {};
	const traces = Array.isArray(payload?.data) ? payload.data : [];
	const chartRowOrder: string[] = [];
	const chartRowMap = new Map<string, Record<string, number | string | null>>();
	const usedSeriesKeys = new Set<string>();
	const chartSeries = traces.reduce<Array<{ color: string; dataKey: string; name: string; type: 'bar' | 'line' }>>(
		(accumulator, trace, traceIndex) => {
			const xValues = Array.isArray(trace?.x) ? trace.x : [];
			const yValues = Array.isArray(trace?.y) ? trace.y : [];
			const pointsLength = Math.max(xValues.length, yValues.length);
			if (!pointsLength) {
				return accumulator;
			}

			const baseSeriesName = String(trace?.name || `Series ${traceIndex + 1}`);
			let dataKey = baseSeriesName;
			let duplicateIndex = 2;
			while (usedSeriesKeys.has(dataKey)) {
				dataKey = `${baseSeriesName} ${duplicateIndex}`;
				duplicateIndex += 1;
			}
			usedSeriesKeys.add(dataKey);

			for (let pointIndex = 0; pointIndex < pointsLength; pointIndex += 1) {
				const rowLabel = String(xValues[pointIndex] ?? pointIndex + 1);
				if (!chartRowMap.has(rowLabel)) {
					chartRowMap.set(rowLabel, { name: rowLabel });
					chartRowOrder.push(rowLabel);
				}
				const numericValue = Number(yValues[pointIndex] ?? null);
				chartRowMap.get(rowLabel)![dataKey] = Number.isFinite(numericValue) ? numericValue : null;
			}

			accumulator.push({
				color: ASK_CHART_COLORS[traceIndex % ASK_CHART_COLORS.length],
				dataKey,
				name: baseSeriesName,
				type: trace?.type === 'bar' ? 'bar' : 'line'
			});
			return accumulator;
		},
		[]
	);
	const chartRows = chartRowOrder.map((label) => chartRowMap.get(label) || { name: label });

	if (!chartRows.length || !chartSeries.length) {
		return (
			<div className={styles.askArtifactFallback}>
				<Typography.Text type="secondary">This chart payload could not be rendered inline.</Typography.Text>
			</div>
		);
	}

	return (
		<div className={styles.askChartShell}>
			<ResponsiveContainer width="100%" height={260}>
				<ComposedChart data={chartRows}>
					<CartesianGrid strokeDasharray="3 3" />
					<XAxis dataKey="name" tickLine={false} axisLine={false} />
					<YAxis tickLine={false} axisLine={false} />
					<Tooltip />
					<Legend />
					{chartSeries.map((series) =>
						series.type === 'bar' ? (
							<Bar key={series.dataKey} dataKey={series.dataKey} name={series.name} fill={series.color} radius={[6, 6, 0, 0]} />
						) : (
							<Line
								key={series.dataKey}
								type="monotone"
								dataKey={series.dataKey}
								name={series.name}
								stroke={series.color}
								strokeWidth={2}
								dot={false}
							/>
						)
					)}
				</ComposedChart>
			</ResponsiveContainer>
		</div>
	);
}

function resolveSelectedThreadId(
	threads: ISupeAskThread[],
	currentSelectedThreadId: string,
	preferredThreadId?: string
) {
	/** Keep the selected thread stable across refreshes and new thread creation. */
	if (preferredThreadId && threads.some((thread) => thread.id === preferredThreadId)) {
		return preferredThreadId;
	}
	if (currentSelectedThreadId && threads.some((thread) => thread.id === currentSelectedThreadId)) {
		return currentSelectedThreadId;
	}
	return threads[0]?.id || '';
}

function AskArtifactRenderer({ artifact }: { artifact: ISupeAskArtifact }) {
	/** Render the backend artifact union into the appropriate UI block. */
	if (artifact.artifact_type === 'markdown') {
		return (
			<div className={styles.askArtifactCard}>
				<div className={styles.askArtifactHeader}>{artifact.title}</div>
				<div className={styles.askMarkdownBlock}>{artifact.payload?.markdown || ''}</div>
			</div>
		);
	}

	if (artifact.artifact_type === 'metric') {
		return (
			<div className={styles.askMetricArtifact}>
				<div className={styles.askMetricLabel}>{artifact.payload?.label}</div>
				<div className={styles.askMetricValue}>{String(artifact.payload?.value ?? '')}</div>
				<Tag color={artifact.payload?.tone === 'positive' ? 'green' : artifact.payload?.tone === 'negative' ? 'red' : 'blue'}>
					{artifact.payload?.tone || 'neutral'}
				</Tag>
			</div>
		);
	}

	if (artifact.artifact_type === 'table') {
		const columns = Array.isArray(artifact.payload?.columns) ? artifact.payload.columns : [];
		const rows = Array.isArray(artifact.payload?.rows) ? artifact.payload.rows : [];
		return (
			<div className={styles.askArtifactCard}>
				<div className={styles.askArtifactHeader}>
					<span>{artifact.title}</span>
					<Typography.Text type="secondary">Rows {artifact.payload?.rowCount ?? rows.length}</Typography.Text>
				</div>
				<Table
					size="small"
					pagination={false}
					rowKey={(_, index) => `${artifact.id}_${index}`}
					scroll={{ x: true }}
					dataSource={rows}
					columns={columns.map((column: string) => ({
						title: column,
						dataIndex: column,
						key: column,
						render: (value: any) => (value == null ? '-' : String(value))
					}))}
				/>
			</div>
		);
	}

	if (artifact.artifact_type === 'plotly') {
		return (
			<div className={styles.askArtifactCard}>
				<div className={styles.askArtifactHeader}>{artifact.title}</div>
				<AskChart artifact={artifact} />
			</div>
		);
	}

	if (artifact.artifact_type === 'log') {
		return (
			<div className={styles.askArtifactCard}>
				<div className={styles.askArtifactHeader}>{artifact.title}</div>
				<pre className={styles.askLogBlock}>{(artifact.payload?.lines || []).join('\n')}</pre>
			</div>
		);
	}

	return (
		<div className={styles.askArtifactFallback}>
			<Typography.Text type="secondary">Unsupported artifact type: {artifact.artifact_type}</Typography.Text>
		</div>
	);
}

export function HypothesesView() {
	/** Main Ask screen used for thread management and run/result rendering. */
	const [searchParams] = useSearchParams();
	const initialQuery = searchParams.get('q') || '';
	const [threads, setThreads] = useState<ISupeAskThread[]>([]);
	const [selectedThreadId, setSelectedThreadId] = useState('');
	const [messages, setMessages] = useState<ISupeAskMessage[]>([]);
	const [runs, setRuns] = useState<ISupeAskRun[]>([]);
	const [artifactsByRun, setArtifactsByRun] = useState<Record<string, ISupeAskArtifact[]>>({});
	const [eventsByRun, setEventsByRun] = useState<Record<string, ISupeAskEvent[]>>({});
	const [activeRunId, setActiveRunId] = useState('');
	const [query, setQuery] = useState(initialQuery);
	const [loadingThreads, setLoadingThreads] = useState(true);
	const [loadingThread, setLoadingThread] = useState(false);
	const [submitting, setSubmitting] = useState(false);
	const [composerError, setComposerError] = useState('');
	const [panelTab, setPanelTab] = useState<'report' | 'code'>('report');
	const eventSourceRef = useRef<EventSource | null>(null);
	const hydratedQueryRef = useRef(initialQuery);
	const selectedThreadIdRef = useRef('');
	const activeRunIdRef = useRef('');
	const loadThreadRequestRef = useRef(0);
	const queryParam = searchParams.get('q') || '';

	const updateSelectedThreadId = (nextThreadId: string) => {
		selectedThreadIdRef.current = nextThreadId;
		setSelectedThreadId(nextThreadId);
	};

	const updateActiveRunId = (nextRunId: string) => {
		activeRunIdRef.current = nextRunId;
		setActiveRunId(nextRunId);
	};

	const selectedRun = useMemo(() => {
		return runs.find((run) => run.id === activeRunId) || runs[runs.length - 1] || null;
	}, [activeRunId, runs]);

	const selectedArtifacts = selectedRun ? artifactsByRun[selectedRun.id] || [] : [];
	const selectedEvents = selectedRun ? eventsByRun[selectedRun.id] || [] : [];

	const closeEventStream = () => {
		/** Close any existing SSE subscription before switching runs or threads. */
		if (eventSourceRef.current) {
			eventSourceRef.current.close();
			eventSourceRef.current = null;
		}
	};

	const applyRunPatch = (runId: string, patch: Partial<ISupeAskRun>) => {
		setRuns((current) => current.map((run) => (run.id === runId ? { ...run, ...patch } : run)));
	};

	const refreshThreadRail = async (preferredThreadId?: string) => {
		const response = await supeApi.listAskThreads();
		const nextThreads = response?.data?.data?.threads || [];
		setThreads(nextThreads);
		const nextSelected = resolveSelectedThreadId(nextThreads, selectedThreadIdRef.current, preferredThreadId);
		updateSelectedThreadId(nextSelected);
		return nextSelected;
	};

	const loadThreads = async (preferredThreadId?: string) => {
		try {
			setLoadingThreads(true);
			const nextSelected = await refreshThreadRail(preferredThreadId);
			if (nextSelected) {
				await loadThread(nextSelected, true);
			} else {
				closeEventStream();
				setMessages([]);
				setRuns([]);
				setArtifactsByRun({});
				setEventsByRun({});
				updateActiveRunId('');
			}
		} finally {
			setLoadingThreads(false);
		}
	};

	const connectRunEvents = (runId: string, threadId: string) => {
		closeEventStream();
		const source = new EventSource(supeApi.buildAskRunEventsUrl(runId), { withCredentials: true });
		eventSourceRef.current = source;
		source.onmessage = (event) => {
			try {
				const payload = JSON.parse(event.data) as ISupeAskEvent;
				setEventsByRun((current) => ({
					...current,
					[runId]: [...(current[runId] || []).filter((item) => item.id !== payload.id), payload]
				}));
				if (payload.eventType === 'run.codegen.completed') {
					applyRunPatch(runId, {
						title: String(payload.payload?.title || ''),
						assistant_summary: String(payload.payload?.assistantSummary || ''),
						python_code: String(payload.payload?.pythonCode || ''),
						artifact_plan: payload.payload?.artifactPlan || {}
					});
				}
				if (payload.eventType === 'run.artifact' && payload.payload?.artifact) {
					const artifact = payload.payload.artifact as ISupeAskArtifact;
					setArtifactsByRun((current) => ({
						...current,
						[runId]: [...(current[runId] || []).filter((item) => item.id !== artifact.id), artifact].sort(
							(left, right) => left.ordinal - right.ordinal
						)
					}));
				}
				if (payload.eventType === 'run.execution.progress') {
					applyRunPatch(runId, { status: 'running' });
				}
				if (payload.eventType === 'run.failed') {
					applyRunPatch(runId, { status: 'failed', error_message: String(payload.payload?.message || 'Run failed') });
					closeEventStream();
					void Promise.allSettled([loadThread(threadId, false), refreshThreadRail(threadId)]);
				}
				if (payload.eventType === 'run.completed') {
					applyRunPatch(runId, { status: 'completed' });
					closeEventStream();
					void Promise.allSettled([loadThread(threadId, false), refreshThreadRail(threadId)]);
				}
				if (payload.eventType === 'run.cancelled') {
					applyRunPatch(runId, { status: 'cancelled' });
					closeEventStream();
					void Promise.allSettled([loadThread(threadId, false), refreshThreadRail(threadId)]);
				}
			} catch (_error) {
				// Ignore malformed keep-alive events.
			}
		};
		source.onerror = () => {
			const run = runs.find((item) => item.id === runId);
			if (!run || ['completed', 'failed', 'cancelled'].includes(run.status)) {
				closeEventStream();
			}
		};
	};

	const loadThread = async (threadId: string, connectActiveRun = true) => {
		const requestId = loadThreadRequestRef.current + 1;
		loadThreadRequestRef.current = requestId;
		try {
			setLoadingThread(true);
			const response = await supeApi.getAskThread(threadId);
			if (requestId !== loadThreadRequestRef.current || selectedThreadIdRef.current !== threadId) {
				return;
			}
			const data = response?.data?.data || {};
			const nextMessages = data.messages || [];
			const nextRuns = data.runs || [];
			const nextArtifactsByRun = data.artifactsByRun || {};
			const nextEventsByRun = data.eventsByRun || {};
			setMessages(nextMessages);
			setRuns(nextRuns);
			setArtifactsByRun(nextArtifactsByRun);
			setEventsByRun(nextEventsByRun);
			const nextRunId = activeRunIdRef.current && nextRuns.some((run: ISupeAskRun) => run.id === activeRunIdRef.current)
				? activeRunIdRef.current
				: nextRuns[nextRuns.length - 1]?.id || '';
			updateActiveRunId(nextRunId);
			if (connectActiveRun && nextRunId) {
				const currentRun = nextRuns.find((run: ISupeAskRun) => run.id === nextRunId);
				if (currentRun && ['queued', 'running'].includes(currentRun.status)) {
					connectRunEvents(nextRunId, threadId);
				}
			}
		} finally {
			if (requestId === loadThreadRequestRef.current) {
				setLoadingThread(false);
			}
		}
	};

	const ensureThread = async () => {
		if (selectedThreadIdRef.current) {
			return selectedThreadIdRef.current;
		}
		const response = await supeApi.createAskThread({});
		const threadId = response?.data?.data?.thread?.id as string;
		updateSelectedThreadId(threadId);
		await loadThreads(threadId);
		return threadId;
	};

	const handleCreateThread = async () => {
		try {
			setComposerError('');
			closeEventStream();
			const response = await supeApi.createAskThread({});
			const threadId = response?.data?.data?.thread?.id as string;
			updateSelectedThreadId(threadId);
			setMessages([]);
			setRuns([]);
			setArtifactsByRun({});
			setEventsByRun({});
			updateActiveRunId('');
			setPanelTab('report');
			await loadThreads(threadId);
		} catch (error: any) {
			setComposerError(error?.response?.data?.detail || 'Failed to create Ask thread');
		}
	};

	const handleSubmit = async (presetQuestion?: string) => {
		const nextQuestion = (presetQuestion ?? query).trim();
		if (!nextQuestion) {
			setComposerError('Enter a question to start an Ask run.');
			return;
		}

		try {
			setSubmitting(true);
			setComposerError('');
			const threadId = await ensureThread();
			const response = await supeApi.createAskMessage(threadId, { question: nextQuestion });
			const runId = response?.data?.data?.run?.id as string;
			setQuery('');
			updateActiveRunId(runId);
			setPanelTab('report');
			await loadThread(threadId, false);
			await refreshThreadRail(threadId);
			connectRunEvents(runId, threadId);
		} catch (error: any) {
			setComposerError(error?.response?.data?.detail || error?.response?.data?.message || 'Failed to create Ask run');
		} finally {
			setSubmitting(false);
		}
	};

	const handleCancelRun = async () => {
		if (!selectedRun) {
			return;
		}
		try {
			await supeApi.cancelAskRun(selectedRun.id);
		} catch (error: any) {
			setComposerError(error?.response?.data?.detail || 'Failed to cancel Ask run');
		}
	};

	useEffect(() => {
		void loadThreads();
		return () => closeEventStream();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	useEffect(() => {
		if (!queryParam) {
			hydratedQueryRef.current = '';
			return;
		}
		if (queryParam !== hydratedQueryRef.current) {
			hydratedQueryRef.current = queryParam;
			setQuery(queryParam);
		}
	}, [queryParam]);

	return (
		<div className={styles.askPage}>
			<div className={styles.askHeader}>
				<div>
					<h1 className={styles.askHeaderTitle}>Ask</h1>
					<p className={styles.askHeaderSubtitle}>
						Conversational intelligence for live OMS snapshots, with streamed runs, reusable threads, and operator-friendly prompts.
					</p>
				</div>
				<Button icon={<PlusOutlined />} onClick={() => void handleCreateThread()}>
					New Thread
				</Button>
			</div>

			<div className={styles.askWorkspace}>
				<aside className={styles.askThreadsRail}>
					<div className={styles.askRailTitle}>Threads</div>
					{loadingThreads ? (
						<div className={styles.askRailLoader}>
							<Skeleton active paragraph={{ rows: 6 }} />
						</div>
					) : threads.length ? (
						<List
							dataSource={threads}
							renderItem={(thread) => (
								<List.Item>
									<button
										type="button"
										className={`${styles.askThreadItem} ${selectedThreadId === thread.id ? styles.askThreadItemActive : ''}`}
										onClick={() => {
											closeEventStream();
											updateActiveRunId('');
											updateSelectedThreadId(thread.id);
											void loadThread(thread.id, true);
										}}
									>
										<div className={styles.askThreadItemTitle}>{thread.title}</div>
										<div className={styles.askThreadItemMeta}>
											<Tag color={formatStatus(thread.latest_run_status)}>{thread.latest_run_status || 'idle'}</Tag>
											<span>{thread.latest_question || 'No runs yet'}</span>
										</div>
									</button>
								</List.Item>
							)}
						/>
					) : (
						<Empty
							description="Start your first Ask thread"
							image={Empty.PRESENTED_IMAGE_SIMPLE}
						>
							<Button type="primary" onClick={() => void ensureThread()}>
								Create Thread
							</Button>
						</Empty>
					)}
				</aside>

				<section className={styles.askConversationPane}>
					<div className={styles.askConversationBody}>
						{loadingThread ? (
							<Skeleton active paragraph={{ rows: 10 }} />
						) : messages.length ? (
							<div className={styles.askMessageStack}>
								{messages.map((message) => (
									<div
										key={message.id}
										className={`${styles.askMessageCard} ${
											message.role === 'user' ? styles.askMessageCardUser : styles.askMessageCardAssistant
										}`}
										>
											<div className={styles.askMessageMeta}>
												<span>{message.role === 'user' ? 'You' : 'Supe Ask'}</span>
												{message.run_id ? (
													<Button
														type="link"
														size="small"
														className={styles.askRunLink}
														onClick={() => {
															const nextRunId = String(message.run_id);
															updateActiveRunId(nextRunId);
															const nextRun = runs.find((run) => run.id === nextRunId);
															if (nextRun && ['queued', 'running'].includes(nextRun.status)) {
																connectRunEvents(nextRunId, selectedThreadIdRef.current);
																return;
															}
															closeEventStream();
														}}
													>
														View run
													</Button>
												) : null}
											</div>
										<div className={styles.askMessageContent}>{message.content}</div>
									</div>
								))}
							</div>
						) : (
							<div className={styles.askEmptyState}>
								<div className={styles.askEmptyIcon}>
									<MessageOutlined />
								</div>
								<h2 className={styles.askEmptyTitle}>What do you want to know?</h2>
								<p className={styles.askEmptySubtitle}>
									Start with one of the prototype leadership questions or type your own. The workspace will stream the run and keep the full context inside the thread.
								</p>
								<div className={styles.askChipRow}>
									{LEADERSHIP_PROMPT_SUGGESTIONS.slice(0, 6).map((item) => (
										<Button key={item} className={styles.askChip} onClick={() => setQuery(item)}>
											{item}
										</Button>
									))}
								</div>
							</div>
						)}
					</div>

					<div className={styles.askComposer}>
						<PromptCommandBar
							compact
							submitLabel={selectedRun && ['queued', 'running'].includes(selectedRun.status) ? 'Running' : 'Run Ask'}
							disabled={submitting}
							suggestions={LEADERSHIP_PROMPT_SUGGESTIONS}
							onQuickPick={(question) => {
								setQuery(question);
								void handleSubmit(question);
							}}
							onSubmit={(question) => {
								setQuery(question);
								void handleSubmit(question);
							}}
						/>
						<div className={styles.askComposerFooter}>
							<div className={styles.askComposerError}>{composerError || null}</div>
							<Space>
								{selectedRun && ['queued', 'running'].includes(selectedRun.status) ? (
									<Button icon={<StopOutlined />} onClick={handleCancelRun} aria-label="Cancel Ask run">
										Cancel Run
									</Button>
								) : null}
							</Space>
						</div>
					</div>
				</section>

				<aside className={styles.askDetailPane}>
					<div className={styles.askDetailHeader}>
						<div>
							<div className={styles.askRailTitle}>Run detail</div>
							<Typography.Text type="secondary">
								{selectedRun ? selectedRun.question : 'Select a thread to inspect the latest run.'}
							</Typography.Text>
						</div>
						{runs.length ? (
							<Select
								size="small"
								value={selectedRun?.id}
								onChange={(value) => {
									updateActiveRunId(value);
									const nextRun = runs.find((run) => run.id === value);
									if (nextRun && ['queued', 'running'].includes(nextRun.status)) {
										connectRunEvents(value, selectedThreadIdRef.current);
										return;
									}
									closeEventStream();
								}}
								style={{ minWidth: 180 }}
								options={runs.map((run, index) => ({
									label: buildRunLabel(run, index),
									value: run.id
								}))}
							/>
						) : null}
					</div>

					{selectedRun ? (
						<>
							<div className={styles.askRunStatusRow}>
								<Tag color={formatStatus(selectedRun.status)}>{selectedRun.status}</Tag>
								{selectedRun.error_message ? <span className={styles.askRunError}>{selectedRun.error_message}</span> : null}
							</div>

							<div className={styles.askEventList}>
								{selectedEvents.map((event) => (
									<div key={event.id} className={styles.askEventItem}>
										<div className={styles.askEventType}>{describeEvent(event.eventType)}</div>
										<div className={styles.askEventMeta}>
											{event.payload?.message || event.payload?.title || event.payload?.runner || ''}
										</div>
									</div>
								))}
							</div>

							<Tabs
								activeKey={panelTab}
								onChange={(value) => setPanelTab(value as 'report' | 'code')}
								items={[
									{
										key: 'report',
										label: 'Report',
										children: selectedArtifacts.length ? (
											<div className={styles.askArtifactsStack}>
												{selectedArtifacts.map((artifact) => (
													<AskArtifactRenderer key={artifact.id} artifact={artifact} />
												))}
											</div>
										) : (
											<Empty description="No report artifacts yet" image={Empty.PRESENTED_IMAGE_SIMPLE} />
										)
									},
									{
										key: 'code',
										label: (
											<span>
												<CodeOutlined /> Code
											</span>
										),
										children: (
											<pre className={styles.askCodeBlock}>{selectedRun.python_code || 'No code generated yet.'}</pre>
										)
									}
								]}
							/>
						</>
					) : (
						<Empty description="No run selected" image={Empty.PRESENTED_IMAGE_SIMPLE} />
					)}
				</aside>
			</div>
		</div>
	);
}
