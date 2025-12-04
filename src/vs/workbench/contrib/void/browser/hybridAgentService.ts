import { Disposable } from '../../../../base/common/lifecycle.js';
import { IHybridAgentService, ExecuteAgentCallback } from '../common/hybridAgentServiceTypes.js';
import { HybridPlan, HybridPlanStep, CoderResponse } from '../common/hybridAgentTypes.js';
import { ILLMMessageService } from '../common/sendLLMMessageService.js';
import { IVoidSettingsService } from '../common/voidSettingsService.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { hybrid_plannerDecision_systemMessage, hybrid_createPlan_systemMessage, hybrid_enhanceStep_systemMessage, hybrid_coder_systemMessage } from '../common/prompt/prompts.js';
import { registerSingleton, InstantiationType } from '../../../../platform/instantiation/common/extensions.js';

/**
 * Extract JSON from LLM response that may be wrapped in markdown code fences or have extra text
 */
function extractJSON(response: string): string {
	// Remove markdown code fences (```json ... ``` or ``` ... ```)
	let cleaned = response.trim();

	// Match ```json or ``` at start
	const codeBlockStart = cleaned.match(/^```(?:json)?\s*/);
	if (codeBlockStart) {
		cleaned = cleaned.slice(codeBlockStart[0].length);
	}

	// Match ``` at end
	const codeBlockEnd = cleaned.match(/\s*```$/);
	if (codeBlockEnd) {
		cleaned = cleaned.slice(0, -codeBlockEnd[0].length);
	}

	// Trim any remaining whitespace
	cleaned = cleaned.trim();

	// Try to find JSON object if there's extra text
	// Use a more robust regex that handles nested objects
	const jsonMatch = cleaned.match(/\{(?:[^{}]|(?:\{(?:[^{}]|\{[^{}]*\})*\}))*\}/);
	if (jsonMatch) {
		// Validate it's actually valid JSON by attempting to parse
		try {
			JSON.parse(jsonMatch[0]);
			return jsonMatch[0];
		} catch (e) {
			// If parsing fails, try the original cleaned string
		}
	}

	// Last resort: if the cleaned string looks like JSON, return it
	if (cleaned.startsWith('{') && cleaned.endsWith('}')) {
		return cleaned;
	}

	// If nothing worked, return the cleaned string and let the caller handle the error
	return cleaned;
}

// Retry configuration for Planner LLM calls (matches Agent mode pattern)
const PLANNER_RETRIES = 3;
const PLANNER_RETRY_DELAY = 2500; // 2.5 seconds

// Helper: Retry LLM call with exponential backoff
async function retryLLMCall<T>(
	callFn: () => Promise<T>,
	retries: number = PLANNER_RETRIES,
	delay: number = PLANNER_RETRY_DELAY,
	attemptNum: number = 1
): Promise<T> {
	try {
		return await callFn();
	} catch (error) {
		if (attemptNum >= retries) {
			throw error; // Max retries reached
		}
		// Wait with exponential backoff
		const backoffDelay = delay * Math.pow(1.5, attemptNum - 1);
		await new Promise(resolve => setTimeout(resolve, backoffDelay));
		return retryLLMCall(callFn, retries, delay, attemptNum + 1);
	}
}

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

		// Wrap in retry logic for reliability with Grok and other sensitive models
		return retryLLMCall(() => new Promise((resolve, reject) => {
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
					const cleanedResponse = extractJSON(fullResponse);
					const parsed = JSON.parse(cleanedResponse);

					// Validate required fields
					if (typeof parsed.needsPlan !== 'boolean') {
						throw new Error('Missing or invalid "needsPlan" field');
					}

					resolve({
						needsPlan: parsed.needsPlan,
						reasoning: parsed.reasoning || 'No reasoning provided'
					});
				} catch (e) {
					const errorMsg = e instanceof Error ? e.message : 'Unknown error';
					reject(new Error(`Failed to parse planning decision (${errorMsg}). Response was: ${fullResponse.substring(0, 200)}...`));
				}
			},
				onError: ({ message }) => {
					reject(new Error(`Planner error: ${message}`));
				},
				onAbort: () => {
					reject(new Error('Planning decision aborted'));
				}
			});
		}));
	}

	async createPlan(userTask: string, context: string): Promise<HybridPlan> {
		const plannerModel = this.voidSettingsService.state.globalSettings.hybridPlannerModel;
		if (!plannerModel) {
			throw new Error('No planner model configured for Hybrid Agent mode');
		}

		const overridesOfModel = this.voidSettingsService.state.overridesOfModel;

		// Wrap in retry logic for reliability with Grok and other sensitive models
		return retryLLMCall(() => new Promise((resolve, reject) => {
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
					const cleanedResponse = extractJSON(fullResponse);
					const parsed = JSON.parse(cleanedResponse);

					// Validate required fields
					if (!parsed.title || !parsed.summary || !Array.isArray(parsed.steps)) {
						throw new Error('Missing required fields: title, summary, or steps');
					}

					const plan: HybridPlan = {
						planId: generateUuid(),
						title: parsed.title,
						summary: parsed.summary,
						createdAt: new Date().toISOString(),
						createdBy: plannerModel.modelName,
						planType: 'hybrid-execution',
						steps: parsed.steps,
						isTemplate: false
					};
					resolve(plan);
				} catch (e) {
					const errorMsg = e instanceof Error ? e.message : 'Unknown error';
					reject(new Error(`Failed to parse plan (${errorMsg}). Response was: ${fullResponse.substring(0, 300)}...`));
				}
			},
				onError: ({ message }) => {
					reject(new Error(`Planner error: ${message}`));
				},
				onAbort: () => {
					reject(new Error('Plan creation aborted'));
				}
			});
		}));
	}

	async enhanceStepInstructions(step: HybridPlanStep, error: string, badCode?: string): Promise<string> {
		const plannerModel = this.voidSettingsService.state.globalSettings.hybridPlannerModel;
		if (!plannerModel) {
			throw new Error('No planner model configured for Hybrid Agent mode');
		}

		const overridesOfModel = this.voidSettingsService.state.overridesOfModel;

		// Wrap in retry logic for reliability with Grok and other sensitive models
		return retryLLMCall(() => new Promise((resolve, reject) => {
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
		}));
	}

	async executeStep(
		step: HybridPlanStep,
		planContext: string,
		executeCallback: ExecuteAgentCallback,
		retryContext?: string,
		workspaceContext?: { folders: string[], activeFile?: string }
	): Promise<CoderResponse> {
		const coderModel = this.voidSettingsService.state.globalSettings.hybridCoderModel;
		if (!coderModel) {
			throw new Error('No coder model configured for Hybrid Agent mode');
		}

		const coderModelOptions = coderModel ? this.voidSettingsService.state.optionsOfModelSelection['Chat']?.[coderModel.providerName]?.[coderModel.modelName] : undefined;

		// Build workspace context string if provided
		const workspaceInfo = workspaceContext ? `\n\nWORKSPACE CONTEXT:
- Workspace folders: ${workspaceContext.folders.join(', ') || 'None'}
${workspaceContext.activeFile ? `- Active file: ${workspaceContext.activeFile}` : ''}` : '';

		// Separate system message (Hybrid Coder instructions) from user message (the task)
		// This prevents double-system-message issue and matches Agent mode's clean structure
		const systemMessageOverride = `${hybrid_coder_systemMessage(step, planContext, retryContext)}${workspaceInfo}`;

		// Make instruction more explicit to encourage output
		const instructionMessage = retryContext
			? `Execute step: ${step.description}\n\nIMPORTANT: After using tools to gather information, you MUST provide a summary of your findings. Do not finish without explaining what you discovered.`
			: `Execute step: ${step.description}\n\nRemember to summarize your findings after gathering information.`;

		try {
			// Execute via callback (chatThreadService will handle thread creation and agent execution)
			const result = await executeCallback({
				instructionMessage,
				systemMessageOverride,
				modelSelection: coderModel,
				modelSelectionOptions: coderModelOptions
			});

			// Additional validation: If execution succeeded but output is empty/minimal, add a note
			if (result.success && (!result.output || result.output.trim().length < 10)) {
				return {
					...result,
					output: result.output || 'Step completed but model provided minimal output. Check tool results for details.',
					clarificationRequest: 'Model produced minimal output. Please check if the step objective was achieved.'
				};
			}

			return result;
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

		// Use clean separation for Planner takeover as well
		const systemMessageOverride = `You are taking over execution of a step that the coder AI failed to complete.

Step: ${step.description}
Coder's error: ${coderError}

Execute this step directly using the available tools. Be thorough and handle edge cases.`;

		const instructionMessage = `Execute the step.`;

		try {
			// Execute via callback with planner model
			return await executeCallback({
				instructionMessage,
				systemMessageOverride,
				modelSelection: plannerModel,
				modelSelectionOptions: plannerModelOptions
			});
		} catch (error) {
			throw new Error(`Planner takeover failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
		}
	}
}

registerSingleton(IHybridAgentService, HybridAgentService, InstantiationType.Delayed);

