export function formatCurrency(value: number | string | undefined | null) {
	const numeric = Number(value || 0);
	return new Intl.NumberFormat('en-IN', {
		style: 'currency',
		currency: 'INR',
		maximumFractionDigits: 0
	}).format(numeric);
}

export function formatNumber(value: number | string | undefined | null, decimals = 0) {
	const numeric = Number(value || 0);
	return numeric.toLocaleString('en-IN', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

export function formatCurrencyLakhs(value: number | string | undefined | null): string {
	const numeric = Number(value || 0);
	if (numeric >= 10000000) {
		return `₹${(numeric / 10000000).toFixed(2)}Cr`;
	}
	if (numeric >= 100000) {
		return `₹${(numeric / 100000).toFixed(1)}L`;
	}
	if (numeric >= 1000) {
		return `₹${(numeric / 1000).toFixed(0)}K`;
	}
	return `₹${numeric.toFixed(0)}`;
}

export function getPaceStatus(paceRatio: number): { label: string; color: string } {
	if (paceRatio >= 1.05) return { label: 'Accelerating', color: '#16a34a' };
	if (paceRatio >= 0.9) return { label: 'On Track', color: '#2563eb' };
	if (paceRatio >= 0.7) return { label: 'Moderately Lagging', color: '#d97706' };
	return { label: 'Stalled', color: '#dc2626' };
}

export function computePercentile(value: number, allValues: number[]): number {
	if (allValues.length === 0) return 50;
	const sorted = [...allValues].sort((a, b) => a - b);
	const index = sorted.findIndex((v) => v >= value);
	return index < 0 ? 100 : Math.round((index / sorted.length) * 100);
}

export function formatDateTime(value: string | Date | undefined | null) {
	if (!value) {
		return '-';
	}
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) {
		return '-';
	}
	return date.toLocaleString('en-IN', {
		year: 'numeric',
		month: 'short',
		day: '2-digit',
		hour: '2-digit',
		minute: '2-digit'
	});
}
