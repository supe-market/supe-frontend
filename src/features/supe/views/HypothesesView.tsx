import { Button, Input } from 'antd';
import { SendOutlined, StarOutlined } from '@ant-design/icons';
import { useState } from 'react';
import styles from '../index.module.scss';

const SUGGESTED_QUERIES = [
	'Take Premium Atta 10kg to 1Cr in Delhi',
	'Where can I sell Pulses Mix 500g (expand)?',
	'Why is Tamil Nadu underperforming?',
	'What if I add 3 salesmen in Maharashtra?'
];

export function HypothesesView() {
	const [query, setQuery] = useState('');

	return (
		<div className={styles.hypothesisPromptPage}>
			<div className={styles.hypothesisPromptCenter}>
				<div className={styles.hypothesisPromptIconWrap}>
					<StarOutlined />
				</div>

				<h1 className={styles.hypothesisPromptTitle}>What do you want to know?</h1>
				<p className={styles.hypothesisPromptSubtitle}>
					Ask anything about your business. I'll query across salesmen, retailers, distributors, SKUs, and geographies.
				</p>

				<div className={styles.hypothesisInputRow}>
					<Input
						value={query}
						onChange={(event) => setQuery(event.target.value)}
						placeholder="e.g. Take Atta 10kg to 1Cr in Delhi..."
						className={styles.hypothesisMainInput}
					/>
					<Button
						type="text"
						aria-label="Send hypothesis query"
						icon={<SendOutlined />}
						className={styles.hypothesisSendButton}
					/>
				</div>

				<div className={styles.hypothesisChipsWrap}>
					{SUGGESTED_QUERIES.map((item) => (
						<Button key={item} type="default" className={styles.hypothesisChip} onClick={() => setQuery(item)}>
							{item}
						</Button>
					))}
				</div>
			</div>
		</div>
	);
}
