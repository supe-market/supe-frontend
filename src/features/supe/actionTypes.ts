export type ActionStatus = 'draft' | 'active' | 'completed' | 'cancelled';
export type ActionType = 'nudge' | 'scheme' | 'goal_push' | 'collection' | 'announcement';

export interface ActionTarget {
  entityType: 'salesman' | 'retailer' | 'beat' | 'sku' | 'distributor';
  entityId: string;
  entityName?: string;
  metadata?: Record<string, any>;
}

export interface ActionContext {
  sourceKind?: 'signal' | 'manual' | 'ask' | 'goal';
  actionType?: ActionType;
  sourceKey?: string | null;
  sourceEntityType?: string | null;
  sourceEntityId?: string | null;
  sourceEntityName?: string | null;
  title?: string;
  note?: string;
  askQuery?: string;
  audienceType?: ActionTarget['entityType'] | null;
  targets?: ActionTarget[];
}
