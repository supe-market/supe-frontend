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
	StopOutlined,
	WarningOutlined
} from '@ant-design/icons';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import supeApi from '../api';
import { PlotlyArtifact } from '../components/PlotlyArtifact';
import { LEADERSHIP_PROMPT_SUGGESTIONS, PromptCommandBar } from '../components/PromptCommandBar';
import type {
	ISupeAskArtifact,
	ISupeAskArtifactPlan,
	ISupeAskEvent,
	ISupeAskHighlightsItem,
	ISupeAskMessage,
	ISupeAskRun,
	ISupeAskThread
} from '../types';
import styles from '../index.module.scss';

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
	if (n.includes('neutral') || n.includes('stable') || n.includes('flat')) return styles.askHighlightToneNeutral;
	return styles.askHighlightToneCritical;
}

function toneCellClassName(tone: string) {
	const n = tone.toLowerCase();
	if (n.includes('easy') || n.includes('positive') || n.includes('good')) return styles.askHighlightCellPositive;
	if (n.includes('medium') || n.includes('warning')) return styles.askHighlightCellWarning;
	if (n.includes('neutral') || n.includes('stable') || n.includes('flat')) return styles.askHighlightCellNeutral;
	return styles.askHighlightCellCritical;
}

function extractHighlightItems(artifacts: ISupeAskArtifact[]): ISupeAskHighlightsItem[] {
	const highlightsArtifact = artifacts.find((artifact) => artifact.artifact_type === 'highlights');
	const items = highlightsArtifact?.payload?.items;
	if (!Array.isArray(items)) return [];
	return items
		.filter((item): item is Record<string, any> => Boolean(item && typeof item === 'object'))
		.map((item) => ({
			title: String(item.title || '').trim(),
			detail: String(item.detail || '').trim(),
			value: String(item.value || '').trim(),
			tone: String(item.tone || 'neutral').trim() || 'neutral'
		}))
		.filter((item) => item.title || item.detail || item.value);
}

function buildShareText(run: ISupeAskRun, artifacts: ISupeAskArtifact[]) {
	const lines = [run.title || run.question, run.assistant_summary || ''];
	for (const item of extractHighlightItems(artifacts)) {
		const body = item.value || item.detail;
		lines.push(body ? `- ${item.title}: ${body}` : `- ${item.title}`);
	}
	return lines.filter(Boolean).join('\n');
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

function isTerminalRunStatus(status?: string | null) {
	return ['completed', 'failed', 'cancelled'].includes(String(status || ''));
}

function getFriendlyError(raw: string): string {
	const lower = raw.toLowerCase();
	if (lower.includes('json') || lower.includes('code generator')) return "Couldn't generate the analysis. Try rephrasing your question.";
	if (lower.includes('retrieval') || lower.includes('catalog')) return "Couldn't find relevant data for your question. Try being more specific.";
	if (lower.includes('validation') || lower.includes('syntax')) return "The analysis code had errors after multiple attempts. Try a simpler question.";
	if (lower.includes('timeout') || lower.includes('timed out')) return "Analysis timed out. Try a more specific question.";
	if (lower.includes('cancelled')) return "Analysis was cancelled.";
	return "Something went wrong. Please try again.";
}

function sortAskArtifacts(artifacts: ISupeAskArtifact[]) {
	return [...artifacts].sort((a, b) => a.ordinal - b.ordinal);
}

function partitionArtifactsForOverview(artifacts: ISupeAskArtifact[]) {
	const firstOverviewIndex = artifacts.findIndex((artifact) => ['metric', 'highlights'].includes(artifact.artifact_type));
	if (firstOverviewIndex === -1) {
		return {
			leadingArtifacts: artifacts,
			overviewMetrics: [] as ISupeAskArtifact[],
			overviewHighlights: null as ISupeAskArtifact | null,
			trailingArtifacts: [] as ISupeAskArtifact[]
		};
	}

	let groupEnd = firstOverviewIndex;
	while (groupEnd < artifacts.length && ['metric', 'highlights'].includes(artifacts[groupEnd].artifact_type)) {
		groupEnd += 1;
	}

	const leadingArtifacts = artifacts.slice(0, firstOverviewIndex);
	const overviewGroup = artifacts.slice(firstOverviewIndex, groupEnd);
	const overviewMetrics = overviewGroup.filter((artifact) => artifact.artifact_type === 'metric');
	const overviewHighlights = overviewGroup.find((artifact) => artifact.artifact_type === 'highlights') || null;
	const trailingArtifacts = [
		...overviewGroup.filter((artifact) => !['metric', 'highlights'].includes(artifact.artifact_type)),
		...artifacts.slice(groupEnd),
	];

	return { leadingArtifacts, overviewMetrics, overviewHighlights, trailingArtifacts };
}

function normalizeRunStreamState(run?: ISupeAskRun | null) {
	const state = run?.stream_state || {};
	const thinking = state?.thinking;
	return {
		thinking: thinking?.stage || thinking?.message
			? { stage: String(thinking?.stage || ''), message: String(thinking?.message || '') }
			: null,
		planningText: String(state?.planningText || ''),
		codeBuffer: String(state?.codeBuffer || ''),
		stdoutTail: Array.isArray(state?.stdoutTail) ? state.stdoutTail.map((line) => String(line || '')) : [],
		updatedAt: state?.updatedAt ? String(state.updatedAt) : null
	};
}

function buildRunStreamMaps(nextRuns: ISupeAskRun[]) {
	const planning: Record<string, string> = {};
	const code: Record<string, string> = {};
	const stdout: Record<string, string[]> = {};
	const thinking: Record<string, { stage: string; message: string }> = {};

	for (const run of nextRuns) {
		const stream = normalizeRunStreamState(run);
		planning[run.id] = stream.planningText;
		code[run.id] = isTerminalRunStatus(run.status)
			? String(run.python_code || stream.codeBuffer || '')
			: String(stream.codeBuffer || run.python_code || '');
		stdout[run.id] = stream.stdoutTail;
		if (stream.thinking) thinking[run.id] = stream.thinking;
	}

	return { planning, code, stdout, thinking };
}

function extractArtifactLogLines(artifacts: ISupeAskArtifact[]) {
	const logArtifact = artifacts.find((artifact) => artifact.artifact_type === 'log');
	const lines = logArtifact?.payload?.lines;
	return Array.isArray(lines) ? lines.map((line) => String(line || '')) : [];
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

/* ─────────────────────── Artifact renderer ───────────────────── */

function AskArtifactRenderer({ artifact, variant = 'default' }: { artifact: ISupeAskArtifact; variant?: 'default' | 'overview' }) {
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
			<div className={`${styles.askMetricArtifact} ${variant === 'overview' ? styles.askMetricArtifactHero : ''}`}>
				<div className={styles.askMetricLabel}>{artifact.payload?.label}</div>
				<div className={styles.askMetricValue}>{formatMetricValue(artifact.payload || {})}</div>
				<div className={styles.askMetricMetaRow}>
					<span>{deltaText || artifact.payload?.benchmark || artifact.title}</span>
					<span className={`${styles.askMetricTone} ${toneClassName(String(artifact.payload?.tone || 'neutral'))}`}>{artifact.payload?.tone || 'neutral'}</span>
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
				<PlotlyArtifact artifact={artifact} />
			</div>
		);
	}
	if (artifact.artifact_type === 'highlights') {
		const items = extractHighlightItems([artifact]);
		if (!items.length) {
			return <div className={styles.askArtifactFallback}><Typography.Text type="secondary">No highlights were emitted.</Typography.Text></div>;
		}
		return (
			<div className={styles.askHighlightsSection}>
				<div className={styles.askSectionHeader}>
					<span>{artifact.title || 'Key Highlights'}</span>
					{artifact.payload?.subtitle ? <Typography.Text type="secondary">{String(artifact.payload.subtitle)}</Typography.Text> : null}
				</div>
				<div className={styles.askHighlightsGrid}>
					{items.map((item, index) => (
						<div key={`${artifact.id}_${index}`} className={`${styles.askHighlightCell} ${toneCellClassName(item.tone)}`}>
							<div className={styles.askHighlightCellHeader}>
								<div className={styles.askHighlightCellIndex}>{index + 1}</div>
								<div className={styles.askHighlightCellTitle}>{item.title}</div>
								<span className={`${styles.askHighlightTone} ${toneClassName(item.tone)}`}>{item.tone}</span>
							</div>
							{item.detail ? <div className={styles.askHighlightCellDetail}>{item.detail}</div> : null}
							{item.value ? <div className={styles.askHighlightCellValue}>{item.value}</div> : null}
						</div>
					))}
				</div>
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
	const shareText = buildShareText(run, artifacts);
	const { leadingArtifacts, overviewMetrics, overviewHighlights, trailingArtifacts } = partitionArtifactsForOverview(artifacts);

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

			{leadingArtifacts.length ? (
				<div className={styles.askInlineArtifactStack}>
					{leadingArtifacts.map((artifact) => <AskArtifactRenderer key={artifact.id} artifact={artifact} />)}
				</div>
			) : null}

			{overviewMetrics.length ? (
				<div className={styles.askOverviewMetricsRail}>
					{overviewMetrics.map((artifact) => (
						<AskArtifactRenderer key={artifact.id} artifact={artifact} variant="overview" />
					))}
				</div>
			) : null}

			{trailingArtifacts.length ? (
				<div className={styles.askInlineArtifactStack}>
					{trailingArtifacts.map((artifact) => <AskArtifactRenderer key={artifact.id} artifact={artifact} />)}
				</div>
			) : null}

			{overviewHighlights ? (
				<AskArtifactRenderer key={overviewHighlights.id} artifact={overviewHighlights} />
			) : null}

			{/* Error */}
			{run.status === 'failed' && run.error_message ? (
				<div className={styles.askRunError}>
					<div className={styles.askRunErrorHeader}>
						<WarningOutlined />
						<span>Analysis failed</span>
					</div>
					<p className={styles.askRunErrorBody}>{getFriendlyError(run.error_message)}</p>
					<details className={styles.askRunErrorDetails}>
						<summary>Technical details</summary>
						<code>{run.error_message}</code>
					</details>
				</div>
			) : null}
			{run.status === 'failed' && run.question ? (
				<div className={styles.askFollowUpRow}>
					<button type="button" className={styles.askFollowUpChip} onClick={() => onFollowUp(run.question)}>Try again</button>
				</div>
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
	const [runs, setRunsState] = useState<ISupeAskRun[]>([]);
	const setRuns = (next: ISupeAskRun[] | ((cur: ISupeAskRun[]) => ISupeAskRun[])) => {
		setRunsState((cur) => {
			const resolved = typeof next === 'function' ? next(cur) : next;
			runsRef.current = resolved;
			return resolved;
		});
	};
	const [artifactsByRun, setArtifactsByRun] = useState<Record<string, ISupeAskArtifact[]>>({});
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
	const runsRef = useRef<ISupeAskRun[]>([]);
	const hydratedQueryRef = useRef(initialQuery);
	const bootstrapRunRef = useRef('');
	const selectedThreadIdRef = useRef('');
	const activeRunIdRef = useRef('');
	const loadThreadRequestRef = useRef(0);
	const codeAutoOpenedForRunRef = useRef('');
	const conversationEndRef = useRef<HTMLDivElement | null>(null);
	const conversationBodyRef = useRef<HTMLDivElement | null>(null);
	const shouldAutoScrollRef = useRef(false);

	/* ── Derived ───────────────────────────────────────────────── */
	const selectedRun = useMemo(() => runs.find((r) => r.id === activeRunId) || runs[runs.length - 1] || null, [activeRunId, runs]);
	const selectedArtifacts = selectedRun ? artifactsByRun[selectedRun.id] || [] : [];
	const selectedRunHasMessage = useMemo(
		() => Boolean(selectedRun && messages.some((message) => String(message.run_id || '') === selectedRun.id)),
		[messages, selectedRun]
	);
	const selectedStdout = useMemo(() => {
		if (!selectedRun) return [];
		const persisted = isTerminalRunStatus(selectedRun.status) ? extractArtifactLogLines(selectedArtifacts) : [];
		return persisted.length ? persisted : stdoutByRun[selectedRun.id] || [];
	}, [selectedArtifacts, selectedRun, stdoutByRun]);
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
	const upsertRun = (nextRun: ISupeAskRun) => setRuns((cur) => {
		const index = cur.findIndex((run) => run.id === nextRun.id);
		if (index === -1) return [...cur, nextRun];
		return cur.map((run) => (run.id === nextRun.id ? { ...run, ...nextRun } : run));
	});

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

	const hydrateRunStreams = (nextRuns: ISupeAskRun[]) => {
		const maps = buildRunStreamMaps(nextRuns);
		setStreamedPlanningByRun(maps.planning);
		setStreamedCodeByRun(maps.code);
		setStdoutByRun(maps.stdout);
		setThinkingByRun(maps.thinking);
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
				if (p.eventType === 'run.snapshot') {
					const snapshotRun = p.payload?.run as ISupeAskRun | undefined;
					const snapshotArtifacts = Array.isArray(p.payload?.artifacts) ? p.payload.artifacts as ISupeAskArtifact[] : [];
					if (snapshotRun) {
						upsertRun(snapshotRun);
						const stream = normalizeRunStreamState(snapshotRun);
						setStreamedPlanningByRun((c) => ({ ...c, [runId]: stream.planningText }));
						setStreamedCodeByRun((c) => ({
							...c,
							[runId]: isTerminalRunStatus(snapshotRun.status)
								? String(snapshotRun.python_code || stream.codeBuffer || '')
								: String(stream.codeBuffer || snapshotRun.python_code || '')
						}));
						setStdoutByRun((c) => ({ ...c, [runId]: stream.stdoutTail }));
						setThinkingByRun((c) => {
							const next = { ...c };
							if (stream.thinking) next[runId] = stream.thinking;
							else delete next[runId];
							return next;
						});
					}
					setArtifactsByRun((c) => ({ ...c, [runId]: sortAskArtifacts(snapshotArtifacts) }));
					if (snapshotRun && isTerminalRunStatus(snapshotRun.status)) {
						closeEventStream();
						void Promise.allSettled([loadThread(threadId, false), refreshThreadRail(threadId)]);
					}
					return;
				}

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
					setThinkingByRun((c) => ({ ...c, [runId]: { stage: 'codegen', message: 'Writing code...' } }));
					// Auto-open the code canvas on the first token for this run
					if (codeAutoOpenedForRunRef.current !== runId) {
						codeAutoOpenedForRunRef.current = runId;
						setCodeCanvasOpen(true);
						setCodeCanvasCollapsed(false);
						window.dispatchEvent(new CustomEvent('supe-code-canvas-opened'));
					}
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
						[runId]: sortAskArtifacts([...(c[runId] || []).filter((x) => x.id !== art.id), art])
					}));
					scrollToBottom();
				}
				if (p.eventType === 'run.execution.progress') applyRunPatch(runId, { status: 'running' });
				if (p.eventType === 'run.failed') {
					applyRunPatch(runId, {
						status: 'failed',
						error_message: String(p.payload?.message || 'Run failed'),
						stream_state: { thinking: null }
					});
					setThinkingByRun((c) => { const n = { ...c }; delete n[runId]; return n; });
					closeEventStream();
					void Promise.allSettled([loadThread(threadId, false), refreshThreadRail(threadId)]);
				}
				if (p.eventType === 'run.completed') {
					applyRunPatch(runId, { status: 'completed', stream_state: { thinking: null } });
					setThinkingByRun((c) => { const n = { ...c }; delete n[runId]; return n; });
					closeEventStream();
					void Promise.allSettled([loadThread(threadId, false), refreshThreadRail(threadId)]);
				}
				if (p.eventType === 'run.cancelled') {
					applyRunPatch(runId, { status: 'cancelled', stream_state: { thinking: null } });
					setThinkingByRun((c) => { const n = { ...c }; delete n[runId]; return n; });
					closeEventStream();
					void Promise.allSettled([loadThread(threadId, false), refreshThreadRail(threadId)]);
				}
			} catch { /* ignore malformed keepalive */ }
		};
		source.onerror = () => {
			const r = runsRef.current.find((x) => x.id === runId);
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
			hydrateRunStreams(d.runs || []);
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
				setMessages([]); setRuns([]); setArtifactsByRun({});
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
			setMessages([]); setRuns([]); setArtifactsByRun({});
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
			await loadThread(tid, false);
			setStreamedPlanningByRun((c) => ({ ...c, [rid]: c[rid] || '' }));
			setStreamedCodeByRun((c) => ({ ...c, [rid]: c[rid] || '' }));
			setStdoutByRun((c) => ({ ...c, [rid]: c[rid] || [] }));
			setThinkingByRun((c) => ({ ...c, [rid]: c[rid] || { stage: 'retrieval', message: 'Starting...' } }));
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
													onOpenCode={() => { setCodeCanvasOpen(true); window.dispatchEvent(new CustomEvent('supe-code-canvas-opened')); }}
												/>
											) : (
												<div className={styles.askMessageContent}>{msg.content}</div>
											)}
										</div>
									);
								})}

								{/* Streaming bubble for active run not yet in message history */}
								{selectedRun && !selectedRunHasMessage ? (
									<div className={`${styles.askMessageCard} ${styles.askMessageCardAssistant}`}>
										<div className={styles.askMessageMeta}>
											<span>Supe Ask</span>
											{['queued', 'running'].includes(selectedRun.status)
												? <Tag color="processing" icon={<LoadingOutlined />}>live</Tag>
												: null}
										</div>
										<StructuredAssistantMessage
											run={selectedRun}
											artifacts={selectedArtifacts}
											thinkingStage={thinking?.stage || ''}
											thinkingMessage={thinking?.message || ''}
											streamedNarrative={streamedNarrative}
											onFollowUp={(q) => void handleSubmit(q)}
											onOpenCode={() => { setCodeCanvasOpen(true); window.dispatchEvent(new CustomEvent('supe-code-canvas-opened')); }}
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
