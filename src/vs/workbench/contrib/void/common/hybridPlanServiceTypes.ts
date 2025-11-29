import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { HybridPlan, HybridExecutionState } from './hybridAgentTypes.js';

export const IHybridPlanService = createDecorator<IHybridPlanService>('hybridPlanService');

export interface IHybridPlanService {
	readonly _serviceBrand: undefined;

	// Plan CRUD
	savePlan(plan: HybridPlan, scope: 'project' | 'global'): Promise<void>;
	getPlan(planId: string, scope: 'project' | 'global'): Promise<HybridPlan | null>;
	listPlans(scope: 'project' | 'global' | 'both'): Promise<HybridPlan[]>;
	deletePlan(planId: string, scope: 'project' | 'global'): Promise<void>;

	// Execution state
	saveExecutionState(state: HybridExecutionState): Promise<void>;
	getExecutionState(planId: string): Promise<HybridExecutionState | null>;
	clearExecutionState(planId: string): Promise<void>;
}



