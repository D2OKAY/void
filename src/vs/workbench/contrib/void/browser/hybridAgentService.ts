import { Disposable } from '../../../../base/common/lifecycle.js';
import { IHybridAgentService, ExecuteAgentCallback } from '../common/hybridAgentServiceTypes.js';
import { HybridPlan, HybridPlanStep, CoderResponse } from '../common/hybridAgentTypes.js';
import { ILLMMessageService } from '../common/sendLLMMessageService.js';
import { IVoidSettingsService } from '../common/voidSettingsService.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { hybrid_plannerDecision_systemMessage, hybrid_createPlan_systemMessage, hybrid_enhanceStep_systemMessage, hybrid_coder_systemMessage } from '../common/prompt/prompts.js';
import { registerSingleton, InstantiationType } from '../../../../platform/instantiation/common/extensions.js';

export class HybridAgentService extends Disposable implements IHybridAgentService {
	readonly _serviceBrand: undefined;

	constructor(
		@ILLMMessageService private readonly llmMessageService: ILLMMessageService,
		@IVoidSettingsService private readonly voidSettingsService: IVoidSettingsService,
	) {
		super();
	}

	async decidePlanningNeeded(userTask: string): Promise<{ needsPlan: boolean, reasoning: string }> {
		const plannerModel = this.voidSettingsService.state.globalSettings.hybridPlannerModel;
		if (!plannerModel) {
			throw new Error('No planner model configured for Hybrid Agent mode');
		}

		const overridesOfModel = this.voidSettingsService.state.overridesOfModel;

		return new Promise((resolve, reject) => {
			let fullResponse = '';

			this.llmMessageService.sendLLMMessage({
				messagesType: 'chatMessages',
				logging: { loggingName: 'Hybrid Agent - Planning Decision' },
				messages: [
					{ role: 'system', content: hybrid_plannerDecision_systemMessage },
					{ role: 'user', content: `Task: ${userTask}` }
				],
				modelSelection: plannerModel,
				modelSelectionOptions: undefined,
				overridesOfModel,
				separateSystemMessage: undefined,
				chatMode: null,
				onText: ({ fullText }) => {
					fullResponse = fullText;
				},
				onFinalMessage: () => {
					try {
						const parsed = JSON.parse(fullResponse);
						resolve({
							needsPlan: parsed.needsPlan,
							reasoning: parsed.reasoning
						});
					} catch (e) {
						reject(new Error(`Failed to parse planning decision: ${fullResponse}`));
					}
				},
				onError: ({ message }) => {
					reject(new Error(`Planner error: ${message}`));
				},
				onAbort: () => {
					reject(new Error('Planning decision aborted'));
				}
			});
		});
	}

	async createPlan(userTask: string, context: string): Promise<HybridPlan> {
		const plannerModel = this.voidSettingsService.state.globalSettings.hybridPlannerModel;
		if (!plannerModel) {
			throw new Error('No planner model configured for Hybrid Agent mode');
		}

		const overridesOfModel = this.voidSettingsService.state.overridesOfModel;

		return new Promise((resolve, reject) => {
			let fullResponse = '';

			this.llmMessageService.sendLLMMessage({
				messagesType: 'chatMessages',
				logging: { loggingName: 'Hybrid Agent - Create Plan' },
				messages: [
					{ role: 'system', content: hybrid_createPlan_systemMessage(context) },
					{ role: 'user', content: `Task: ${userTask}` }
				],
				modelSelection: plannerModel,
				modelSelectionOptions: undefined,
				overridesOfModel,
				separateSystemMessage: undefined,
				chatMode: null,
				onText: ({ fullText }) => {
					fullResponse = fullText;
				},
				onFinalMessage: () => {
					try {
						const parsed = JSON.parse(fullResponse);
						const plan: HybridPlan = {
							planId: generateUuid(),
							title: parsed.title,
							summary: parsed.summary,
							createdAt: new Date().toISOString(),
							createdBy: plannerModel.modelName,
							steps: parsed.steps,
							isTemplate: false
						};
						resolve(plan);
					} catch (e) {
						reject(new Error(`Failed to parse plan: ${fullResponse}`));
					}
				},
				onError: ({ message }) => {
					reject(new Error(`Planner error: ${message}`));
				},
				onAbort: () => {
					reject(new Error('Plan creation aborted'));
				}
			});
		});
	}

	async enhanceStepInstructions(step: HybridPlanStep, error: string, badCode?: string): Promise<string> {
		const plannerModel = this.voidSettingsService.state.globalSettings.hybridPlannerModel;
		if (!plannerModel) {
			throw new Error('No planner model configured for Hybrid Agent mode');
		}

		const overridesOfModel = this.voidSettingsService.state.overridesOfModel;

		return new Promise((resolve, reject) => {
			let fullResponse = '';

			this.llmMessageService.sendLLMMessage({
				messagesType: 'chatMessages',
				logging: { loggingName: 'Hybrid Agent - Enhance Instructions' },
				messages: [
					{ role: 'system', content: hybrid_enhanceStep_systemMessage(step, error, badCode) },
					{ role: 'user', content: 'Provide enhanced instructions for the coder.' }
				],
				modelSelection: plannerModel,
				modelSelectionOptions: undefined,
				overridesOfModel,
				separateSystemMessage: undefined,
				chatMode: null,
				onText: ({ fullText }) => {
					fullResponse = fullText;
				},
				onFinalMessage: () => {
					resolve(fullResponse);
				},
				onError: ({ message }) => {
					reject(new Error(`Planner error: ${message}`));
				},
				onAbort: () => {
					reject(new Error('Instruction enhancement aborted'));
				}
			});
		});
	}

	async executeStep(step: HybridPlanStep, planContext: string, executeCallback: ExecuteAgentCallback, retryContext?: string): Promise<CoderResponse> {
		const coderModel = this.voidSettingsService.state.globalSettings.hybridCoderModel;
		if (!coderModel) {
			throw new Error('No coder model configured for Hybrid Agent mode');
		}

		const coderModelOptions = coderModel ? this.voidSettingsService.state.optionsOfModelSelection['Chat']?.[coderModel.providerName]?.[coderModel.modelName] : undefined;

		// Prepare the instruction message combining system prompt and user task
		const instructionMessage = `${hybrid_coder_systemMessage(step, planContext, retryContext)}\n\nExecute step: ${step.description}`;

		try {
			// Execute via callback (chatThreadService will handle thread creation and agent execution)
			return await executeCallback({
				instructionMessage,
				modelSelection: coderModel,
				modelSelectionOptions: coderModelOptions
			});
		} catch (error) {
			return {
				success: false,
				error: error instanceof Error ? error.message : 'Unknown error during step execution'
			};
		}
	}

	async plannerTakeover(step: HybridPlanStep, coderError: string, executeCallback: ExecuteAgentCallback): Promise<CoderResponse> {
		const plannerModel = this.voidSettingsService.state.globalSettings.hybridPlannerModel;
		if (!plannerModel) {
			throw new Error('No planner model configured for Hybrid Agent mode');
		}

		const plannerModelOptions = plannerModel ? this.voidSettingsService.state.optionsOfModelSelection['Chat']?.[plannerModel.providerName]?.[plannerModel.modelName] : undefined;

		const instructionMessage = `You are taking over execution of a step that the coder AI failed to complete.

Step: ${step.description}
Coder's error: ${coderError}

Execute this step directly using the available tools. Be thorough and handle edge cases.

Execute the step.`;

		try {
			// Execute via callback with planner model
			return await executeCallback({
				instructionMessage,
				modelSelection: plannerModel,
				modelSelectionOptions: plannerModelOptions
			});
		} catch (error) {
			throw new Error(`Planner takeover failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
		}
	}
}

registerSingleton(IHybridAgentService, HybridAgentService, InstantiationType.Delayed);

