/**
 * Ask workspace view — redesigned.
 *
 * Single conversation card with inline structured reports, a thinking
 * animation during processing, and a ChatGPT Canvas–style sliding code
 * pane on the right.
 */
import { Button, Skeleton, Space, Table, Tag, Typography } from 'antd';
import {
	CloseOutlined,
	CodeOutlined,
	CompressOutlined,
	CopyOutlined,
	ExpandOutlined,
	LoadingOutlined,
	MessageOutlined,
	PlusOutlined,
	ShareAltOutlined,
	StopOutlined
} from '@ant-design/icons';
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

/* ─────────────────────── Utility helpers ─────────────────────── */

function formatStatus(status?: string | null) {
	switch (status) {
		case 'completed': return 'success';
		case 'failed': return 'error';
		case 'cancelled': return 'default';
		case 'running': return 'processing';
		default: return 'warning';
	}
}

function appendChunk(current: string, next: string) {
	if (!next) return current;
	return current ? `${current} ${next}`.trim() : next.trim();
}

function takeSuggestedQuestions(plan?: ISupeAskArtifactPlan | null) {
	return Array.isArray(plan?.suggested_next_questions) ? plan!.suggested_next_questions.slice(0, 3) : [];
}

function takeWorkingAssumptions(plan?: ISupeAskArtifactPlan | null) {
	return Array.isArray(plan?.working_assumptions)
		? plan!.working_assumptions.filter((item): item is string => Boolean(String(item || '').trim())).slice(0, 4)
		: [];
}

function toneClassName(tone: string) {
	const n = tone.toLowerCase();
	if (n.includes('easy') || n.includes('positive') || n.includes('good')) return styles.askHighlightTonePositive;
	if (n.includes('medium') || n.includes('warning')) return styles.askHighlightToneWarning;
	return styles.askHighlightToneCritical;
}

function buildShareText(run: ISupeAskRun) {
	const lines = [run.title || run.question, run.assistant_summary || ''];
	const highlights = Array.isArray(run.artifact_plan?.key_highlights) ? run.artifact_plan?.key_highlights : [];
	for (const h of highlights || []) lines.push(`- ${h.title}: ${h.value}`);
	return lines.filter(Boolean).join('\n');
}

function isImplementationPlaceholder(value?: string | null) {
	const text = String(value || '').trim().toLowerCase();
	if (!text) return true;
	return /calculated in script|computed at runtime|calculated at runtime|runtime value|from sql|from query|query result|script output|calculated from |identified from /.test(text);
}

function formatCompactNumber(value: number, maximumFractionDigits = 0) {
	return new Intl.NumberFormat('en-IN', { maximumFractionDigits }).format(value);
}

function formatMetricValue(payload: Record<string, any>) {
	const rawValue = payload?.value;
	if (rawValue == null || rawValue === '') return '';
	const numericValue = Number(rawValue);
	if (!Number.isFinite(numericValue)) return String(rawValue);
	const unit = String(payload?.unit || 'number');
	if (unit === 'currency') return `₹${formatCompactNumber(numericValue, 0)}`;
	if (unit === 'percent') return `${formatCompactNumber(numericValue, 1)}%`;
	return formatCompactNumber(numericValue, 0);
}

function formatMetricDelta(payload: Record<string, any>) {
	const explicitDelta = String(payload?.deltaText || '').trim();
	if (explicitDelta) {
		const explicitLabel = String(payload?.deltaLabel || '').trim();
		return explicitLabel ? `${explicitDelta} ${explicitLabel}` : explicitDelta;
	}
	const delta = Number(payload?.percentDelta);
	if (!Number.isFinite(delta)) return '';
	const prefix = delta > 0 ? '+' : '';
	return `${prefix}${formatCompactNumber(delta, 1)}% vs previous`;
}

/* ─────────────────────── Thinking indicator ──────────────────── */

const THINKING_MESSAGES: Record<string, string> = {
	retrieval: 'Analyzing your question...',
	codegen: 'Generating analysis code...',
	execution: 'Running analysis...',
};

function ThinkingIndicator({ stage, message }: { stage: string; message?: string }) {
	const label = message || THINKING_MESSAGES[stage] || 'Thinking...';
	return (
		<div className={styles.askThinking}>
			<div className={styles.askThinkingDots}>
				<span /><span /><span />
			</div>
			<span className={styles.askThinkingLabel}>{label}</span>
		</div>
	);
}

/* ─────────────────────── Chart renderer ──────────────────────── */

function AskChart({ artifact }: { artifact: ISupeAskArtifact }) {
	const payload = artifact.payload || {};
	const traces = Array.isArray(payload?.data) ? payload.data : [];
	const chartRowOrder: string[] = [];
	const chartRowMap = new Map<string, Record<string, number | string | null>>();
	const usedSeriesKeys = new Set<string>();
	const chartSeries = traces.reduce<Array<{ color: string; dataKey: string; name: string; type: 'bar' | 'line' }>>(
		(acc, trace, i) => {
			const xValues = Array.isArray(trace?.x) ? trace.x : [];
			const yValues = Array.isArray(trace?.y) ? trace.y : [];
			const len = Math.max(xValues.length, yValues.length);
			if (!len) return acc;
			const baseName = String(trace?.name || `Series ${i + 1}`);
			let dataKey = baseName;
			let dup = 2;
			while (usedSeriesKeys.has(dataKey)) { dataKey = `${baseName} ${dup}`; dup++; }
			usedSeriesKeys.add(dataKey);
			for (let j = 0; j < len; j++) {
				const label = String(xValues[j] ?? j + 1);
				if (!chartRowMap.has(label)) { chartRowMap.set(label, { name: label }); chartRowOrder.push(label); }
				const v = Number(yValues[j] ?? null);
				chartRowMap.get(label)![dataKey] = Number.isFinite(v) ? v : null;
			}
			acc.push({ color: ASK_CHART_COLORS[i % ASK_CHART_COLORS.length], dataKey, name: baseName, type: trace?.type === 'bar' ? 'bar' : 'line' });
			return acc;
		}, []);
	const chartRows = chartRowOrder.map((l) => chartRowMap.get(l) || { name: l });
	if (!chartRows.length || !chartSeries.length) {
		return <div className={styles.askArtifactFallback}><Typography.Text type="secondary">Chart could not be rendered.</Typography.Text></div>;
	}
	return (
		<div className={styles.askChartShell}>
			<ResponsiveContainer width="100%" height={260}>
				<ComposedChart data={chartRows}>
					<CartesianGrid strokeDasharray="3 3" />
					<XAxis dataKey="name" tickLine={false} axisLine={false} />
					<YAxis tickLine={false} axisLine={false} />
					<Tooltip /><Legend />
					{chartSeries.map((s) => s.type === 'bar'
						? <Bar key={s.dataKey} dataKey={s.dataKey} name={s.name} fill={s.color} radius={[6, 6, 0, 0]} />
						: <Line key={s.dataKey} type="monotone" dataKey={s.dataKey} name={s.name} stroke={s.color} strokeWidth={2} dot={false} />
					)}
				</ComposedChart>
			</ResponsiveContainer>
		</div>
	);
}

/* ─────────────────────── Artifact renderer ───────────────────── */

function AskArtifactRenderer({ artifact }: { artifact: ISupeAskArtifact }) {
	if (artifact.artifact_type === 'markdown') {
		return (
			<div className={`${styles.askArtifactCard} ${styles.askArtifactCardWide}`}>
				<div className={styles.askArtifactHeader}>{artifact.title}</div>
				<div className={styles.askMarkdownBlock}>{artifact.payload?.markdown || ''}</div>
			</div>
		);
	}
	if (artifact.artifact_type === 'metric') {
		const deltaText = formatMetricDelta(artifact.payload || {});
		return (
			<div className={styles.askMetricArtifact}>
				<div className={styles.askMetricLabel}>{artifact.payload?.label}</div>
				<div className={styles.askMetricValue}>{formatMetricValue(artifact.payload || {})}</div>
				<div className={styles.askMetricMetaRow}>
					<span>{deltaText || artifact.payload?.benchmark || artifact.title}</span>
					<span className={styles.askMetricTone}>{artifact.payload?.tone || 'neutral'}</span>
				</div>
			</div>
		);
	}
	if (artifact.artifact_type === 'section') {
		return (
			<div className={styles.askArtifactSection}>
				<div className={styles.askArtifactSectionTitle}>{artifact.payload?.title || artifact.title}</div>
				{artifact.payload?.subtitle ? <div className={styles.askArtifactSectionSubtitle}>{artifact.payload.subtitle}</div> : null}
			</div>
		);
	}
	if (artifact.artifact_type === 'table') {
		const columns = Array.isArray(artifact.payload?.columns) ? artifact.payload.columns : [];
		const rows = Array.isArray(artifact.payload?.rows) ? artifact.payload.rows : [];
		return (
			<div className={`${styles.askArtifactCard} ${styles.askArtifactCardWide}`}>
				<div className={styles.askArtifactHeader}>
					<span>{artifact.title}</span>
					<Typography.Text type="secondary">Rows {artifact.payload?.rowCount ?? rows.length}</Typography.Text>
				</div>
				<Table size="small" pagination={false} rowKey={(_, i) => `${artifact.id}_${i}`} scroll={{ x: true }}
					dataSource={rows}
					columns={columns.map((c: string) => ({ title: c, dataIndex: c, key: c, render: (v: any) => (v == null ? '-' : String(v)) }))} />
			</div>
		);
	}
	if (artifact.artifact_type === 'plotly') {
		return (
			<div className={`${styles.askArtifactCard} ${styles.askArtifactCardWide}`}>
				<div className={styles.askArtifactHeader}>{artifact.title}</div>
				<AskChart artifact={artifact} />
			</div>
		);
	}
	if (artifact.artifact_type === 'log') {
		return (
			<div className={`${styles.askArtifactCard} ${styles.askArtifactCardWide}`}>
				<div className={styles.askArtifactHeader}>{artifact.title}</div>
				<pre className={styles.askLogBlock}>{(artifact.payload?.lines || []).join('\n')}</pre>
			</div>
		);
	}
	return <div className={styles.askArtifactFallback}><Typography.Text type="secondary">Unsupported: {artifact.artifact_type}</Typography.Text></div>;
}

/* ─────────────────────── Highlights ──────────────────────────── */

function LeadershipHighlights({ highlights, running }: { highlights: ISupeAskKeyHighlight[]; running: boolean }) {
	if (!highlights.length) return null;
	return (
		<div className={styles.askHighlightsCard}>
			<div className={styles.askSectionHeader}><span>Key Highlights</span><Typography.Text type="secondary">What needs attention</Typography.Text></div>
			<div className={styles.askHighlightsList}>
				{highlights.map((h, i) => {
					const hasValue = !isImplementationPlaceholder(h.value);
					return (
						<div key={`${h.title}_${i}`} className={styles.askHighlightRow}>
							<div className={styles.askHighlightIndex}>{i + 1}</div>
							<div className={styles.askHighlightBody}>
								<div className={styles.askHighlightHeading}><span>{h.title}</span><span className={`${styles.askHighlightTone} ${toneClassName(h.tone)}`}>{h.tone}</span></div>
								<div className={styles.askHighlightDetail}>{h.detail}</div>
							</div>
							{hasValue
								? <div className={styles.askHighlightValue}>{h.value}</div>
								: running ? <Skeleton.Input size="small" active style={{ width: 80, minWidth: 80 }} /> : null}
						</div>
					);
				})}
			</div>
		</div>
	);
}

function WorkingAssumptions({ items }: { items: string[] }) {
	if (!items.length) return null;
	return (
		<div className={styles.askAssumptionsCard}>
			<div className={styles.askSectionHeader}>
				<span>Working assumptions</span>
				<Typography.Text type="secondary">Defaults used to answer without blocking on clarification</Typography.Text>
			</div>
			<ul className={styles.askAssumptionsList}>
				{items.map((item, index) => <li key={`${item}_${index}`} className={styles.askAssumptionsItem}>{item}</li>)}
			</ul>
		</div>
	);
}

/* ─────────────────── Structured assistant card ───────────────── */

function StructuredAssistantMessage({
	run, artifacts, thinkingStage, thinkingMessage, streamedNarrative, onFollowUp, onOpenCode
}: {
	run: ISupeAskRun;
	artifacts: ISupeAskArtifact[];
	thinkingStage: string;
	thinkingMessage: string;
	streamedNarrative: string;
	onFollowUp: (q: string) => void;
	onOpenCode: () => void;
}) {
	const isLive = ['queued', 'running'].includes(run.status);
	const followUps = takeSuggestedQuestions(run.artifact_plan);
	const workingAssumptions = takeWorkingAssumptions(run.artifact_plan);
	const shareText = buildShareText(run);

	return (
		<div className={styles.askAssistantResponse}>
			{/* Thinking animation — shown while pipeline is still working */}
			{isLive && thinkingStage ? <ThinkingIndicator stage={thinkingStage} message={thinkingMessage} /> : null}

			{/* Streamed narrative — appears as retrieval/planning progresses */}
			{streamedNarrative ? <div className={styles.askStreamedNarrative}>{streamedNarrative}</div> : null}

			{/* Title + summary — appears once codegen completes */}
			{run.title ? <h3 className={styles.askReportTitle}>{run.title}</h3> : null}
			<WorkingAssumptions items={workingAssumptions} />
			{run.assistant_summary ? <div className={styles.askSummaryText}>{run.assistant_summary}</div> : null}

			{/* Inline artifacts — tables, metrics, charts */}
			{artifacts.length ? (
				<div className={styles.askInlineArtifactStack}>
					{artifacts.map((a) => <AskArtifactRenderer key={a.id} artifact={a} />)}
				</div>
			) : null}

			{/* Key highlights */}
			<LeadershipHighlights highlights={run.artifact_plan?.key_highlights || []} running={['queued', 'running'].includes(run.status)} />

			{/* Error */}
			{run.status === 'failed' && run.error_message ? (
				<div className={styles.askRunError}>{run.error_message}</div>
			) : null}

			{/* Action bar */}
			{!isLive ? (
				<div className={styles.askInlineActions}>
					{run.python_code ? (
						<Button size="small" icon={<CodeOutlined />} onClick={onOpenCode}>View code</Button>
					) : null}
					<Button size="small" icon={<ShareAltOutlined />} onClick={async () => {
						if (navigator.share) { try { await navigator.share({ title: run.title || 'Supe Ask', text: shareText }); return; } catch { /* fall through */ } }
						await navigator.clipboard.writeText(shareText);
					}}>Share</Button>
					<Button size="small" icon={<CopyOutlined />} onClick={() => navigator.clipboard.writeText(shareText)}>Copy</Button>
				</div>
			) : null}

			{/* Follow-up chips */}
			{followUps.length ? (
				<div className={styles.askFollowUpRow}>
					{followUps.map((q) => <button key={q} type="button" className={styles.askFollowUpChip} onClick={() => onFollowUp(q)}>{q}</button>)}
				</div>
			) : null}
		</div>
	);
}

/* ─────────────── Canvas-style code pane ─────────────────────── */

function CodeCanvas({
	code, stdout, open, collapsed, onClose, onToggleCollapse
}: {
	code: string;
	stdout: string[];
	open: boolean;
	collapsed: boolean;
	onClose: () => void;
	onToggleCollapse: () => void;
}) {
	const canvasClass = [
		styles.askCodeCanvas,
		open ? styles.askCodeCanvasOpen : '',
		open && collapsed ? styles.askCodeCanvasCollapsed : '',
	].filter(Boolean).join(' ');

	return (
		<aside className={canvasClass}>
			<div className={styles.askCodeCanvasHeader}>
				{collapsed
					? <span><CodeOutlined /></span>
					: <span><CodeOutlined /> Generated Code</span>
				}
				<Space size={2}>
					<Button type="text" size="small"
						icon={collapsed ? <ExpandOutlined /> : <CompressOutlined />}
						onClick={onToggleCollapse}
						title={collapsed ? 'Expand code panel' : 'Collapse code panel'}
					/>
					<Button type="text" size="small" icon={<CloseOutlined />} onClick={onClose} title="Close code panel" />
				</Space>
			</div>
			{!collapsed ? (
				<div className={styles.askCodeCanvasBody}>
					<pre className={styles.askCodeBlock}>{code || 'No code generated yet.'}</pre>
					{stdout.length ? (
						<>
							<div className={styles.askCodeCanvasDivider}>Execution Output</div>
							<pre className={styles.askLogBlock}>{stdout.join('\n')}</pre>
						</>
					) : null}
				</div>
			) : null}
		</aside>
	);
}

/* ════════════════════════ Main View ═══════════════════════════ */

export function AskView() {
	const [searchParams, setSearchParams] = useSearchParams();
	const initialQuery = searchParams.get('q') || '';
	const threadParam = searchParams.get('thread') || '';
	const queryParam = searchParams.get('q') || '';

	/* ── State ─────────────────────────────────────────────────── */
	const [, setThreads] = useState<ISupeAskThread[]>([]);
	const [selectedThreadId, setSelectedThreadId] = useState('');
	const [messages, setMessages] = useState<ISupeAskMessage[]>([]);
	const [runs, setRuns] = useState<ISupeAskRun[]>([]);
	const [artifactsByRun, setArtifactsByRun] = useState<Record<string, ISupeAskArtifact[]>>({});
	const [, setEventsByRun] = useState<Record<string, ISupeAskEvent[]>>({});
	const [streamedPlanningByRun, setStreamedPlanningByRun] = useState<Record<string, string>>({});
	const [streamedCodeByRun, setStreamedCodeByRun] = useState<Record<string, string>>({});
	const [stdoutByRun, setStdoutByRun] = useState<Record<string, string[]>>({});
	const [thinkingByRun, setThinkingByRun] = useState<Record<string, { stage: string; message: string }>>({});
	const [activeRunId, setActiveRunId] = useState('');
	const [query, setQuery] = useState(initialQuery);
	const [loadingThreads, setLoadingThreads] = useState(true);
	const [loadingThread, setLoadingThread] = useState(false);
	const [submitting, setSubmitting] = useState(false);
	const [composerError, setComposerError] = useState('');
	const [codeCanvasOpen, setCodeCanvasOpen] = useState(false);
	const [codeCanvasCollapsed, setCodeCanvasCollapsed] = useState(false);

	const eventSourceRef = useRef<EventSource | null>(null);
	const hydratedQueryRef = useRef(initialQuery);
	const bootstrapRunRef = useRef('');
	const selectedThreadIdRef = useRef('');
	const activeRunIdRef = useRef('');
	const loadThreadRequestRef = useRef(0);
	const conversationEndRef = useRef<HTMLDivElement | null>(null);
	const conversationBodyRef = useRef<HTMLDivElement | null>(null);
	const shouldAutoScrollRef = useRef(false);

	/* ── Derived ───────────────────────────────────────────────── */
	const selectedRun = useMemo(() => runs.find((r) => r.id === activeRunId) || runs[runs.length - 1] || null, [activeRunId, runs]);
	const selectedArtifacts = selectedRun ? artifactsByRun[selectedRun.id] || [] : [];
	const selectedStdout = selectedRun ? stdoutByRun[selectedRun.id] || [] : [];
	const streamedNarrative = selectedRun ? streamedPlanningByRun[selectedRun.id] || '' : '';
	const streamedCode = selectedRun ? streamedCodeByRun[selectedRun.id] || selectedRun.python_code || '' : '';
	const thinking = selectedRun ? thinkingByRun[selectedRun.id] || null : null;

	/* ── Helpers ───────────────────────────────────────────────── */
	const syncThreadParam = (id: string) => {
		const p = new URLSearchParams(searchParams);
		if (id) p.set('thread', id); else p.delete('thread');
		if (p.toString() !== searchParams.toString()) setSearchParams(p, { replace: true });
	};
	const updateSelectedThreadId = (id: string, sync = true) => { selectedThreadIdRef.current = id; setSelectedThreadId(id); if (sync) syncThreadParam(id); };
	const updateActiveRunId = (id: string) => { activeRunIdRef.current = id; setActiveRunId(id); };
	const closeEventStream = () => { if (eventSourceRef.current) { eventSourceRef.current.close(); eventSourceRef.current = null; } };
	const applyRunPatch = (runId: string, patch: Partial<ISupeAskRun>) => setRuns((cur) => cur.map((r) => (r.id === runId ? { ...r, ...patch } : r)));

	const isNearConversationBottom = () => {
		const node = conversationBodyRef.current;
		if (!node) return true;
		return node.scrollHeight - node.scrollTop - node.clientHeight < 120;
	};
	const syncAutoScrollPreference = () => { shouldAutoScrollRef.current = isNearConversationBottom(); };
	const scrollToBottom = (force = false, behavior: ScrollBehavior = 'smooth') => {
		const node = conversationBodyRef.current;
		if (!node) {
			conversationEndRef.current?.scrollIntoView({ behavior });
			return;
		}
		if (!force && !shouldAutoScrollRef.current) return;
		node.scrollTo({ top: node.scrollHeight, behavior });
		shouldAutoScrollRef.current = true;
	};
	const scrollToTop = () => {
		const node = conversationBodyRef.current;
		if (!node) return;
		node.scrollTo({ top: 0, behavior: 'auto' });
		shouldAutoScrollRef.current = false;
	};

	const hydrateRunStreams = (nextEvents: Record<string, ISupeAskEvent[]>, nextRuns: ISupeAskRun[]) => {
		const np: Record<string, string> = {};
		const nc: Record<string, string> = {};
		const ns: Record<string, string[]> = {};
		for (const run of nextRuns) {
			const evts = nextEvents[run.id] || [];
			let plan = '', code = run.python_code || '';
			const out: string[] = [];
			for (const e of evts) {
				if (e.eventType === 'run.planning.delta') plan = appendChunk(plan, String(e.payload?.delta || ''));
				if (e.eventType === 'run.codegen.delta') code = appendChunk(code, String(e.payload?.delta || ''));
				if (e.eventType === 'run.execution.stdout') { const l = String(e.payload?.line || ''); if (l) out.push(l); }
			}
			np[run.id] = plan; nc[run.id] = code; ns[run.id] = out;
		}
		setStreamedPlanningByRun(np); setStreamedCodeByRun(nc); setStdoutByRun(ns);
	};

	/* ── Thread / Run loading ─────────────────────────────────── */
	const refreshThreadRail = async (preferred?: string) => {
		const res = await supeApi.listAskThreads();
		const next = res?.data?.data?.threads || [];
		setThreads(next);
		window.dispatchEvent(new CustomEvent(ASK_THREAD_EVENT));
		const pref = preferred || threadParam;
		const sel = (pref && next.some((t: ISupeAskThread) => t.id === pref) ? pref : '')
			|| (selectedThreadIdRef.current && next.some((t: ISupeAskThread) => t.id === selectedThreadIdRef.current) ? selectedThreadIdRef.current : next[0]?.id || '');
		updateSelectedThreadId(sel);
		return sel;
	};

	const connectRunEvents = (runId: string, threadId: string) => {
		closeEventStream();
		const source = new EventSource(supeApi.buildAskRunEventsUrl(runId), { withCredentials: true });
		eventSourceRef.current = source;
		source.onmessage = (event) => {
			try {
				const p = JSON.parse(event.data) as ISupeAskEvent;
				setEventsByRun((c) => ({ ...c, [runId]: [...(c[runId] || []).filter((x) => x.id !== p.id), p] }));

				// Thinking events — immediate feedback
				if (p.eventType === 'run.thinking') {
					setThinkingByRun((c) => ({ ...c, [runId]: { stage: String(p.payload?.stage || ''), message: String(p.payload?.message || '') } }));
					scrollToBottom();
				}
				if (p.eventType === 'run.planning.delta') {
					setStreamedPlanningByRun((c) => ({ ...c, [runId]: appendChunk(c[runId] || '', String(p.payload?.delta || '')) }));
					scrollToBottom();
				}
				if (p.eventType === 'run.codegen.delta') {
					setStreamedCodeByRun((c) => ({ ...c, [runId]: (c[runId] || '') + String(p.payload?.delta || '') }));
					// Clear thinking once code starts streaming
					setThinkingByRun((c) => ({ ...c, [runId]: { stage: 'codegen', message: 'Writing code...' } }));
				}
				if (p.eventType === 'run.codegen.completed') {
					applyRunPatch(runId, {
						title: String(p.payload?.title || ''),
						assistant_summary: String(p.payload?.assistantSummary || ''),
						python_code: String(p.payload?.pythonCode || ''),
						artifact_plan: p.payload?.artifactPlan || {}
					});
					setStreamedCodeByRun((c) => ({ ...c, [runId]: String(p.payload?.pythonCode || c[runId] || '') }));
					scrollToBottom();
				}
				if (p.eventType === 'run.execution.stdout') {
					const line = String(p.payload?.line || '');
					if (line) setStdoutByRun((c) => ({ ...c, [runId]: [...(c[runId] || []), line] }));
				}
				if (p.eventType === 'run.artifact' && p.payload?.artifact) {
					const art = p.payload.artifact as ISupeAskArtifact;
					setArtifactsByRun((c) => ({
						...c,
						[runId]: [...(c[runId] || []).filter((x) => x.id !== art.id), art].sort((a, b) => a.ordinal - b.ordinal)
					}));
					scrollToBottom();
				}
				if (p.eventType === 'run.execution.progress') applyRunPatch(runId, { status: 'running' });
				if (p.eventType === 'run.failed') {
					applyRunPatch(runId, { status: 'failed', error_message: String(p.payload?.message || 'Run failed') });
					setThinkingByRun((c) => { const n = { ...c }; delete n[runId]; return n; });
					closeEventStream();
					void Promise.allSettled([loadThread(threadId, false), refreshThreadRail(threadId)]);
				}
				if (p.eventType === 'run.completed') {
					applyRunPatch(runId, { status: 'completed' });
					setThinkingByRun((c) => { const n = { ...c }; delete n[runId]; return n; });
					closeEventStream();
					void Promise.allSettled([loadThread(threadId, false), refreshThreadRail(threadId)]);
				}
				if (p.eventType === 'run.cancelled') {
					applyRunPatch(runId, { status: 'cancelled' });
					setThinkingByRun((c) => { const n = { ...c }; delete n[runId]; return n; });
					closeEventStream();
					void Promise.allSettled([loadThread(threadId, false), refreshThreadRail(threadId)]);
				}
			} catch { /* ignore malformed keepalive */ }
		};
		source.onerror = () => {
			const r = runs.find((x) => x.id === runId);
			if (!r || ['completed', 'failed', 'cancelled'].includes(r.status)) closeEventStream();
		};
	};

	const loadThread = async (threadId: string, connectActive = true) => {
		const reqId = ++loadThreadRequestRef.current;
		try {
			setLoadingThread(true);
			const res = await supeApi.getAskThread(threadId);
			if (reqId !== loadThreadRequestRef.current || selectedThreadIdRef.current !== threadId) return;
			const d = res?.data?.data || {};
			setMessages(d.messages || []);
			setRuns(d.runs || []);
			setArtifactsByRun(d.artifactsByRun || {});
			setEventsByRun(d.eventsByRun || {});
			hydrateRunStreams(d.eventsByRun || {}, d.runs || []);
			const nextRun = activeRunIdRef.current && (d.runs || []).some((r: ISupeAskRun) => r.id === activeRunIdRef.current)
				? activeRunIdRef.current : (d.runs || []).at(-1)?.id || '';
			updateActiveRunId(nextRun);
			if (connectActive && nextRun) {
				const cur = (d.runs || []).find((r: ISupeAskRun) => r.id === nextRun);
				if (cur && ['queued', 'running'].includes(cur.status)) connectRunEvents(nextRun, threadId);
			}
		} finally { if (reqId === loadThreadRequestRef.current) setLoadingThread(false); }
	};

	const loadThreads = async (preferred?: string) => {
		try {
			setLoadingThreads(true);
			const sel = await refreshThreadRail(preferred);
			if (sel) await loadThread(sel, true);
			else {
				closeEventStream();
				setMessages([]); setRuns([]); setArtifactsByRun({}); setEventsByRun({});
				setStreamedPlanningByRun({}); setStreamedCodeByRun({}); setStdoutByRun({}); setThinkingByRun({});
				updateActiveRunId('');
			}
		} finally { setLoadingThreads(false); }
	};

	const ensureThread = async () => {
		if (selectedThreadIdRef.current) return selectedThreadIdRef.current;
		const res = await supeApi.createAskThread({});
		const id = String(res?.data?.data?.thread?.id || '');
		updateSelectedThreadId(id);
		window.dispatchEvent(new CustomEvent(ASK_THREAD_EVENT));
		await loadThreads(id);
		return id;
	};

	const handleCreateThread = async () => {
		try {
			setComposerError(''); closeEventStream();
			const res = await supeApi.createAskThread({});
			const id = String(res?.data?.data?.thread?.id || '');
			updateSelectedThreadId(id);
			setMessages([]); setRuns([]); setArtifactsByRun({}); setEventsByRun({});
			setStreamedPlanningByRun({}); setStreamedCodeByRun({}); setStdoutByRun({}); setThinkingByRun({});
			updateActiveRunId(''); setCodeCanvasOpen(false);
			window.dispatchEvent(new CustomEvent(ASK_THREAD_EVENT));
			await loadThreads(id);
		} catch (e: any) { setComposerError(e?.response?.data?.detail || 'Failed to create thread'); }
	};

	const handleSubmit = async (preset?: string) => {
		const q = (preset ?? query).trim();
		if (!q) { setComposerError('Enter a question.'); return false; }
		try {
			setSubmitting(true); setComposerError('');
			const tid = await ensureThread();
			const res = await supeApi.createAskMessage(tid, { question: q });
			const rid = String(res?.data?.data?.run?.id || '');
			setQuery('');
			updateActiveRunId(rid);
			setStreamedPlanningByRun((c) => ({ ...c, [rid]: '' }));
			setStreamedCodeByRun((c) => ({ ...c, [rid]: '' }));
			setStdoutByRun((c) => ({ ...c, [rid]: [] }));
			setThinkingByRun((c) => ({ ...c, [rid]: { stage: 'retrieval', message: 'Starting...' } }));
			await loadThread(tid, false);
			await refreshThreadRail(tid);
			connectRunEvents(rid, tid);
			scrollToBottom(true);
			return true;
		} catch (e: any) {
			setComposerError(e?.response?.data?.detail || e?.response?.data?.message || 'Failed to create run');
			return false;
		} finally { setSubmitting(false); }
	};

	const handleCancelRun = async () => {
		if (!selectedRun) return;
		try { await supeApi.cancelAskRun(selectedRun.id); }
		catch (e: any) { setComposerError(e?.response?.data?.detail || 'Failed to cancel'); }
	};

	/* ── Effects ───────────────────────────────────────────────── */
	useEffect(() => { void loadThreads(threadParam || undefined); return () => closeEventStream(); }, [threadParam]);
	useEffect(() => { if (!queryParam) { hydratedQueryRef.current = ''; bootstrapRunRef.current = ''; return; } if (queryParam !== hydratedQueryRef.current) { hydratedQueryRef.current = queryParam; setQuery(queryParam); } }, [queryParam]);
	useEffect(() => { scrollToTop(); }, [selectedThreadId]);
	useEffect(() => {
		if (!queryParam || loadingThreads || submitting) return;
		if (bootstrapRunRef.current === queryParam) return;
		bootstrapRunRef.current = queryParam; setQuery(queryParam);
		void (async () => {
			const ok = await handleSubmit(queryParam);
			if (!ok) { bootstrapRunRef.current = ''; return; }
			try { const p = new URLSearchParams(searchParams); p.delete('q'); setSearchParams(p, { replace: true }); }
			catch { bootstrapRunRef.current = ''; }
		})();
	}, [loadingThreads, queryParam, searchParams, setSearchParams, submitting]);

	/* ── Render ────────────────────────────────────────────────── */
	return (
		<div className={styles.askPage}>
			{/* Header */}
			<div className={styles.askHeader}>
				<div>
					<h1 className={styles.askHeaderTitle}>Ask</h1>
					<p className={styles.askHeaderSubtitle}>Ask anything about your business data.</p>
				</div>
				<Space>
					{selectedRun ? <Tag color={formatStatus(selectedRun.status)}>{selectedRun.status}</Tag> : null}
					<Button icon={<PlusOutlined />} onClick={() => void handleCreateThread()}>New chat</Button>
				</Space>
			</div>

			{/* Main workspace — conversation + optional code canvas */}
			<div className={`${styles.askWorkspaceCanvas} ${codeCanvasOpen && !codeCanvasCollapsed ? styles.askWorkspaceCanvasWithCode : ''} ${codeCanvasOpen && codeCanvasCollapsed ? styles.askWorkspaceCanvasWithCodeCollapsed : ''}`}>
				{/* Conversation pane */}
				<section className={styles.askConversationPane}>
					<div ref={conversationBodyRef} className={styles.askConversationBody} onScroll={syncAutoScrollPreference}>
						{loadingThread || (loadingThreads && !selectedThreadId) ? (
							<Skeleton active paragraph={{ rows: 10 }} />
						) : messages.length ? (
							<div className={styles.askMessageStack}>
								{messages.map((msg) => {
									const msgRun = msg.run_id ? runs.find((r) => r.id === String(msg.run_id)) || null : null;
									const msgArtifacts = msgRun ? artifactsByRun[msgRun.id] || [] : [];
									const msgThinking = msgRun ? thinkingByRun[msgRun.id] || null : null;
									const msgNarrative = msgRun ? streamedPlanningByRun[msgRun.id] || '' : '';
									return (
										<div key={msg.id} className={`${styles.askMessageCard} ${msg.role === 'user' ? styles.askMessageCardUser : styles.askMessageCardAssistant}`}>
											<div className={styles.askMessageMeta}>
												<span>{msg.role === 'user' ? 'You' : 'Supe Ask'}</span>
												{msgRun && ['queued', 'running'].includes(msgRun.status) ? <Tag color="processing" icon={<LoadingOutlined />}>live</Tag> : null}
											</div>
											{msg.role === 'user' ? (
												<div className={styles.askMessageContent}>{msg.content}</div>
											) : msgRun ? (
												<StructuredAssistantMessage
													run={msgRun}
													artifacts={msgArtifacts}
													thinkingStage={msgThinking?.stage || ''}
													thinkingMessage={msgThinking?.message || ''}
													streamedNarrative={msgNarrative}
													onFollowUp={(q) => void handleSubmit(q)}
													onOpenCode={() => setCodeCanvasOpen(true)}
												/>
											) : (
												<div className={styles.askMessageContent}>{msg.content}</div>
											)}
										</div>
									);
								})}

								{/* Streaming bubble for active run not yet in message history */}
								{selectedRun && ['queued', 'running'].includes(selectedRun.status)
									&& !messages.some((m) => m.run_id === selectedRun.id) ? (
									<div className={`${styles.askMessageCard} ${styles.askMessageCardAssistant}`}>
										<div className={styles.askMessageMeta}>
											<span>Supe Ask</span>
											<Tag color="processing" icon={<LoadingOutlined />}>live</Tag>
										</div>
										<StructuredAssistantMessage
											run={selectedRun}
											artifacts={selectedArtifacts}
											thinkingStage={thinking?.stage || ''}
											thinkingMessage={thinking?.message || ''}
											streamedNarrative={streamedNarrative}
											onFollowUp={(q) => void handleSubmit(q)}
											onOpenCode={() => setCodeCanvasOpen(true)}
										/>
									</div>
								) : null}

								<div ref={conversationEndRef} />
							</div>
						) : (
							<div className={styles.askEmptyState}>
								<div className={styles.askEmptyIcon}><MessageOutlined /></div>
								<h2 className={styles.askEmptyTitle}>What do you want to know?</h2>
								<p className={styles.askEmptySubtitle}>Ask about revenue, coverage, outstanding, pipeline health, or follow-up actions.</p>
								<div className={styles.askChipRow}>
									{LEADERSHIP_PROMPT_SUGGESTIONS.slice(0, 3).map((s) => (
										<Button key={s} className={styles.askChip} onClick={() => setQuery(s)}>{s}</Button>
									))}
								</div>
							</div>
						)}
					</div>

					{/* Composer */}
					<div className={styles.askComposer}>
						<PromptCommandBar
							compact
							submitLabel={selectedRun && ['queued', 'running'].includes(selectedRun.status) ? 'Running' : 'Run Ask'}
							disabled={submitting}
							suggestions={LEADERSHIP_PROMPT_SUGGESTIONS}
							onQuickPick={(q) => { setQuery(q); void handleSubmit(q); }}
							onSubmit={(q) => { setQuery(q); void handleSubmit(q); }}
						/>
						<div className={styles.askComposerFooter}>
							<div className={styles.askComposerError}>{composerError || null}</div>
							<Space>
								{selectedRun && ['queued', 'running'].includes(selectedRun.status) ? (
									<Button icon={<StopOutlined />} onClick={handleCancelRun}>Cancel</Button>
								) : null}
							</Space>
						</div>
					</div>
				</section>

				{/* Canvas-style code pane — slides in from the right */}
				<CodeCanvas
					code={streamedCode}
					stdout={selectedStdout}
					open={codeCanvasOpen}
					collapsed={codeCanvasCollapsed}
					onClose={() => { setCodeCanvasOpen(false); setCodeCanvasCollapsed(false); }}
					onToggleCollapse={() => setCodeCanvasCollapsed((c) => !c)}
				/>
			</div>
		</div>
	);
}
