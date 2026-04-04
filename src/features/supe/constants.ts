const makeSupeRoute = (screenPath: string) => `/${screenPath}`;

export const supeBaseRoute = '/';
export const supeBriefingRoute = '/briefing';
export const supeExploreRoute = '/explore';
export const supeAskRoute = '/ask';
export const supeActRoute = '/act';
export const supeSchemesRoute = '/schemes';
export const supeSummaryRoute = makeSupeRoute('summary');
export const supeSalesmanRoute = makeSupeRoute('salesman');
export const supeRetailerRoute = makeSupeRoute('retailer');
export const supeBeatRoute = makeSupeRoute('beat');
export const supeSkuRoute = makeSupeRoute('sku');
export const supeDistributorRoute = makeSupeRoute('distributor');
export const supeTrajectoryRoute = makeSupeRoute('trajectory');
export const supeCompareRoute = makeSupeRoute('compare');
export const supeHypothesesRoute = makeSupeRoute('hypotheses');
export const supeTargetsRoute = makeSupeRoute('targets');
export const supeImportsRoute = makeSupeRoute('imports');

export const supeAllRoutes = [
	supeBriefingRoute,
	supeExploreRoute,
	supeAskRoute,
	supeActRoute,
	supeSchemesRoute,
	supeSummaryRoute,
	supeSalesmanRoute,
	supeRetailerRoute,
	supeBeatRoute,
	supeSkuRoute,
	supeDistributorRoute,
	supeTrajectoryRoute,
	supeCompareRoute,
	supeHypothesesRoute,
	supeTargetsRoute,
	supeImportsRoute
];

export const supeExploreEntities = ['salesman', 'retailer', 'sku', 'distributor', 'beat'] as const;

export type SupeExploreEntity = (typeof supeExploreEntities)[number];

export const supeExploreEntityMeta: Record<SupeExploreEntity, { label: string; key: SupeExploreEntity }> = {
	salesman: { key: 'salesman', label: 'Salesman' },
	retailer: { key: 'retailer', label: 'Retailer' },
	sku: { key: 'sku', label: 'SKU' },
	distributor: { key: 'distributor', label: 'Distributor' },
	beat: { key: 'beat', label: 'Beat' }
};

export const supeSidebarMenu = [
	{
		sectionName: 'Observe',
		icon: 'insightSvgIcon',
		componentList: [
			{ key: supeSummaryRoute, label: 'Summary', icon: 'allSvgIcon' },
			{ key: supeSalesmanRoute, label: 'Salesman', icon: 'user' },
			{ key: supeRetailerRoute, label: 'Retailer', icon: 'retailer' },
			{ key: supeBeatRoute, label: 'Beat', icon: 'location' },
			{ key: supeSkuRoute, label: 'SKU', icon: 'integrate' },
			{
				key: supeDistributorRoute,
				label: 'Distributor',
				icon: 'shipping'
			}
		]
	},
	{
		key: supeTrajectoryRoute,
		label: 'Trajectory',
		icon: 'activeSvgIcon',
		dividerBefore: true,
		isNew: false
	},
	{
		key: supeCompareRoute,
		label: 'Compare',
		icon: 'preference',
		isNew: false
	},
	{
		key: supeHypothesesRoute,
		label: 'Hypotheses',
		icon: 'support',
		notificationCount: 1,
		isNew: false
	},
	{
		key: supeTargetsRoute,
		label: 'Targets',
		icon: 'flagSvgIcon',
		isNew: false
	},
	{
		key: supeImportsRoute,
		label: 'Imports',
		icon: 'file',
		isNew: false
	}
];

export const supeViewTitleMap: Record<string, { title: string; subtitle: string }> = {
	[supeSummaryRoute]: {
		title: 'Observe · Summary',
		subtitle: 'Morning intelligence and entity diagnostics'
	},
	[supeSalesmanRoute]: {
		title: 'Observe · Salesman',
		subtitle: 'Performance, adherence, and cohort actions'
	},
	[supeRetailerRoute]: {
		title: 'Observe · Retailer',
		subtitle: 'Dormancy, outstanding, and AOV opportunities'
	},
	[supeBeatRoute]: {
		title: 'Observe · Beat',
		subtitle: 'Coverage, realised value, and adherence monitoring'
	},
	[supeSkuRoute]: {
		title: 'Observe · SKU',
		subtitle: 'Penetration and growth opportunities'
	},
	[supeDistributorRoute]: {
		title: 'Observe · Distributor',
		subtitle: 'Fulfilment and damage risk monitoring'
	},
	[supeTrajectoryRoute]: {
		title: 'Trajectory',
		subtitle: 'Track progress and pace against strategic goals'
	},
	[supeCompareRoute]: {
		title: 'Compare',
		subtitle: 'Multi-entity analytical comparison'
	},
	[supeAskRoute]: {
		title: 'Ask',
		subtitle: 'Threaded analytical workspace with reports and code'
	},
	[supeHypothesesRoute]: {
		title: 'Hypotheses',
		subtitle: 'Ask strategic questions and test assumptions'
	},
	[supeTargetsRoute]: {
		title: 'Targets',
		subtitle: 'Assign and monitor team-level targets'
	},
	[supeImportsRoute]: {
		title: 'Imports',
		subtitle: 'Upload and monitor strict Excel data loads'
	},
	[supeActRoute]: {
		title: 'Act',
		subtitle: 'Create, track, and monitor actions'
	}
};
