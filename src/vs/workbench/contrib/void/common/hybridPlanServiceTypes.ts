import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { HybridPlan, HybridExecutionState, PlanEditSession, PlanEditMessage } from './hybridAgentTypes.js';

export const IHybridPlanService = createDecorator<IHybridPlanService>('hybridPlanService');

// Response type for plan edit message
export interface PlanEditResponse {
	content: string;
	toolCalls?: Array<{
		toolName: string;
		parameters: Record<string, unknown>;
		result?: { success: boolean; message?: string; error?: string };
	}>;
	updatedPlan?: HybridPlan;
	updatedSection?: string;
}

export interface IHybridPlanService {
	readonly _serviceBrand: undefined;

	// Plan CRUD
	savePlan(plan: HybridPlan, scope: 'project' | 'global'): Promise<void>;
	getPlan(planId: string, scope: 'project' | 'global'): Promise<HybridPlan | null>;
	listPlans(scope: 'project' | 'global' | 'both'): Promise<HybridPlan[]>;
	deletePlan(planId: string, scope: 'project' | 'global' | 'both'): Promise<void>;

	// Execution state
	saveExecutionState(state: HybridExecutionState): Promise<void>;
	getExecutionState(planId: string): Promise<HybridExecutionState | null>;
	clearExecutionState(planId: string): Promise<void>;

	// Plan mode specific methods
	savePlanFromConversation(conversationId: string, title: string, content: string, scope: 'project' | 'global'): Promise<string>;
	archivePlan(planId: string, scope: 'project' | 'global'): Promise<void>;
	listPlansByType(planType: HybridPlan['planType'], scope: 'project' | 'global' | 'both'): Promise<HybridPlan[]>;

	// Edit session management
	saveEditSession(session: PlanEditSession, scope: 'project' | 'global'): Promise<void>;
	getEditSessions(planId: string, scope: 'project' | 'global' | 'both'): Promise<PlanEditSession[]>;
	deleteEditSession(sessionId: string, scope: 'project' | 'global'): Promise<void>;

	// Versioning for undo
	savePlanSnapshot(planId: string, snapshot: HybridPlan, scope: 'project' | 'global'): Promise<void>;
	getLastPlanSnapshot(planId: string, scope: 'project' | 'global'): Promise<HybridPlan | null>;

	// Plan edit message handling
	sendPlanEditMessage(planId: string, message: string, history: PlanEditMessage[], scope: 'project' | 'global'): Promise<PlanEditResponse | null>;

	// Lock management for conflict resolution
	acquireEditLock(planId: string, scope: 'project' | 'global'): Promise<{ success: boolean; error?: string }>;
	releaseEditLock(planId: string, scope: 'project' | 'global'): Promise<void>;
	isEditLocked(planId: string, scope: 'project' | 'global'): Promise<{ locked: boolean; lockedAt?: string; expiresAt?: string }>;
}





