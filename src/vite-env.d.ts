/// <reference types="vite/client" />

declare module 'react-plotly.js/factory' {
	const createPlotlyComponent: (plotly: any) => any;
	export default createPlotlyComponent;
}

declare module 'plotly.js-dist-min' {
	const plotly: any;
	export default plotly;
}
