import { Button, Tag } from 'antd';
import styles from '../index.module.scss';

const severityColorMap: Record<string, string> = {
	critical: 'red',
	warning: 'orange',
	opportunity: 'green'
};

interface IIntelligenceBulletProps {
	id: string;
	severity: 'critical' | 'warning' | 'opportunity';
	title: string;
	description: string;
	ctaLabel?: string;
	onCta?: () => void;
}

export function IntelligenceBullet({ severity, title, description, ctaLabel, onCta }: IIntelligenceBulletProps) {
	return (
		<div className={styles.bulletItem}>
			<div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, flexWrap: 'wrap' }}>
				<Tag color={severityColorMap[severity] || 'default'} style={{ marginRight: 0, flexShrink: 0 }}>
					{severity}
				</Tag>
				<span className={styles.bulletHeadline}>{title}</span>
			</div>
			<div className={styles.mutedText} style={{ marginTop: 4 }}>
				{description}
			</div>
			{ctaLabel && onCta && (
				<Button type="link" className={styles.linkBtn} size="small" onClick={onCta} style={{ marginTop: 4 }}>
					{ctaLabel}
				</Button>
			)}
		</div>
	);
}
