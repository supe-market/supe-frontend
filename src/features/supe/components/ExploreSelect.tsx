import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { CheckOutlined, CloseOutlined, DownOutlined, EnvironmentOutlined } from '@ant-design/icons';
import styles from '../explore.module.scss';

export type ExploreOption = {
	label: string;
	value: string;
	meta?: string;
};

type ExploreSelectProps = {
	label?: string;
	value: string;
	options: ExploreOption[];
	onChange: (value: string) => void;
	leadingIcon?: ReactNode | null;
	compact?: boolean;
	wide?: boolean;
	showReset?: boolean;
	resetLabel?: string;
};

export default function ExploreSelect({
	label,
	value,
	options,
	onChange,
	leadingIcon,
	compact = false,
	wide = false,
	showReset = false,
	resetLabel = 'all'
}: ExploreSelectProps) {
	const [open, setOpen] = useState(false);
	const ref = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (!open) {
			return;
		}
		const handleClickOutside = (event: MouseEvent) => {
			if (ref.current && !ref.current.contains(event.target as Node)) {
				setOpen(false);
			}
		};
		document.addEventListener('mousedown', handleClickOutside);
		return () => document.removeEventListener('mousedown', handleClickOutside);
	}, [open]);

	const activeOption = options.find((option) => option.value === value) || options[0];

	return (
		<div className={styles.exploreBarItem}>
			{label ? <span className={styles.exploreBarLabel}>{label}</span> : null}
			<div className={styles.exploreSelectWrap} ref={ref}>
				<button
					type="button"
					className={[
						styles.exploreSelectButton,
						compact ? styles.exploreSelectButtonCompact : '',
						wide ? styles.exploreSelectButtonWide : '',
						open ? styles.exploreSelectButtonActive : ''
					]
						.filter(Boolean)
						.join(' ')}
					onClick={() => setOpen((current) => !current)}
				>
					<span className={styles.exploreSelectValue}>
						{leadingIcon === null ? null : (
							<span className={styles.exploreSelectLeadingIcon}>
								{leadingIcon === undefined ? <EnvironmentOutlined /> : leadingIcon}
							</span>
						)}
						<span className={styles.exploreSelectValueText}>{activeOption?.label || value}</span>
					</span>
					<DownOutlined className={styles.exploreSelectCaret} />
				</button>
				{open ? (
					<div className={styles.exploreSelectMenu}>
						<div className={styles.exploreSelectMenuBody}>
							{options.map((option) => {
								const active = option.value === value;
								return (
									<button
										type="button"
										key={option.value}
										className={[styles.exploreSelectOption, active ? styles.exploreSelectOptionActive : '']
											.filter(Boolean)
											.join(' ')}
										onClick={() => {
											onChange(option.value);
											setOpen(false);
										}}
									>
										<span>{option.label}</span>
										{active ? <CheckOutlined /> : option.meta ? <span>{option.meta}</span> : null}
									</button>
								);
							})}
							{showReset && value !== resetLabel ? (
								<button
									type="button"
									className={styles.exploreSelectOption}
									onClick={() => {
										onChange(resetLabel);
										setOpen(false);
									}}
								>
									<span>Reset to All India</span>
									<CloseOutlined />
								</button>
							) : null}
						</div>
					</div>
				) : null}
			</div>
		</div>
	);
}
