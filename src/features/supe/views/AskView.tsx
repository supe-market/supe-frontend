/**
 * Ask workspace view.
 *
 * Leadership-console style Ask surface with streamed narrative/code state,
 * inline structured report blocks, and a separate inspector for report/code.
 */
import { Button, Empty, Skeleton, Space, Table, Tag, Tabs, Typography } from 'antd';
import { CodeOutlined, CopyOutlined, MessageOutlined, PlusOutlined, ShareAltOutlined, StopOutlined } from '@ant-design/icons';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import supeApi from '../api';
import { LEADERSHIP_PROMPT_SUGGESTIONS, PromptCommandBar } from '../components/PromptCommandBar';
import type {
	ISupeAskArtifact,
	ISupeAskArtifactPlan,
	ISupeAskEvent,
	ISupeAskKeyHighlight,
	ISupeAskMessage,
	ISupeAskRun,
	ISupeAskThread
} from '../types';
import styles from '../index.module.scss';

const ASK_CHART_COLORS = ['#1d4ed8', '#0f766e', '#b45309', '#be123c', '#7c3aed', '#0369a1'];
const ASK_THREAD_EVENT = 'supe-ask-threads-updated';

function formatStatus(status?: string | null) {
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
	switch (eventType) {
		case 'run.created':
			return 'Run created';
		case 'run.planning.delta':
			return 'Planning';
		case 'run.planning.completed':
			return 'Planning complete';
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
		case 'run.codegen.delta':
			return 'Codegen stream';
		case 'run.codegen.completed':
			return 'Code generation completed';
		case 'run.execution.started':
			return 'Execution started';
		case 'run.execution.progress':
			return 'Execution update';
		case 'run.execution.stdout':
			return 'Execution log';
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
	return run.title || `Run ${index + 1}`;
}

function AskChart({ artifact }: { artifact: ISupeAskArtifact }) {
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
							<Line key={series.dataKey} type="monotone" dataKey={series.dataKey} name={series.name} stroke={series.color} strokeWidth={2} dot={false} />
						)
					)}
				</ComposedChart>
			</ResponsiveContainer>
		</div>
	);
}

function appendChunk(current: string, next: string) {
	if (!next) return current;
	return current ? `${current} ${next}`.trim() : next.trim();
}

function takeSuggestedQuestions(plan?: ISupeAskArtifactPlan | null) {
	return Array.isArray(plan?.suggested_next_questions) ? plan!.suggested_next_questions.slice(0, 3) : [];
}

function toneClassName(tone: string) {
	const normalized = tone.toLowerCase();
	if (normalized.includes('easy') || normalized.includes('positive') || normalized.includes('good')) {
		return styles.askHighlightTonePositive;
	}
	if (normalized.includes('medium') || normalized.includes('warning')) {
		return styles.askHighlightToneWarning;
	}
	return styles.askHighlightToneCritical;
}

function buildShareText(run: ISupeAskRun) {
	const lines = [run.title || run.question, run.assistant_summary || ''];
	const highlights = Array.isArray(run.artifact_plan?.key_highlights) ? run.artifact_plan?.key_highlights : [];
	for (const highlight of highlights || []) {
		lines.push(`- ${highlight.title}: ${highlight.value}`);
	}
	return lines.filter(Boolean).join('\n');
}

function LeadershipHighlights({ highlights }: { highlights: ISupeAskKeyHighlight[] }) {
	if (!highlights.length) {
		return null;
	}
	return (
		<div className={styles.askHighlightsCard}>
			<div className={styles.askSectionHeader}>
				<span>Key Highlights</span>
				<Typography.Text type="secondary">What needs attention</Typography.Text>
			</div>
			<div className={styles.askHighlightsList}>
				{highlights.map((highlight, index) => (
					<div key={`${highlight.title}_${index}`} className={styles.askHighlightRow}>
						<div className={styles.askHighlightIndex}>{index + 1}</div>
						<div className={styles.askHighlightBody}>
							<div className={styles.askHighlightHeading}>
								<span>{highlight.title}</span>
								<span className={`${styles.askHighlightTone} ${toneClassName(highlight.tone)}`}>{highlight.tone}</span>
							</div>
							<div className={styles.askHighlightDetail}>{highlight.detail}</div>
						</div>
						<div className={styles.askHighlightValue}>{highlight.value}</div>
					</div>
				))}
			</div>
		</div>
	);
}

function ReportSectionRail({ plan }: { plan?: ISupeAskArtifactPlan | null }) {
	const sections = Array.isArray(plan?.report_sections) ? plan!.report_sections : [];
	if (!sections.length) {
		return null;
	}
	return (
		<div className={styles.askSectionRail}>
			{sections.map((section) => (
				<div key={`${section.title}_${section.subtitle}`} className={styles.askSectionRailItem}>
					<div className={styles.askSectionRailTitle}>{section.title}</div>
					<div className={styles.askSectionRailSubtitle}>{section.subtitle}</div>
				</div>
			))}
		</div>
	);
}

function AskArtifactRenderer({ artifact }: { artifact: ISupeAskArtifact }) {
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
				<div className={styles.askMetricMetaRow}>
					{artifact.payload?.benchmark ? <span>{artifact.payload?.benchmark}</span> : <span>{artifact.title}</span>}
					<span className={styles.askMetricTone}>{artifact.payload?.tone || 'neutral'}</span>
				</div>
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

function StructuredAssistantMessage({
	run,
	artifacts,
	onFollowUp
}: {
	run: ISupeAskRun;
	artifacts: ISupeAskArtifact[];
	onFollowUp: (question: string) => void;
}) {
	const followUps = takeSuggestedQuestions(run.artifact_plan);
	const shareText = buildShareText(run);
	return (
		<div className={styles.askAssistantResponse}>
			<div className={styles.askInterpretationRow}>
				<span className={styles.askEngineBadge}>Built-in</span>
				{run.retrieval_context?.finalContext?.questionGrounding?.intent ? (
					<span className={styles.askInterpretationText}>
						Understood as: {String(run.retrieval_context.finalContext.questionGrounding.intent).replace(/_/g, ' ')}
					</span>
				) : null}
			</div>

			{run.assistant_summary ? <div className={styles.askSummaryText}>{run.assistant_summary}</div> : null}
			<ReportSectionRail plan={run.artifact_plan} />

			{artifacts.length ? (
				<div className={styles.askInlineArtifactStack}>
					{artifacts.map((artifact) => (
						<AskArtifactRenderer key={artifact.id} artifact={artifact} />
					))}
				</div>
			) : null}

			<LeadershipHighlights highlights={run.artifact_plan?.key_highlights || []} />

			<div className={styles.askInlineActions}>
				<Button
					size="small"
					icon={<ShareAltOutlined />}
					onClick={async () => {
						if (navigator.share) {
							try {
								await navigator.share({ title: run.title || 'Supe Ask', text: shareText });
								return;
							} catch {
								// fall through to clipboard
							}
						}
						await navigator.clipboard.writeText(shareText);
					}}
				>
					Share
				</Button>
				<Button
					size="small"
					icon={<CopyOutlined />}
					onClick={async () => {
						await navigator.clipboard.writeText(shareText);
					}}
				>
					Copy
				</Button>
			</div>

			{followUps.length ? (
				<div className={styles.askFollowUpRow}>
					{followUps.map((question) => (
						<button key={question} type="button" className={styles.askFollowUpChip} onClick={() => onFollowUp(question)}>
							{question}
						</button>
					))}
				</div>
			) : null}
		</div>
	);
}

export function AskView() {
	const [searchParams, setSearchParams] = useSearchParams();
	const initialQuery = searchParams.get('q') || '';
	const threadParam = searchParams.get('thread') || '';
	const queryParam = searchParams.get('q') || '';

	const [threads, setThreads] = useState<ISupeAskThread[]>([]);
	const [selectedThreadId, setSelectedThreadId] = useState('');
	const [messages, setMessages] = useState<ISupeAskMessage[]>([]);
	const [runs, setRuns] = useState<ISupeAskRun[]>([]);
	const [artifactsByRun, setArtifactsByRun] = useState<Record<string, ISupeAskArtifact[]>>({});
	const [eventsByRun, setEventsByRun] = useState<Record<string, ISupeAskEvent[]>>({});
	const [streamedPlanningByRun, setStreamedPlanningByRun] = useState<Record<string, string>>({});
	const [streamedCodeByRun, setStreamedCodeByRun] = useState<Record<string, string>>({});
	const [stdoutByRun, setStdoutByRun] = useState<Record<string, string[]>>({});
	const [activeRunId, setActiveRunId] = useState('');
	const [query, setQuery] = useState(initialQuery);
	const [loadingThreads, setLoadingThreads] = useState(true);
	const [loadingThread, setLoadingThread] = useState(false);
	const [submitting, setSubmitting] = useState(false);
	const [composerError, setComposerError] = useState('');
	const [panelTab, setPanelTab] = useState<'report' | 'code'>('report');

	const eventSourceRef = useRef<EventSource | null>(null);
	const hydratedQueryRef = useRef(initialQuery);
	const bootstrapRunRef = useRef('');
	const selectedThreadIdRef = useRef('');
	const activeRunIdRef = useRef('');
	const loadThreadRequestRef = useRef(0);

	const syncThreadParam = (nextThreadId: string) => {
		const nextParams = new URLSearchParams(searchParams);
		if (nextThreadId) {
			nextParams.set('thread', nextThreadId);
		} else {
			nextParams.delete('thread');
		}
		if (nextParams.toString() !== searchParams.toString()) {
			setSearchParams(nextParams, { replace: true });
		}
	};

	const updateSelectedThreadId = (nextThreadId: string, syncUrl = true) => {
		selectedThreadIdRef.current = nextThreadId;
		setSelectedThreadId(nextThreadId);
		if (syncUrl) {
			syncThreadParam(nextThreadId);
		}
	};

	const updateActiveRunId = (nextRunId: string) => {
		activeRunIdRef.current = nextRunId;
		setActiveRunId(nextRunId);
	};

	const selectedRun = useMemo(() => runs.find((run) => run.id === activeRunId) || runs[runs.length - 1] || null, [activeRunId, runs]);
	const selectedArtifacts = selectedRun ? artifactsByRun[selectedRun.id] || [] : [];
	const selectedEvents = selectedRun ? eventsByRun[selectedRun.id] || [] : [];
	const selectedStdout = selectedRun ? stdoutByRun[selectedRun.id] || [] : [];
	const streamedNarrative = selectedRun ? streamedPlanningByRun[selectedRun.id] || '' : '';
	const streamedCode = selectedRun ? streamedCodeByRun[selectedRun.id] || selectedRun.python_code || '' : '';

	const closeEventStream = () => {
		if (eventSourceRef.current) {
			eventSourceRef.current.close();
			eventSourceRef.current = null;
		}
	};

	const applyRunPatch = (runId: string, patch: Partial<ISupeAskRun>) => {
		setRuns((current) => current.map((run) => (run.id === runId ? { ...run, ...patch } : run)));
	};

	const hydrateRunStreams = (nextEventsByRun: Record<string, ISupeAskEvent[]>, nextRuns: ISupeAskRun[]) => {
		const nextPlanning: Record<string, string> = {};
		const nextCode: Record<string, string> = {};
		const nextStdout: Record<string, string[]> = {};
		for (const run of nextRuns) {
			const runEvents = nextEventsByRun[run.id] || [];
			let planningBuffer = '';
			let codeBuffer = run.python_code || '';
			const stdoutLines: string[] = [];
			for (const event of runEvents) {
				if (event.eventType === 'run.planning.delta') {
					planningBuffer = appendChunk(planningBuffer, String(event.payload?.delta || ''));
				}
				if (event.eventType === 'run.codegen.delta') {
					codeBuffer = appendChunk(codeBuffer, String(event.payload?.delta || ''));
				}
				if (event.eventType === 'run.execution.stdout') {
					const line = String(event.payload?.line || '');
					if (line) {
						stdoutLines.push(line);
					}
				}
			}
			nextPlanning[run.id] = planningBuffer;
			nextCode[run.id] = codeBuffer;
			nextStdout[run.id] = stdoutLines;
		}
		setStreamedPlanningByRun(nextPlanning);
		setStreamedCodeByRun(nextCode);
		setStdoutByRun(nextStdout);
	};

	const refreshThreadRail = async (preferredThreadId?: string) => {
		const response = await supeApi.listAskThreads();
		const nextThreads = response?.data?.data?.threads || [];
		setThreads(nextThreads);
		window.dispatchEvent(new CustomEvent(ASK_THREAD_EVENT));
		const preferred = preferredThreadId || threadParam;
		const nextSelected =
			(preferred && nextThreads.some((thread: ISupeAskThread) => thread.id === preferred) ? preferred : '') ||
			(selectedThreadIdRef.current && nextThreads.some((thread: ISupeAskThread) => thread.id === selectedThreadIdRef.current)
				? selectedThreadIdRef.current
				: nextThreads[0]?.id || '');
		updateSelectedThreadId(nextSelected);
		return nextSelected;
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
				if (payload.eventType === 'run.planning.delta') {
					setStreamedPlanningByRun((current) => ({ ...current, [runId]: appendChunk(current[runId] || '', String(payload.payload?.delta || '')) }));
				}
				if (payload.eventType === 'run.codegen.delta') {
					setStreamedCodeByRun((current) => ({ ...current, [runId]: appendChunk(current[runId] || '', String(payload.payload?.delta || '')) }));
				}
				if (payload.eventType === 'run.codegen.completed') {
					applyRunPatch(runId, {
						title: String(payload.payload?.title || ''),
						assistant_summary: String(payload.payload?.assistantSummary || ''),
						python_code: String(payload.payload?.pythonCode || ''),
						artifact_plan: payload.payload?.artifactPlan || {}
					});
					setStreamedCodeByRun((current) => ({ ...current, [runId]: String(payload.payload?.pythonCode || current[runId] || '') }));
				}
				if (payload.eventType === 'run.execution.stdout') {
					const line = String(payload.payload?.line || '');
					if (line) {
						setStdoutByRun((current) => ({ ...current, [runId]: [...(current[runId] || []), line] }));
					}
				}
				if (payload.eventType === 'run.artifact' && payload.payload?.artifact) {
					const artifact = payload.payload.artifact as ISupeAskArtifact;
					setArtifactsByRun((current) => ({
						...current,
						[runId]: [...(current[runId] || []).filter((item) => item.id !== artifact.id), artifact].sort((left, right) => left.ordinal - right.ordinal)
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
			} catch {
				// ignore malformed keepalive events
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
			hydrateRunStreams(nextEventsByRun, nextRuns);
			const nextRunId =
				activeRunIdRef.current && nextRuns.some((run: ISupeAskRun) => run.id === activeRunIdRef.current)
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
				setStreamedPlanningByRun({});
				setStreamedCodeByRun({});
				setStdoutByRun({});
				updateActiveRunId('');
			}
		} finally {
			setLoadingThreads(false);
		}
	};

	const ensureThread = async () => {
		if (selectedThreadIdRef.current) {
			return selectedThreadIdRef.current;
		}
		const response = await supeApi.createAskThread({});
		const threadId = String(response?.data?.data?.thread?.id || '');
		updateSelectedThreadId(threadId);
		window.dispatchEvent(new CustomEvent(ASK_THREAD_EVENT));
		await loadThreads(threadId);
		return threadId;
	};

	const handleCreateThread = async () => {
		try {
			setComposerError('');
			closeEventStream();
			const response = await supeApi.createAskThread({});
			const threadId = String(response?.data?.data?.thread?.id || '');
			updateSelectedThreadId(threadId);
			setMessages([]);
			setRuns([]);
			setArtifactsByRun({});
			setEventsByRun({});
			setStreamedPlanningByRun({});
			setStreamedCodeByRun({});
			setStdoutByRun({});
			updateActiveRunId('');
			setPanelTab('report');
			window.dispatchEvent(new CustomEvent(ASK_THREAD_EVENT));
			await loadThreads(threadId);
		} catch (error: any) {
			setComposerError(error?.response?.data?.detail || 'Failed to create Ask thread');
		}
	};

	const handleSubmit = async (presetQuestion?: string) => {
		const nextQuestion = (presetQuestion ?? query).trim();
		if (!nextQuestion) {
			setComposerError('Enter a question to start an Ask run.');
			return false;
		}

		try {
			setSubmitting(true);
			setComposerError('');
			const threadId = await ensureThread();
			const response = await supeApi.createAskMessage(threadId, { question: nextQuestion });
			const runId = String(response?.data?.data?.run?.id || '');
			setQuery('');
			updateActiveRunId(runId);
			setPanelTab('report');
			setStreamedPlanningByRun((current) => ({ ...current, [runId]: '' }));
			setStreamedCodeByRun((current) => ({ ...current, [runId]: '' }));
			setStdoutByRun((current) => ({ ...current, [runId]: [] }));
			await loadThread(threadId, false);
			await refreshThreadRail(threadId);
			connectRunEvents(runId, threadId);
			return true;
		} catch (error: any) {
			setComposerError(error?.response?.data?.detail || error?.response?.data?.message || 'Failed to create Ask run');
			return false;
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
		void loadThreads(threadParam || undefined);
		return () => closeEventStream();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [threadParam]);

	useEffect(() => {
		if (!queryParam) {
			hydratedQueryRef.current = '';
			bootstrapRunRef.current = '';
			return;
		}
		if (queryParam !== hydratedQueryRef.current) {
			hydratedQueryRef.current = queryParam;
			setQuery(queryParam);
		}
	}, [queryParam]);

	useEffect(() => {
		if (!queryParam || loadingThreads || submitting) {
			return;
		}
		if (bootstrapRunRef.current === queryParam) {
			return;
		}

		bootstrapRunRef.current = queryParam;
		setQuery(queryParam);
		void (async () => {
			const started = await handleSubmit(queryParam);
			if (!started) {
				bootstrapRunRef.current = '';
				return;
			}
			try {
				const nextParams = new URLSearchParams(searchParams);
				nextParams.delete('q');
				setSearchParams(nextParams, { replace: true });
			} catch {
				bootstrapRunRef.current = '';
			}
		})();
	}, [loadingThreads, queryParam, searchParams, setSearchParams, submitting]);

	const latestAssistantRunId = [...messages].reverse().find((message) => message.role === 'assistant' && message.run_id)?.run_id || '';
	const showStreamingBubble =
		selectedRun &&
		['queued', 'running'].includes(selectedRun.status) &&
		(Boolean(streamedNarrative) || Boolean(streamedCode) || Boolean(selectedStdout.length)) &&
		String(latestAssistantRunId || '') !== selectedRun.id;

	return (
		<div className={styles.askPage}>
			<div className={styles.askHeader}>
				<div>
					<h1 className={styles.askHeaderTitle}>Ask</h1>
					<p className={styles.askHeaderSubtitle}>
						Leadership-console Ask with structured report blocks, live code streaming, and reusable analytical threads.
					</p>
				</div>
				<Space>
					{selectedRun ? <Tag color={formatStatus(selectedRun.status)}>{selectedRun.status}</Tag> : null}
					<Button icon={<PlusOutlined />} onClick={() => void handleCreateThread()}>
						New chat
					</Button>
				</Space>
			</div>

			<div className={styles.askWorkspaceWide}>
				<section className={styles.askConversationPane}>
					<div className={styles.askConversationBody}>
						{loadingThread || (loadingThreads && !selectedThreadId) ? (
							<Skeleton active paragraph={{ rows: 10 }} />
						) : messages.length ? (
							<div className={styles.askMessageStack}>
								{messages.map((message) => {
									const messageRun = message.run_id ? runs.find((run) => run.id === String(message.run_id)) || null : null;
									const messageArtifacts = messageRun ? artifactsByRun[messageRun.id] || [] : [];
									return (
										<div
											key={message.id}
											className={`${styles.askMessageCard} ${
												message.role === 'user' ? styles.askMessageCardUser : styles.askMessageCardAssistant
											}`}
										>
											<div className={styles.askMessageMeta}>
												<span>{message.role === 'user' ? 'You' : 'Supe Ask'}</span>
												{messageRun ? (
													<Button
														type="link"
														size="small"
														className={styles.askRunLink}
														onClick={() => {
															updateActiveRunId(messageRun.id);
															if (['queued', 'running'].includes(messageRun.status)) {
																connectRunEvents(messageRun.id, selectedThreadIdRef.current);
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
											{messageRun ? <StructuredAssistantMessage run={messageRun} artifacts={messageArtifacts} onFollowUp={(question) => void handleSubmit(question)} /> : null}
										</div>
									);
								})}

								{showStreamingBubble ? (
									<div className={`${styles.askMessageCard} ${styles.askMessageCardAssistant}`}>
										<div className={styles.askMessageMeta}>
											<span>Supe Ask</span>
											<Tag color="processing">live</Tag>
										</div>
										<div className={styles.askStreamingBody}>
											{streamedNarrative ? <div className={styles.askSummaryText}>{streamedNarrative}</div> : null}
											{streamedCode ? (
												<div className={styles.askStreamingCodeStatus}>
													<CodeOutlined /> Streaming code preview into the inspector
												</div>
											) : null}
											{selectedStdout.length ? <pre className={styles.askInlineLogBlock}>{selectedStdout.join('\n')}</pre> : null}
										</div>
									</div>
								) : null}
							</div>
						) : (
							<div className={styles.askEmptyState}>
								<div className={styles.askEmptyIcon}>
									<MessageOutlined />
								</div>
								<h2 className={styles.askEmptyTitle}>What do you want to know?</h2>
								<p className={styles.askEmptySubtitle}>
									Ask about revenue, coverage, outstanding, pipeline health, or follow-up actions. The answer will stream into a leadership-console report.
								</p>
								<div className={styles.askChipRow}>
									{LEADERSHIP_PROMPT_SUGGESTIONS.slice(0, 3).map((item) => (
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
					<Tabs
						activeKey={panelTab}
						onChange={(value) => setPanelTab(value as 'report' | 'code')}
						items={[
							{
								key: 'report',
								label: 'Report',
								children: selectedRun ? (
									<div className={styles.askInspectorStack}>
										<div className={styles.askRunStatusRow}>
											<Tag color={formatStatus(selectedRun.status)}>{selectedRun.status}</Tag>
											{selectedRun.error_message ? <span className={styles.askRunError}>{selectedRun.error_message}</span> : null}
										</div>
										<ReportSectionRail plan={selectedRun.artifact_plan} />
										<LeadershipHighlights highlights={selectedRun.artifact_plan?.key_highlights || []} />
										{selectedArtifacts.length ? (
											<div className={styles.askArtifactsStack}>
												{selectedArtifacts.map((artifact) => (
													<AskArtifactRenderer key={artifact.id} artifact={artifact} />
												))}
											</div>
										) : (
											<Empty description="No report artifacts yet" image={Empty.PRESENTED_IMAGE_SIMPLE} />
										)}
									</div>
								) : (
									<Empty description="No report yet" image={Empty.PRESENTED_IMAGE_SIMPLE} />
								)
							},
							{
								key: 'code',
								label: (
									<span>
										<CodeOutlined /> Code
									</span>
								),
								children: selectedRun ? (
									<div className={styles.askCodePanel}>
										<pre className={styles.askCodeBlock}>{streamedCode || selectedRun.python_code || 'No code generated yet.'}</pre>
										{selectedStdout.length ? <pre className={styles.askLogBlock}>{selectedStdout.join('\n')}</pre> : null}
									</div>
								) : (
									<Empty description="No code yet" image={Empty.PRESENTED_IMAGE_SIMPLE} />
								)
							}
						]}
					/>
				</aside>
			</div>
		</div>
	);
}
