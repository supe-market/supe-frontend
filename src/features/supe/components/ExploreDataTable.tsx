import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import {
	BarsOutlined,
	CheckOutlined,
	CloseOutlined,
	CompressOutlined,
	DownloadOutlined,
	ExpandAltOutlined,
	LineChartOutlined,
	ReloadOutlined,
	SlidersOutlined,
	ThunderboltOutlined,
	UpOutlined,
	DownOutlined
} from '@ant-design/icons';
import styles from '../explore.module.scss';
import ExploreSelect, { type ExploreOption } from './ExploreSelect';

type SortDirection = 'asc' | 'desc';

export type ExploreColumn<T> = {
	key: string;
	label: string;
	category: string;
	defaultVisible: boolean;
	render: (row: T) => ReactNode;
	align?: 'left' | 'right' | 'center';
	sortable?: boolean;
	sortValue?: (row: T) => string | number | null;
	aggregate?: 'avg' | 'sum' | 'count' | 'min' | 'max' | 'none';
};

type ExploreDataTableProps<T extends Record<string, any>> = {
	data: T[];
	columns: ExploreColumn<T>[];
	groupBy: string;
	groupByOptions: ExploreOption[];
	onGroupByChange: (value: string) => void;
	onExport?: () => void;
	onInsights?: (entity: T, isAggregate?: boolean, groupLabel?: string) => void;
	onAction?: (entity: T) => void;
	onBulkAction?: (entities: T[]) => void;
	tableId?: string;
	recordLabel?: string;
};

function safeString(value: unknown): string {
	if (value === null || value === undefined) return '';
	if (typeof value === 'string') return value;
	if (typeof value === 'number' || typeof value === 'boolean') return String(value);
	try {
		return String(value);
	} catch {
		return JSON.stringify(value) || '';
	}
}

function getDerivedNumericValue(value: unknown): number | null {
	return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function ColumnPicker<T extends Record<string, any>>({
	columns,
	activeKeys,
	hasCustomSelection,
	onToggle,
	onReset
}: {
	columns: ExploreColumn<T>[];
	activeKeys: Set<string>;
	hasCustomSelection: boolean;
	onToggle: (key: string) => void;
	onReset: () => void;
}) {
	const [open, setOpen] = useState(false);
	const ref = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (!open) return;
		const handleClickOutside = (event: MouseEvent) => {
			if (ref.current && !ref.current.contains(event.target as Node)) {
				setOpen(false);
			}
		};
		document.addEventListener('mousedown', handleClickOutside);
		return () => document.removeEventListener('mousedown', handleClickOutside);
	}, [open]);

	const groupedColumns = useMemo(() => {
		const groups = new Map<string, ExploreColumn<T>[]>();
		columns.forEach((column, index) => {
			if (index === 0) {
				return;
			}
			const bucket = groups.get(column.category) || [];
			bucket.push(column);
			groups.set(column.category, bucket);
		});
		return Array.from(groups.entries());
	}, [columns]);

	return (
		<div className={styles.columnPickerWrap} ref={ref}>
			<button type="button" className={styles.tableControlButton} onClick={() => setOpen((current) => !current)}>
				<SlidersOutlined />
				<span>Columns</span>
				<span className={styles.tableControlCount}>
					{activeKeys.size}/{columns.length}
				</span>
			</button>
			{open ? (
				<div className={styles.columnPickerMenu}>
					<div className={styles.columnPickerHeader}>
						<span className={styles.columnPickerTitle}>Select parameters</span>
						{hasCustomSelection ? (
							<button type="button" className={styles.columnPickerReset} onClick={onReset}>
								<ReloadOutlined style={{ marginRight: 6 }} />
								Reset defaults
							</button>
						) : null}
					</div>
					<div className={styles.columnPickerBody}>
						<div className={styles.columnPickerSectionLabel}>Identity</div>
						<div className={styles.columnPickerRow}>
							<span className={[styles.columnPickerCheckbox, styles.columnPickerCheckboxChecked].join(' ')}>
								<CheckOutlined />
							</span>
							<span className={styles.columnPickerLabel}>{columns[0]?.label || 'Pinned'}</span>
							<span className={styles.columnPickerPinned}>Pinned</span>
						</div>
						{groupedColumns.map(([category, entries]) => (
							<div key={category}>
								<div className={styles.columnPickerSectionLabel}>{category}</div>
								{entries.map((column) => {
									const active = activeKeys.has(column.key);
									return (
										<button
											type="button"
											key={column.key}
											className={styles.columnPickerRow}
											onClick={() => onToggle(column.key)}
										>
											<span
												className={[
													styles.columnPickerCheckbox,
													active ? styles.columnPickerCheckboxChecked : ''
												]
													.filter(Boolean)
													.join(' ')}
											>
												{active ? <CheckOutlined /> : null}
											</span>
											<span className={styles.columnPickerLabel}>{column.label}</span>
										</button>
									);
								})}
							</div>
						))}
					</div>
				</div>
			) : null}
		</div>
	);
}

export default function ExploreDataTable<T extends Record<string, any>>({
	data,
	columns,
	groupBy,
	groupByOptions,
	onGroupByChange,
	onExport,
	onInsights,
	onAction,
	onBulkAction,
	tableId,
	recordLabel = 'records'
}: ExploreDataTableProps<T>) {
	const [sortConfig, setSortConfig] = useState<{ key: string; direction: SortDirection } | null>(null);
	const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
	const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
	const storageKey = tableId ? `supe_cols_${tableId}` : null;

	const getRowId = useCallback((row: T) => safeString(row.id || row.name || JSON.stringify(row)), []);

	const defaultActiveKeys = useMemo(
		() => new Set(columns.filter((column, index) => index === 0 || column.defaultVisible !== false).map((column) => column.key)),
		[columns]
	);

	const [activeKeys, setActiveKeys] = useState<Set<string>>(() => {
		if (storageKey) {
			try {
				const stored = localStorage.getItem(storageKey);
				if (stored) {
					const parsed = JSON.parse(stored) as string[];
					const validKeys = new Set(columns.map((column) => column.key));
					const filtered = parsed.filter((key) => validKeys.has(key));
					if (filtered.length > 0) {
						return new Set(filtered);
					}
				}
			} catch {
				/* noop */
			}
		}
		return new Set(defaultActiveKeys);
	});

	useEffect(() => {
		setSelectedRows(new Set());
	}, [data]);

	useEffect(() => {
		if (!groupBy) {
			setCollapsedGroups(new Set());
			return;
		}
		const names = Array.from(
			new Set(
				data
					.map((row) => safeString(row[groupBy] || 'Ungrouped'))
					.filter(Boolean)
			)
		);
		setCollapsedGroups(new Set(names));
	}, [groupBy, data]);

	const toggleColumn = useCallback(
		(key: string) => {
			setActiveKeys((current) => {
				const next = new Set(current);
				if (next.has(key)) {
					next.delete(key);
				} else {
					next.add(key);
				}
				if (storageKey) {
					try {
						localStorage.setItem(storageKey, JSON.stringify(Array.from(next)));
					} catch {
						/* noop */
					}
				}
				return next;
			});
		},
		[storageKey]
	);

	const resetColumns = useCallback(() => {
		setActiveKeys(new Set(defaultActiveKeys));
		if (storageKey) {
			try {
				localStorage.removeItem(storageKey);
			} catch {
				/* noop */
			}
		}
	}, [defaultActiveKeys, storageKey]);

	const visibleColumns = useMemo(() => columns.filter((column) => activeKeys.has(column.key)), [columns, activeKeys]);

	const hasCustomSelection = useMemo(() => {
		if (activeKeys.size !== defaultActiveKeys.size) {
			return true;
		}
		for (const key of activeKeys) {
			if (!defaultActiveKeys.has(key)) {
				return true;
			}
		}
		return false;
	}, [activeKeys, defaultActiveKeys]);

	const getColumnSortValue = useCallback((row: T, column: ExploreColumn<T>) => {
		const explicit = column.sortValue ? column.sortValue(row) : row[column.key];
		return explicit ?? null;
	}, []);

	const sortedData = useMemo(() => {
		if (!sortConfig) {
			return data;
		}
		const activeColumn = columns.find((column) => column.key === sortConfig.key);
		if (!activeColumn) {
			return data;
		}
		return [...data].sort((left, right) => {
			const leftValue = getColumnSortValue(left, activeColumn);
			const rightValue = getColumnSortValue(right, activeColumn);
			if (leftValue === rightValue) return 0;
			if (leftValue === null || leftValue === undefined) return 1;
			if (rightValue === null || rightValue === undefined) return -1;
			if (typeof leftValue === 'number' && typeof rightValue === 'number') {
				return sortConfig.direction === 'asc' ? leftValue - rightValue : rightValue - leftValue;
			}
			const leftText = safeString(leftValue).toLowerCase();
			const rightText = safeString(rightValue).toLowerCase();
			if (sortConfig.direction === 'asc') {
				return leftText < rightText ? -1 : 1;
			}
			return leftText > rightText ? -1 : 1;
		});
	}, [columns, data, getColumnSortValue, sortConfig]);

	const groupedData = useMemo(() => {
		if (!groupBy) {
			return { '': sortedData };
		}
		return sortedData.reduce<Record<string, T[]>>((accumulator, row) => {
			const key = safeString(row[groupBy] || 'Ungrouped');
			accumulator[key] = accumulator[key] || [];
			accumulator[key].push(row);
			return accumulator;
		}, {});
	}, [groupBy, sortedData]);

	const computeAggregate = useCallback(
		(rows: T[]) => {
			const aggregate: Record<string, unknown> = { ...(rows[0] || {}) };
			for (const column of columns) {
				const values = rows.map((row) => getColumnSortValue(row, column));
				const numericValues = values
					.map((value) => getDerivedNumericValue(value))
					.filter((value): value is number => value !== null);
				if (numericValues.length > 0 && numericValues.length === values.filter((value) => value !== null).length) {
					switch (column.aggregate || 'avg') {
						case 'sum':
							aggregate[column.key] = numericValues.reduce((sum, value) => sum + value, 0);
							break;
						case 'min':
							aggregate[column.key] = Math.min(...numericValues);
							break;
						case 'max':
							aggregate[column.key] = Math.max(...numericValues);
							break;
						case 'count':
							aggregate[column.key] = numericValues.length;
							break;
						case 'none':
							aggregate[column.key] = null;
							break;
						case 'avg':
						default:
							aggregate[column.key] = numericValues.reduce((sum, value) => sum + value, 0) / numericValues.length;
							break;
					}
				} else {
					aggregate[column.key] = values[0] ?? null;
				}
			}
			return aggregate as T;
		},
		[columns, getColumnSortValue]
	);

	const allRowIds = useMemo(() => data.map(getRowId), [data, getRowId]);
	const allSelected = allRowIds.length > 0 && allRowIds.every((id) => selectedRows.has(id));
	const someSelected = selectedRows.size > 0 && !allSelected;
	const selectedData = useMemo(() => data.filter((row) => selectedRows.has(getRowId(row))), [data, getRowId, selectedRows]);

	const toggleRowSelection = useCallback((rowId: string) => {
		setSelectedRows((current) => {
			const next = new Set(current);
			if (next.has(rowId)) next.delete(rowId);
			else next.add(rowId);
			return next;
		});
	}, []);

	const toggleAllRows = useCallback(() => {
		setSelectedRows((current) => {
			const next = new Set(current);
			const everySelected = allRowIds.every((id) => next.has(id));
			if (everySelected) {
				return new Set();
			}
			return new Set(allRowIds);
		});
	}, [allRowIds]);

	const handleSort = useCallback((key: string) => {
		setSortConfig((current) => {
			if (!current || current.key !== key) {
				return { key, direction: 'asc' };
			}
			return { key, direction: current.direction === 'asc' ? 'desc' : 'asc' };
		});
	}, []);

	const getSortIcon = useCallback(
		(key: string) => {
			const active = sortConfig?.key === key ? sortConfig.direction : null;
			return (
				<span className={[styles.exploreSortIcon, active ? styles.exploreSortIconActive : ''].filter(Boolean).join(' ')}>
					<UpOutlined className={active === 'desc' ? styles.exploreSortIconMuted : ''} />
					<DownOutlined className={active === 'asc' ? styles.exploreSortIconMuted : ''} />
				</span>
			);
		},
		[sortConfig]
	);

	const renderCheckbox = useCallback(
		(checked: boolean, indeterminate: boolean, onClick: () => void) => (
			<button
				type="button"
				className={[
					styles.exploreCheckbox,
					checked || indeterminate ? styles.exploreCheckboxChecked : ''
				]
					.filter(Boolean)
					.join(' ')}
				onClick={(event) => {
					event.stopPropagation();
					onClick();
				}}
			>
				{checked ? <CheckOutlined /> : indeterminate ? <BarsOutlined /> : null}
			</button>
		),
		[]
	);

	const groupNames = Object.keys(groupedData).filter(Boolean);
	const allGroupsCollapsed = groupNames.length > 0 && groupNames.every((group) => collapsedGroups.has(group));
	const allGroupsExpanded = groupNames.length > 0 && groupNames.every((group) => !collapsedGroups.has(group));

	return (
		<div className={styles.exploreTableShell}>
			<div className={styles.exploreControlsRow}>
				<div className={styles.exploreControlsLeft}>
					<ExploreSelect
						label="Group:"
						value={groupBy}
						options={groupByOptions}
						onChange={onGroupByChange}
						leadingIcon={<BarsOutlined />}
						compact
					/>
					<span className={styles.exploreInlineMeta}>
						{data.length} {recordLabel}
					</span>
					{groupBy ? <span className={styles.exploreDivider} /> : null}
					{groupBy ? (
						<>
							<button
								type="button"
								className={styles.tableControlButton}
								onClick={() => setCollapsedGroups(new Set())}
								disabled={allGroupsExpanded}
							>
								<ExpandAltOutlined />
								Expand
							</button>
							<button
								type="button"
								className={styles.tableControlButton}
								onClick={() => setCollapsedGroups(new Set(groupNames))}
								disabled={allGroupsCollapsed}
							>
								<CompressOutlined />
								Collapse
							</button>
						</>
					) : null}
				</div>
				<div className={styles.exploreControlsRight}>
					<ColumnPicker
						columns={columns}
						activeKeys={activeKeys}
						onToggle={toggleColumn}
						onReset={resetColumns}
						hasCustomSelection={hasCustomSelection}
					/>
					{onExport ? (
						<button type="button" className={styles.tableControlButton} onClick={onExport}>
							<DownloadOutlined />
							Export
						</button>
					) : null}
				</div>
			</div>
			<div className={styles.exploreTableScroll}>
				<table className={styles.exploreTable}>
					<thead className={styles.exploreTableHead}>
						<tr>
							<th className={[styles.exploreTh, styles.exploreCheckboxCell].join(' ')}>
								{renderCheckbox(allSelected, someSelected, toggleAllRows)}
							</th>
							{visibleColumns.map((column) => (
								<th
									key={column.key}
									className={[
										styles.exploreTh,
										column.sortable === false ? '' : styles.exploreThSortable
									]
										.filter(Boolean)
										.join(' ')}
									style={{ textAlign: column.align || 'left' }}
									onClick={() => (column.sortable === false ? undefined : handleSort(column.key))}
								>
									<div
										className={styles.exploreThInner}
										style={{
											justifyContent:
												column.align === 'right'
													? 'flex-end'
													: column.align === 'center'
														? 'center'
														: 'flex-start'
										}}
									>
										<span>{column.label}</span>
										{column.sortable === false ? null : getSortIcon(column.key)}
									</div>
								</th>
							))}
							{onInsights || onAction ? <th className={styles.exploreTh} style={{ width: 150 }} /> : null}
						</tr>
					</thead>
					<tbody>
						{data.length === 0 ? (
							<tr className={styles.exploreTr}>
								<td className={[styles.exploreTd, styles.exploreCheckboxCell].join(' ')} />
								<td
									className={styles.exploreTd}
									colSpan={visibleColumns.length + (onInsights || onAction ? 1 : 0)}
									style={{ textAlign: 'center', height: 220 }}
								>
									<div className={styles.exploreEmpty}>
										<strong>No data available</strong>
										<p>Try adjusting your filters.</p>
									</div>
								</td>
							</tr>
						) : (
							Object.entries(groupedData).flatMap(([groupName, rows]) => {
							if (!groupBy) {
								return rows.map((row, index) => {
									const rowId = getRowId(row);
									const selected = selectedRows.has(rowId);
									return (
										<tr
											key={`row-${rowId}-${index}`}
											className={[styles.exploreTr, selected ? styles.exploreTrSelected : '']
												.filter(Boolean)
												.join(' ')}
										>
											<td className={[styles.exploreTd, styles.exploreCheckboxCell].join(' ')}>
												{renderCheckbox(selected, false, () => toggleRowSelection(rowId))}
											</td>
											{visibleColumns.map((column) => (
												<td
													key={column.key}
													className={[styles.exploreTd, column.key === visibleColumns[0]?.key ? styles.explorePrimaryCell : '']
														.filter(Boolean)
														.join(' ')}
													style={{ textAlign: column.align || 'left' }}
												>
													{column.render(row)}
												</td>
											))}
											{onInsights || onAction ? (
												<td className={styles.exploreTd}>
													<div className={styles.exploreHoverActions}>
														{onInsights ? (
															<button
																type="button"
																className={[styles.rowActionButton, styles.insightButton].join(' ')}
																onClick={() => onInsights(row)}
															>
																<LineChartOutlined />
																Insights
															</button>
														) : null}
														{onAction ? (
															<button
																type="button"
																className={[styles.rowActionButton, styles.actButton].join(' ')}
																onClick={() => onAction(row)}
															>
																<ThunderboltOutlined />
																Act
															</button>
														) : null}
													</div>
												</td>
											) : null}
										</tr>
									);
								});
							}

							const aggregate = computeAggregate(rows);
							const collapsed = collapsedGroups.has(groupName);
							const groupRowIds = rows.map((row) => getRowId(row));
							const everyGroupRowSelected = groupRowIds.every((rowId) => selectedRows.has(rowId));
							const someGroupRowsSelected = groupRowIds.some((rowId) => selectedRows.has(rowId)) && !everyGroupRowSelected;
							const toggleGroupRows = () => {
								setSelectedRows((current) => {
									const next = new Set(current);
									if (everyGroupRowSelected) {
										groupRowIds.forEach((rowId) => next.delete(rowId));
									} else {
										groupRowIds.forEach((rowId) => next.add(rowId));
									}
									return next;
								});
							};

							if (collapsed) {
								return [
									<tr
										key={`group-${groupName}`}
										className={styles.exploreGroupHeader}
										onClick={() =>
											setCollapsedGroups((current) => {
												const next = new Set(current);
												next.delete(groupName);
												return next;
											})
										}
									>
										<td className={styles.exploreCheckboxCell}>
											{renderCheckbox(everyGroupRowSelected, someGroupRowsSelected, toggleGroupRows)}
										</td>
										<td colSpan={visibleColumns.length + (onInsights || onAction ? 1 : 0)}>
											<div className={styles.groupHeaderInner}>
												<div className={styles.groupHeaderLeft}>
													<DownOutlined />
													<span>{groupName}</span>
													<span className={styles.groupCount}>{rows.length} {recordLabel}</span>
												</div>
												<div className={styles.groupHeaderRight}>
													{onInsights ? (
														<button
															type="button"
															className={[styles.rowActionButton, styles.insightButton].join(' ')}
															onClick={(event) => {
																event.stopPropagation();
																onInsights(aggregate, true, groupName);
															}}
														>
															<LineChartOutlined />
															Group insights
														</button>
													) : null}
												</div>
											</div>
										</td>
									</tr>
								];
							}

							return [
								<tr key={`group-open-${groupName}`} className={styles.exploreGroupHeader}>
									<td className={styles.exploreCheckboxCell}>
										{renderCheckbox(everyGroupRowSelected, someGroupRowsSelected, toggleGroupRows)}
									</td>
									<td colSpan={visibleColumns.length + (onInsights || onAction ? 1 : 0)}>
										<div className={styles.groupHeaderInner}>
											<div className={styles.groupHeaderLeft}>
												<button
													type="button"
													className={styles.tableControlButton}
													onClick={() =>
														setCollapsedGroups((current) => {
															const next = new Set(current);
															next.add(groupName);
															return next;
														})
													}
												>
													<CompressOutlined />
													{groupName}
												</button>
												<span className={styles.groupCount}>{rows.length} {recordLabel}</span>
											</div>
											<div className={styles.groupHeaderRight}>
												{onInsights ? (
													<button
														type="button"
														className={[styles.rowActionButton, styles.insightButton].join(' ')}
														onClick={() => onInsights(aggregate, true, groupName)}
													>
														<LineChartOutlined />
														Group insights
													</button>
												) : null}
											</div>
										</div>
									</td>
								</tr>,
								...rows.map((row, index) => {
									const rowId = getRowId(row);
									const selected = selectedRows.has(rowId);
									return (
										<tr
											key={`group-row-${groupName}-${rowId}-${index}`}
											className={[styles.exploreTr, selected ? styles.exploreTrSelected : '']
												.filter(Boolean)
												.join(' ')}
										>
											<td className={[styles.exploreTd, styles.exploreCheckboxCell].join(' ')}>
												{renderCheckbox(selected, false, () => toggleRowSelection(rowId))}
											</td>
											{visibleColumns.map((column) => (
												<td
													key={column.key}
													className={[styles.exploreTd, column.key === visibleColumns[0]?.key ? styles.explorePrimaryCell : '']
														.filter(Boolean)
														.join(' ')}
													style={{ textAlign: column.align || 'left' }}
												>
													{column.render(row)}
												</td>
											))}
											{onInsights || onAction ? (
												<td className={styles.exploreTd}>
													<div className={styles.exploreHoverActions}>
														{onInsights ? (
															<button
																type="button"
																className={[styles.rowActionButton, styles.insightButton].join(' ')}
																onClick={() => onInsights(row)}
															>
																<LineChartOutlined />
																Insights
															</button>
														) : null}
														{onAction ? (
															<button
																type="button"
																className={[styles.rowActionButton, styles.actButton].join(' ')}
																onClick={() => onAction(row)}
															>
																<ThunderboltOutlined />
																Act
															</button>
														) : null}
													</div>
												</td>
											) : null}
										</tr>
									);
								})
							];
							})
						)}
					</tbody>
				</table>
			</div>
			{selectedRows.size > 0 ? (
				<div className={styles.selectionBar}>
					<span className={styles.selectionMeta}>
						{selectedRows.size} {selectedRows.size === 1 ? 'row' : 'rows'} selected
					</span>
					<span className={styles.selectionDivider} />
					{onInsights && selectedData.length > 0 ? (
						<button
							type="button"
							className={[styles.selectionButton, styles.selectionInsightsButton].join(' ')}
							onClick={() => onInsights(computeAggregate(selectedData), true, `Selection (${selectedRows.size})`)}
						>
							<LineChartOutlined />
							Insights on selection
						</button>
					) : null}
					{selectedData.length === 1 && onAction ? (
						<button
							type="button"
							className={[styles.selectionButton, styles.selectionActButton].join(' ')}
							onClick={() => onAction(selectedData[0])}
						>
							<ThunderboltOutlined />
							Act
						</button>
					) : null}
					{selectedData.length > 1 && onBulkAction ? (
						<button
							type="button"
							className={[styles.selectionButton, styles.selectionActButton].join(' ')}
							onClick={() => onBulkAction(selectedData)}
						>
							<ThunderboltOutlined />
							Act on {selectedData.length}
						</button>
					) : null}
					<button
						type="button"
						className={[styles.selectionButton, styles.selectionClearButton].join(' ')}
						onClick={() => setSelectedRows(new Set())}
					>
						<CloseOutlined />
						Clear
					</button>
				</div>
			) : null}
		</div>
	);
}
