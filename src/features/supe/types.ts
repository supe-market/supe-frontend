export type SupeEntityType = 'salesman' | 'retailer' | 'beat' | 'sku' | 'distributor';
export type IPaceStatus = 'accelerating' | 'on_track' | 'moderately_lagging' | 'stalled';

export interface ISupeKpi {
	key: string;
	label: string;
	current: number;
	prev: number;
	unit: 'currency' | 'number' | 'percent';
}

export interface ISupeBullet {
	id: string;
	severity: 'critical' | 'warning' | 'opportunity';
	title: string;
	description: string;
	ctaLabel?: string;
}

export interface ISupePulse {
	entityType: string;
	label: string;
	criticalCount: number;
	warningCount: number;
	opportunityCount: number;
}

export interface ISupeEntityRow {
	id: string;
	name: string;
	zone?: string;
	region?: string;
	area?: string;
	[key: string]: any;
}
export type SupeSeverity = 'critical' | 'warning' | 'opportunity';

export interface ISupeSignal {
	id: string;
	entityId: string;
	entityType: SupeEntityType;
	name: string;
	pattern: string;
	severity: SupeSeverity;
	headline?: string;
	why?: string;
	detectedAt?: string;
	metrics?: Record<string, any>;
}

export interface ISupeHypothesis {
	id: string;
	title: string;
	belief: string;
	status: 'forming' | 'testing' | 'confirmed' | 'refuted' | 'refined';
	priority: 'high' | 'medium' | 'low';
	period: string;
	evidenceScore?: number;
	evidence?: Array<{
		id: string;
		type: string;
		label: string;
		description: string;
		value?: string;
		direction: 'for' | 'against' | 'neutral';
	}>;
}

export interface ISupeGoal {
	id: string;
	name: string;
	metricKey: string;
	geoKey: string;
	baseline: number;
	target: number;
	current: number;
	status: 'active' | 'completed' | 'paused' | 'archived';
	progressPercent?: number;
	snapshots?: Array<Record<string, any>>;
}

export interface ISupeTarget {
	id: string;
	metric: string;
	targetValue: number;
	actualValue?: number;
	attainmentPct?: number;
	periodLabel: string;
	scopeLevel: string;
	scopeValue: string;
	status: 'active' | 'paused' | 'completed';
}

export interface ISupeAskThread {
	id: string;
	title: string;
	created_at: string;
	updated_at: string;
	latest_run_status?: string | null;
	latest_question?: string | null;
}

export interface ISupeAskReportSection {
	title: string;
	subtitle: string;
}

export interface ISupeAskKeyHighlight {
	title: string;
	detail: string;
	value: string;
	tone: string;
}

export interface ISupeAskArtifactPlan {
	artifacts?: Array<{
		type: string;
		title: string;
		reason: string;
	}>;
	report_sections?: ISupeAskReportSection[];
	key_highlights?: ISupeAskKeyHighlight[];
	working_assumptions?: string[];
	suggested_next_questions?: string[];
}

export interface ISupeAskMessage {
	id: string;
	thread_id: string;
	role: 'user' | 'assistant';
	content: string;
	run_id?: string | null;
	created_at: string;
}

export interface ISupeAskArtifact {
	id: string;
	run_id: string;
	artifact_type: 'markdown' | 'metric' | 'table' | 'plotly' | 'log' | string;
	title: string;
	payload: Record<string, any>;
	ordinal: number;
	created_at: string;
}

export interface ISupeAskRun {
	id: string;
	thread_id: string;
	message_id: string;
	question: string;
	status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
	title?: string | null;
	assistant_summary?: string | null;
	python_code?: string | null;
	retrieval_context?: Record<string, any> | null;
	artifact_plan?: ISupeAskArtifactPlan | null;
	error_message?: string | null;
	created_at: string;
	updated_at: string;
	completed_at?: string | null;
}

export interface ISupeAskEvent {
	id: number;
	eventType: string;
	payload: Record<string, any>;
	createdAt?: string | null;
}
