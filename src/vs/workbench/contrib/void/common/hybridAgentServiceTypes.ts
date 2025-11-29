import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { HybridPlan, HybridPlanStep, CoderResponse } from './hybridAgentTypes.js';
import { ModelSelection, ModelSelectionOptions } from './voidSettingsTypes.js';

export type ExecuteAgentCallback = (params: {
	instructionMessage: string;
	modelSelection: ModelSelection;
	modelSelectionOptions: ModelSelectionOptions | undefined;
}) => Promise<CoderResponse>;

export const IHybridAgentService = createDecorator<IHybridAgentService>('hybridAgentService');

export interface IHybridAgentService {
	readonly _serviceBrand: undefined;

	// Planner interactions
	decidePlanningNeeded(userTask: string): Promise<{ needsPlan: boolean, reasoning: string }>;
	createPlan(userTask: string, context: string): Promise<HybridPlan>;
	enhanceStepInstructions(step: HybridPlanStep, error: string, badCode?: string): Promise<string>;

	// Coder interactions
	executeStep(step: HybridPlanStep, planContext: string, executeCallback: ExecuteAgentCallback, retryContext?: string): Promise<CoderResponse>;

	// Fallback handling
	plannerTakeover(step: HybridPlanStep, coderError: string, executeCallback: ExecuteAgentCallback): Promise<CoderResponse>;
}


