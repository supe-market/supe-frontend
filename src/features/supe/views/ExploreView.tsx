import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supeExploreEntities, type SupeExploreEntity } from '../constants';
import { EntityView } from './EntityView';

const entityTitleMap: Record<SupeExploreEntity, string> = {
  salesman: 'Salesman Performance',
  retailer: 'Retailer Health',
  sku: 'SKU Performance',
  distributor: 'Distributor Operations',
  beat: 'Beat Performance'
};

function getEntityParam(value: string | null): SupeExploreEntity {
  if (value && supeExploreEntities.includes(value as SupeExploreEntity)) {
    return value as SupeExploreEntity;
  }
  return 'salesman';
}

export function ExploreView() {
  const [searchParams] = useSearchParams();
  const entityType = useMemo(() => getEntityParam(searchParams.get('entity')), [searchParams]);

  return <EntityView entityType={entityType} title={entityTitleMap[entityType]} />;
}
