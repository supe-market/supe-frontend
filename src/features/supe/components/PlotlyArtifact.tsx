import { Skeleton, Typography } from 'antd';
import { Suspense, lazy } from 'react';
import type { ComponentType } from 'react';
import type { ISupeAskArtifact } from '../types';
import styles from '../index.module.scss';

type PlotlyPayload = {
	data: any[];
	layout?: Record<string, any>;
	frames?: any[];
	config?: Record<string, any>;
};

const DEFAULT_PLOT_HEIGHT = 280;

const getChartColorway = () => {
	const style = getComputedStyle(document.documentElement);
	return [1, 2, 3, 4, 5]
		.map(i => style.getPropertyValue(`--ask-chart-${i}`).trim())
		.filter(Boolean);
};

const LazyPlot = lazy(async () => {
	const [{ default: createPlotlyComponent }, plotlyModule] = await Promise.all([
		import('react-plotly.js/factory'),
		import('plotly.js-dist-min')
	]);
	const plotly = (plotlyModule as { default?: unknown }).default ?? plotlyModule;
	return { default: createPlotlyComponent(plotly as any) as ComponentType<any> };
});

function isPlotlyPayload(value: Record<string, any> | null | undefined): value is PlotlyPayload {
	if (!value || !Array.isArray(value.data)) return false;
	if (value.layout != null && typeof value.layout !== 'object') return false;
	if (value.frames != null && !Array.isArray(value.frames)) return false;
	if (value.config != null && typeof value.config !== 'object') return false;
	return true;
}

function PlotlyFallback({ message }: { message: string }) {
	return (
		<div className={styles.askArtifactFallback}>
			<Typography.Text type="secondary">{message}</Typography.Text>
		</div>
	);
}

export function PlotlyArtifact({ artifact }: { artifact: ISupeAskArtifact }) {
	const payload = artifact.payload;
	if (!isPlotlyPayload(payload)) {
		return <PlotlyFallback message="Chart payload is malformed and could not be rendered." />;
	}

	const colorway = getChartColorway();
	const layout = {
		autosize: true,
		...(colorway.length > 0 ? { colorway } : {}),
		legend: {
			orientation: 'h' as const,
			x: 0.5,
			xanchor: 'center' as const,
			y: -0.2,
			yanchor: 'top' as const,
		},
		...payload.layout,
	};
	const config = {
		responsive: true,
		displayModeBar: false,
		scrollZoom: false,
		...payload.config,
	};
	const frames = Array.isArray(payload.frames) ? payload.frames : undefined;

	return (
		<Suspense fallback={<Skeleton active paragraph={{ rows: 4 }} />}>
			<div className={styles.askChartShell}>
				<LazyPlot
					data={payload.data}
					layout={layout}
					frames={frames}
					config={config}
					useResizeHandler
					style={{ width: '100%', height: DEFAULT_PLOT_HEIGHT }}
				/>
			</div>
		</Suspense>
	);
}
