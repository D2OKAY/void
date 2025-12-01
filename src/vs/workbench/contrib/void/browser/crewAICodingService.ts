/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { ICrewAICodingService } from '../common/crewAICodingServiceTypes.js';
import { ChatContext, CodingPlan, CodingResult, CodingStep, CodingStepOutput, CodingAgentType } from '../common/crewAIAgentTypes.js';
import { IVoidSettingsService } from '../common/voidSettingsService.js';
// import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js'; // TODO: Will be needed for future features
// import { IDirectoryStrService } from '../common/directoryStrService.js'; // TODO: Will be needed for future features
// import { IToolsService } from './toolsService.js'; // TODO: Will be needed for guardrails
import { registerSingleton, InstantiationType } from '../../../../platform/instantiation/common/extensions.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { getAgentProfile } from '../common/crewAIAgentProfiles.js';
import { BuiltinToolName, ToolName } from '../common/toolsServiceTypes.js';
import { ToolMessage } from '../common/chatThreadServiceTypes.js';
import { URI } from '../../../../base/common/uri.js';
import { ModelSelection, ModelSelectionOptions } from '../common/voidSettingsTypes.js';

/**
 * Type for the agent executor function passed by chatThreadService
 * This breaks the cyclic dependency by using dependency inversion
 */
export type AgentExecutor = (params: {
	threadId: string;
	initialMessage: string;
	systemMessageOverride?: string;
	modelSelection: ModelSelection;
	modelSelectionOptions?: ModelSelectionOptions;
	forceAgentMode: boolean;
}) => Promise<void>;

/**
 * Type for extracting messages from a thread
 */
export type ThreadMessageExtractor = (threadId: string) => any[];

/**
 * Type for cleaning up a thread
 */
export type ThreadCleanup = (threadId: string) => void;

/**
 * CrewAI-inspired coding service
 * Implements multi-agent orchestration for coding tasks in TypeScript
 *
 * Architecture mapping to CrewAI:
 * - This class ≈ CrewAI's Crew orchestrator
 * - executeCodingTask() ≈ Crew.kickoff()
 * - buildPlan() ≈ CrewPlanner
 * - executeStep() ≈ Agent.execute_task()
 * - _getStepContext() ≈ Crew._get_context()
 */
export class CrewAICodingService extends Disposable implements ICrewAICodingService {
	readonly _serviceBrand: undefined;

	constructor(
		// @IToolsService private readonly _toolsService: IToolsService, // TODO: Will be needed for guardrails (Section 6)
		@IVoidSettingsService private readonly voidSettingsService: IVoidSettingsService,
		// @IWorkspaceContextService private readonly _workspaceContextService: IWorkspaceContextService, // TODO: Needed for future features
		// @IDirectoryStrService private readonly _directoryStrService: IDirectoryStrService, // TODO: Needed for future features
	) {
		super();
	}

	/**
	 * Execute a coding task using multi-agent orchestration
	 * Following CrewAI's Crew.kickoff() pattern (crew.py:1029-1115)
	 */
	async executeCodingTask(
		userTask: string,
		context: ChatContext,
		executeAgentTask: AgentExecutor,
		getThreadMessages: ThreadMessageExtractor,
		cleanupThread: (threadId: string) => void,
		onProgress?: (event: any) => void
	): Promise<CodingResult> {
		const startTime = Date.now();
		const allStepOutputs: CodingStepOutput[] = [];
		const changedFiles: Set<string> = new Set();
		let totalTokenUsage = 0;

		try {
			// Step 1: Analyze task and build plan
			// Similar to CrewAI's decidePlanningNeeded + createPlan
			const plan = await this.buildPlan(userTask, context);

			// Notify plan created
			onProgress?.({ type: 'plan_created', plan, totalSteps: plan.steps.length });

			// Step 2: Execute plan steps sequentially (or in parallel where safe)
			// Following CrewAI's Crew._execute_tasks pattern (crew.py:1029-1115)
			for (let i = 0; i < plan.steps.length; i++) {
				const step = plan.steps[i];

				// Notify step started
				onProgress?.({ type: 'step_started', step, stepIndex: i, totalSteps: plan.steps.length });

				// Get context from previous steps
				// Following CrewAI's Crew._get_context pattern (crew.py:1305-1313)
				const stepContext = this._getStepContext(step, allStepOutputs);

				try {
					// Execute the step
					const stepOutput = await this.executeStep(step, stepContext, context, executeAgentTask, getThreadMessages, cleanupThread);

					allStepOutputs.push(stepOutput);

					// Track changed files
					stepOutput.filesWritten.forEach(uri => changedFiles.add(uri.toString()));

					// Accumulate token usage
					if (stepOutput.tokenUsage) {
						totalTokenUsage += stepOutput.tokenUsage;
					}

					// Notify step completed
					if (stepOutput.warnings.length === 0) {
						onProgress?.({ type: 'step_completed', step, stepIndex: i, totalSteps: plan.steps.length, stepOutput });
					} else {
						onProgress?.({ type: 'step_failed', step, stepIndex: i, totalSteps: plan.steps.length, stepOutput });
					}
				} catch (stepError) {
					// Handle step failure
					const errorMessage = stepError instanceof Error ? stepError.message : String(stepError);
					const failedOutput: CodingStepOutput = {
						stepId: step.id,
						summary: `Step failed: ${errorMessage}`,
						detailedText: errorMessage,
						toolsUsed: [],
						filesRead: [],
						filesWritten: [],
						lintErrors: [],
						warnings: [errorMessage],
						tokenUsage: undefined,
						durationMs: 0
					};
					allStepOutputs.push(failedOutput);
					onProgress?.({ type: 'step_failed', step, stepIndex: i, totalSteps: plan.steps.length, stepOutput: failedOutput });
				}
			}

			// Step 3: Synthesize final result
			const totalDurationMs = Date.now() - startTime;
			const finalSummary = this._synthesizeResult(allStepOutputs, plan);

			return {
				success: true,
				finalSummary,
				allStepOutputs,
				changedFiles: Array.from(changedFiles).map(uri => URI.parse(uri)),
				suggestedNextActions: this._generateNextActions(plan, allStepOutputs),
				totalTokenUsage,
				totalDurationMs
			};

		} catch (error) {
			const totalDurationMs = Date.now() - startTime;
			const errorMessage = error instanceof Error ? error.message : String(error);

			return {
				success: false,
				finalSummary: `Execution failed: ${errorMessage}`,
				allStepOutputs,
				changedFiles: Array.from(changedFiles).map(uri => URI.parse(uri)),
				suggestedNextActions: ['Review the error', 'Try simplifying the task', 'Check agent logs'],
				totalTokenUsage,
				totalDurationMs,
				errors: [errorMessage]
			};
		}
	}

	/**
	 * Build a plan for executing a coding task
	 * Similar to CrewAI's CrewPlanner
	 */
	async buildPlan(userTask: string, context: ChatContext): Promise<CodingPlan> {
		// For now, implement simple heuristic-based planning
		// TODO: In future, use LLM to generate more sophisticated plans

		const taskLower = userTask.toLowerCase();
		const steps: CodingStep[] = [];

		// Determine complexity based on task content
		const isComplex =
			taskLower.includes('refactor') ||
			taskLower.includes('implement') ||
			taskLower.includes('add feature') ||
			taskLower.includes('create') ||
			taskLower.length > 100;

		const complexity: 'simple' | 'complex' = isComplex ? 'complex' : 'simple';

		// Build steps based on task type
		if (taskLower.includes('explain') || taskLower.includes('what') || taskLower.includes('how')) {
			// Explanation task: researcher + documenter
			steps.push({
				id: generateUuid(),
				description: `Analyze the codebase to understand: ${userTask}`,
				agent: 'researcher',
				contextStepIds: [],
				expectedOutput: 'Detailed analysis of the relevant code and its functionality',
				canRunInParallel: false,
				requiresHumanApproval: false
			});

			steps.push({
				id: generateUuid(),
				description: `Create a clear explanation based on the research`,
				agent: 'documenter',
				contextStepIds: [steps[0].id],
				expectedOutput: 'Clear, comprehensive explanation with examples',
				canRunInParallel: false,
				requiresHumanApproval: false
			});

		} else if (taskLower.includes('test') || taskLower.includes('spec')) {
			// Testing task: researcher + tester
			steps.push({
				id: generateUuid(),
				description: `Analyze the code that needs testing: ${userTask}`,
				agent: 'researcher',
				contextStepIds: [],
				expectedOutput: 'Understanding of the code structure and edge cases',
				canRunInParallel: false,
				requiresHumanApproval: false
			});

			const testStepId = generateUuid();
			steps.push({
				id: testStepId,
				description: `Create comprehensive tests based on the analysis`,
				agent: 'tester',
				contextStepIds: [steps[0].id],
				expectedOutput: 'Complete test suite with edge cases covered',
				canRunInParallel: false,
				requiresHumanApproval: true // Requires approval for running commands
			});

		} else if (taskLower.includes('fix') || taskLower.includes('bug')) {
			// Bug fix task: researcher + developer + reviewer
			steps.push({
				id: generateUuid(),
				description: `Investigate the bug: ${userTask}`,
				agent: 'researcher',
				contextStepIds: [],
				expectedOutput: 'Root cause analysis and affected code locations',
				canRunInParallel: false,
				requiresHumanApproval: false
			});

			const devStepId = generateUuid();
			steps.push({
				id: devStepId,
				description: `Implement fix for the identified issue`,
				agent: 'developer',
				contextStepIds: [steps[0].id],
				expectedOutput: 'Code changes that fix the bug',
				canRunInParallel: false,
				requiresHumanApproval: true // Requires approval for edits
			});

			steps.push({
				id: generateUuid(),
				description: `Review the bug fix for correctness and potential issues`,
				agent: 'reviewer',
				contextStepIds: [devStepId],
				expectedOutput: 'Code review feedback and validation',
				canRunInParallel: false,
				requiresHumanApproval: false
			});

		} else {
			// General/complex task: researcher + developer + reviewer
			steps.push({
				id: generateUuid(),
				description: `Research and understand the task requirements: ${userTask}`,
				agent: 'researcher',
				contextStepIds: [],
				expectedOutput: 'Comprehensive understanding of requirements and affected code',
				canRunInParallel: false,
				requiresHumanApproval: false
			});

			const devStepId = generateUuid();
			steps.push({
				id: devStepId,
				description: `Implement the requested changes`,
				agent: 'developer',
				contextStepIds: [steps[0].id],
				expectedOutput: 'Implementation that fulfills the requirements',
				canRunInParallel: false,
				requiresHumanApproval: true
			});

			steps.push({
				id: generateUuid(),
				description: `Review the implementation for quality and correctness`,
				agent: 'reviewer',
				contextStepIds: [devStepId],
				expectedOutput: 'Code review with feedback and suggestions',
				canRunInParallel: false,
				requiresHumanApproval: false
			});
		}

		return {
			steps,
			originalTask: userTask,
			complexity,
			createdAt: Date.now(),
			estimatedImpact: this._estimateImpact(steps)
		};
	}

	/**
	 * Execute a single step in a plan
	 * Similar to CrewAI's Agent.execute_task() (agent/core.py:277-550)
	 *
	 * Following hybrid agent pattern (chatThreadService.ts:1020-1070):
	 * - Creates temporary thread for agent execution
	 * - Uses executeAgentTask which runs full agent loop with tool calling
	 * - Extracts result from temp thread messages
	 * - Cleans up temp thread after execution
	 */
	async executeStep(
		step: CodingStep,
		context: string,
		workspaceContext: ChatContext,
		executeAgentTask: AgentExecutor,
		getThreadMessages: ThreadMessageExtractor,
		cleanupThread: (threadId: string) => void
	): Promise<CodingStepOutput> {
		const startTime = Date.now();
		const agentProfile = getAgentProfile(step.agent);

		// Use user's selected Chat model instead of hardcoded model
		const modelSelection = this.voidSettingsService.state.modelSelectionOfFeature['Chat'];
		const modelSelectionOptions = modelSelection
			? this.voidSettingsService.state.optionsOfModelSelection['Chat']?.[modelSelection.providerName]?.[modelSelection.modelName]
			: undefined;

		if (!modelSelection) {
			throw new Error('No Chat model configured. Please select a model in settings.');
		}

		// Build agent system message with role/goal/backstory
		// Similar to how CrewAI builds agent prompts
		const systemMessage = this._buildAgentSystemMessage(agentProfile, step, workspaceContext);

		// Build user message with context and task
		const userMessage = this._buildUserMessage(step, context);

		// Create temporary thread for agent execution (following hybrid pattern at line 1022)
		const tempThreadId = generateUuid();

		try {
			console.log(`[CrewAI] Executing step ${step.id} with agent ${step.agent} in temp thread ${tempThreadId}`);

			// Execute agent task using the provided executor function
			// This function is provided by chatThreadService and handles:
			// - Thread creation and initialization
			// - Full agent loop with tool calling
			// - Tool execution and response handling
			await executeAgentTask({
				threadId: tempThreadId,
				initialMessage: userMessage,
				systemMessageOverride: systemMessage,
				modelSelection: modelSelection,
				modelSelectionOptions: modelSelectionOptions,
				forceAgentMode: true
			});

			// Extract result from temp thread messages using the provided extractor function
			const threadMessages = getThreadMessages(tempThreadId);

			// Find the last assistant message which contains the agent's response
			const assistantMessages = threadMessages.filter((msg: any) => msg.role === 'assistant');
			const finalMessage = assistantMessages[assistantMessages.length - 1];

			if (!finalMessage || !finalMessage.displayContent) {
				throw new Error(`Agent ${step.agent} completed but produced no output`);
			}

			const finalDetailedText = finalMessage.displayContent;

			// Extract tools used from thread messages
			const toolMessages = threadMessages.filter((msg: any) => msg.role === 'tool' || msg.role === 'tool_response');
			const toolsUsed = Array.from(new Set(toolMessages.map((msg: any) => msg.name).filter(Boolean)));

			// Extract tool messages for display (completed states only)
			const toolMessagesToDisplay = threadMessages.filter((msg: any) =>
				msg.role === 'tool' &&
				(msg.type === 'success' || msg.type === 'tool_error' || msg.type === 'rejected')
			) as Array<ToolMessage<ToolName>>;

			// Extract reasoning from the final assistant message
			const reasoning = finalMessage.reasoning || '';

			const durationMs = Date.now() - startTime;

			console.log(`[CrewAI] Step ${step.id} completed:`, {
				agent: step.agent,
				responseLength: finalDetailedText.length,
				responsePreview: finalDetailedText.substring(0, 200),
				toolsUsed
			});

			// Extract summary (first paragraph or up to 200 chars)
			const summaryMatch = finalDetailedText.match(/^(.+?)(\n\n|$)/);
			const summary = summaryMatch ? summaryMatch[1].substring(0, 200) : finalDetailedText.substring(0, 200);

			return {
				stepId: step.id,
				summary,
				detailedText: finalDetailedText,
				toolsUsed: toolsUsed as BuiltinToolName[],
				filesRead: [], // TODO: Extract from tool messages
				filesWritten: [], // TODO: Extract from tool messages
				lintErrors: [],
				warnings: [],
				tokenUsage: undefined, // TODO: Extract from LLM response if available
				durationMs,
				reasoning: reasoning,
				toolMessages: toolMessagesToDisplay
			};

		} catch (error) {
			const durationMs = Date.now() - startTime;
			const errorMessage = error instanceof Error ? error.message : String(error);

			console.error(`[CrewAI] Step ${step.id} failed:`, errorMessage);

			return {
				stepId: step.id,
				summary: `Step failed: ${errorMessage}`,
				detailedText: `Error during execution:\n${errorMessage}`,
				toolsUsed: [],
				filesRead: [],
				filesWritten: [],
				lintErrors: [],
				warnings: [errorMessage],
				tokenUsage: undefined,
				durationMs
			};
		} finally {
			// Clean up temp thread after extracting messages
			try {
				cleanupThread(tempThreadId);
				console.log(`[CrewAI] Cleaned up temp thread ${tempThreadId}`);
			} catch (cleanupError) {
				console.warn(`[CrewAI] Failed to clean up temp thread ${tempThreadId}:`, cleanupError);
			}
		}
	}

	/**
	 * Get context for a step from previous step outputs
	 * Following CrewAI's Crew._get_context pattern (crew.py:1305-1313)
	 */
	private _getStepContext(step: CodingStep, previousOutputs: CodingStepOutput[]): string {
		if (step.contextStepIds.length === 0) {
			return '';
		}

		// Filter outputs by contextStepIds
		const relevantOutputs = previousOutputs.filter(output =>
			step.contextStepIds.includes(output.stepId)
		);

		// Aggregate raw outputs (similar to CrewAI's aggregate_raw_outputs_from_task_outputs)
		const contextParts = relevantOutputs.map(output =>
			`=== Output from previous step ===\n${output.detailedText}\n`
		);

		return contextParts.join('\n');
	}

	/**
	 * Build agent system message with role/goal/backstory
	 */
	private _buildAgentSystemMessage(agentProfile: any, step: CodingStep, context: ChatContext): string {
		let systemMessage = `You are a ${agentProfile.role}.

YOUR ROLE: ${agentProfile.role}
YOUR GOAL: ${agentProfile.goal}
YOUR BACKSTORY: ${agentProfile.backstory}

AVAILABLE TOOLS:
${agentProfile.tools.map((tool: string) => `- ${tool}`).join('\n')}

WORKSPACE CONTEXT:`;

		if (context.workspaceRoot) {
			systemMessage += `\nWorkspace: ${context.workspaceRoot.fsPath}`;
		}

		if (context.projectStructure) {
			systemMessage += `\n\nProject Structure:\n${context.projectStructure}`;
		}

		if (context.openFile) {
			systemMessage += `\nCurrently open file: ${context.openFile.fsPath}`;
		}

		if (context.stagingSelections && context.stagingSelections.length > 0) {
			systemMessage += `\n\nUser-selected files:`;
			context.stagingSelections.forEach(sel => {
				systemMessage += `\n- ${sel.uri.fsPath}`;
			});
		}

		systemMessage += `\n\nYour task is to: ${step.description}
Expected output: ${step.expectedOutput}

After using any tools to gather information, you MUST respond with a written explanation.
Do not stop after executing tools - you must provide your findings as text.`;

		return systemMessage;
	}

	/**
	 * Build user message with context and task
	 */
	private _buildUserMessage(step: CodingStep, context: string): string {
		if (context) {
			return `Based on the context below, ${step.description}

${context}

You must provide: ${step.expectedOutput}

Write your response now.`;
		}

		return `${step.description}

You must provide: ${step.expectedOutput}

Write your response now.`;
	}

	/**
	 * Synthesize final result from all step outputs
	 */
	private _synthesizeResult(outputs: CodingStepOutput[], plan: CodingPlan): string {
		const successfulSteps = outputs.filter(o => o.warnings.length === 0);
		const failedSteps = outputs.filter(o => o.warnings.length > 0);

		let summary = `Completed ${successfulSteps.length}/${outputs.length} steps successfully.\n\n`;

		if (plan.complexity === 'complex') {
			summary += `Task: ${plan.originalTask}\n\n`;
		}

		summary += `Summary:\n`;
		outputs.forEach((output, idx) => {
			const stepNum = idx + 1;
			const agent = plan.steps[idx]?.agent || 'unknown';
			const emoji = this._getAgentEmoji(agent);
			const status = output.warnings.length > 0 ? '❌' : '✅';
			summary += `${stepNum}. ${emoji} ${agent}: ${status} ${output.summary}\n`;
		});

		if (failedSteps.length > 0) {
			summary += `\n⚠️ ${failedSteps.length} step(s) encountered issues. Review the details above.`;
		}

		return summary;
	}

	/**
	 * Generate suggested next actions based on plan and outputs
	 */
	private _generateNextActions(plan: CodingPlan, outputs: CodingStepOutput[]): string[] {
		const actions: string[] = [];

		const hasFailures = outputs.some(o => o.warnings.length > 0);
		const hasEdits = outputs.some(o => o.filesWritten.length > 0);
		const hasLintErrors = outputs.some(o => o.lintErrors.length > 0);

		if (hasFailures) {
			actions.push('Review failed steps and retry');
		}

		if (hasEdits && !hasLintErrors) {
			actions.push('Review the changes and test them');
		}

		if (hasLintErrors) {
			actions.push('Fix lint errors before proceeding');
		}

		if (plan.originalTask.toLowerCase().includes('implement') || plan.originalTask.toLowerCase().includes('add')) {
			actions.push('Consider adding tests for the new code');
		}

		if (outputs.length > 0 && !hasFailures) {
			actions.push('Task completed successfully');
		}

		return actions;
	}

	/**
	 * Estimate impact of a plan
	 */
	private _estimateImpact(steps: CodingStep[]): string {
		const hasWriteSteps = steps.some(s => s.agent === 'developer' || s.agent === 'tester');
		const stepCount = steps.length;

		if (hasWriteSteps && stepCount >= 3) {
			return 'High - Multiple files may be modified';
		} else if (hasWriteSteps) {
			return 'Medium - Some files may be modified';
		} else {
			return 'Low - Read-only analysis';
		}
	}

	/**
	 * Get emoji for agent type
	 */
	private _getAgentEmoji(agent: CodingAgentType): string {
		const emojis: Record<CodingAgentType, string> = {
			researcher: '🔍',
			developer: '💻',
			reviewer: '✅',
			tester: '🧪',
			documenter: '📝'
		};
		return emojis[agent] || '🤖';
	}
}

// Register the singleton service
registerSingleton(ICrewAICodingService, CrewAICodingService, InstantiationType.Delayed);
