import styles from '../explore.module.scss';
import ExploreSelect, { type ExploreOption } from './ExploreSelect';

type ExploreLensesBarProps = {
	territory: string;
	territoryOptions: ExploreOption[];
	timeWindow: string;
	timeOptions: ExploreOption[];
	showBy: string;
	showOptions: ExploreOption[];
	onTerritoryChange: (value: string) => void;
	onTimeWindowChange: (value: string) => void;
	onShowByChange: (value: string) => void;
};

export default function ExploreLensesBar({
	territory,
	territoryOptions,
	timeWindow,
	timeOptions,
	showBy,
	showOptions,
	onTerritoryChange,
	onTimeWindowChange,
	onShowByChange
}: ExploreLensesBarProps) {
	return (
		<div className={styles.exploreBar}>
			<ExploreSelect
				label="Territory:"
				value={territory}
				options={territoryOptions}
				onChange={onTerritoryChange}
				showReset
				wide
			/>
			<ExploreSelect
				label="Time:"
				value={timeWindow}
				options={timeOptions}
				onChange={onTimeWindowChange}
				leadingIcon={null}
				wide
			/>
			<ExploreSelect
				label="Show:"
				value={showBy}
				options={showOptions}
				onChange={onShowByChange}
				leadingIcon={null}
				wide
			/>
		</div>
	);
}
