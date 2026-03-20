import { Card, Typography } from 'antd';
import { ArrowUpOutlined, ArrowDownOutlined } from '@ant-design/icons';
import { ReactNode } from 'react';
import styles from '../index.module.scss';

const { Paragraph, Title } = Typography;

interface IKpiCardProps {
	label: string;
	value: string;
	trendPct: number;
	subtext?: string;
	icon?: ReactNode;
}

export function KpiCard({ label, value, trendPct, subtext, icon }: IKpiCardProps) {
	const isUp = trendPct >= 0;
	return (
		<Card className={styles.kpiCard} bodyStyle={{ padding: '14px 16px' }}>
			<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
				<Paragraph className={styles.kpiLabel} style={{ marginBottom: 4 }}>
					{label}
				</Paragraph>
				{icon && <span style={{ fontSize: 18, color: '#2563eb', opacity: 0.7 }}>{icon}</span>}
			</div>
			<Title level={4} style={{ margin: 0, color: '#0f172a', fontSize: '1.35rem' }}>
				{value}
			</Title>
			<div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
				<span className={isUp ? styles.kpiTrendUp : styles.kpiTrendDown}>
					{isUp ? <ArrowUpOutlined /> : <ArrowDownOutlined />}
					{Math.abs(trendPct).toFixed(1)}%
				</span>
				{subtext && <span className={styles.mutedText}>{subtext}</span>}
			</div>
		</Card>
	);
}
