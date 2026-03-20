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
