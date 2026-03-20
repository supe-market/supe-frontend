import { LineChart, Line, ResponsiveContainer, Tooltip } from 'recharts';

interface ITrendSparklineProps {
	data: number[];
	color?: string;
	height?: number;
}

export function TrendSparkline({ data, color = '#2563eb', height = 48 }: ITrendSparklineProps) {
	const chartData = data.map((value, index) => ({ index, value }));
	return (
		<ResponsiveContainer width="100%" height={height}>
			<LineChart data={chartData} margin={{ top: 4, right: 4, left: 4, bottom: 4 }}>
				<Tooltip
					formatter={(value: number) => [value.toLocaleString('en-IN'), '']}
					labelFormatter={() => ''}
					contentStyle={{ fontSize: 11, padding: '2px 6px', borderRadius: 6 }}
				/>
				<Line type="monotone" dataKey="value" stroke={color} strokeWidth={2} dot={false} activeDot={{ r: 3, fill: color }} />
			</LineChart>
		</ResponsiveContainer>
	);
}
