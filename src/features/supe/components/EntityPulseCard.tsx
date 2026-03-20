import { Button, Card } from 'antd';
import { WarningOutlined, AlertOutlined, RiseOutlined } from '@ant-design/icons';
import styles from '../index.module.scss';

interface IEntityPulseCardProps {
	label: string;
	entityType: string;
	criticalCount: number;
	warningCount: number;
	opportunityCount: number;
	onExplore?: () => void;
}

export function EntityPulseCard({ label, criticalCount, warningCount, opportunityCount, onExplore }: IEntityPulseCardProps) {
	return (
		<Card className={styles.cardBlock} bodyStyle={{ padding: '12px 14px' }} size="small">
			<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
				<span style={{ fontWeight: 600, color: '#0f172a', fontSize: '0.92rem' }}>{label}</span>
				{onExplore && (
					<Button type="link" size="small" className={styles.linkBtn} onClick={onExplore}>
						Explore →
					</Button>
				)}
			</div>
			<div style={{ display: 'flex', gap: 12 }}>
				<span style={{ color: '#dc2626', fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: 3 }}>
					<AlertOutlined />
					{criticalCount} critical
				</span>
				<span style={{ color: '#d97706', fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: 3 }}>
					<WarningOutlined />
					{warningCount} warning
				</span>
				<span style={{ color: '#16a34a', fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: 3 }}>
					<RiseOutlined />
					{opportunityCount} opp
				</span>
			</div>
		</Card>
	);
}
