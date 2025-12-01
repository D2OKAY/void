/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { ChatContext, CodingPlan, CodingResult, CodingStep, CodingStepOutput } from './crewAIAgentTypes.js';

export const ICrewAICodingService = createDecorator<ICrewAICodingService>('crewAICodingService');

/**
 * Progress callback for CrewAI execution
 */
export type CrewAIProgressCallback = (event: {
	type: 'plan_created' | 'step_started' | 'step_completed' | 'step_failed';
	plan?: CodingPlan;
	step?: CodingStep;
	stepIndex?: number;
	totalSteps?: number;
	stepOutput?: CodingStepOutput;
}) => void;

/**
 * Service for executing coding tasks using CrewAI-inspired multi-agent patterns
 *
 * This service implements CrewAI's core patterns in TypeScript:
 * - executeCodingTask() ≈ Crew.kickoff() (entry point)
 * - buildPlan() ≈ CrewPlanner (task planning)
 * - executeStep() ≈ Agent.execute_task() (agent execution)
 */
export interface ICrewAICodingService {
	readonly _serviceBrand: undefined;

	/**
	 * Execute a coding task using multi-agent orchestration
	 * Similar to CrewAI's Crew.kickoff() method
	 *
	 * @param userTask The coding task to execute
	 * @param context Workspace and selection context
	 * @param executeAgentTask Function to execute an agent task (provided by chatThreadService to avoid cyclic dependency)
	 * @param getThreadMessages Function to get messages from a thread (provided by chatThreadService)
	 * @param cleanupThread Function to clean up a thread after use (provided by chatThreadService)
	 * @param onProgress Optional callback for progress updates
	 * @returns Complete execution result with all step outputs
	 */
	executeCodingTask(
		userTask: string,
		context: ChatContext,
		executeAgentTask: (params: any) => Promise<void>,
		getThreadMessages: (threadId: string) => any[],
		cleanupThread: (threadId: string) => void,
		onProgress?: CrewAIProgressCallback
	): Promise<CodingResult>;

	/**
	 * Build a plan for executing a coding task
	 * Similar to CrewAI's CrewPlanner
	 *
	 * @param userTask The coding task to plan
	 * @param context Workspace and selection context
	 * @returns A plan with ordered steps assigned to agents
	 */
	buildPlan(userTask: string, context: ChatContext): Promise<CodingPlan>;

	/**
	 * Execute a single step in a plan
	 * Similar to CrewAI's Agent.execute_task()
	 *
	 * @param step The step to execute
	 * @param context Aggregated context from previous steps
	 * @param workspaceContext Workspace and selection context
	 * @param executeAgentTask Function to execute an agent task (provided by chatThreadService)
	 * @param getThreadMessages Function to get messages from a thread (provided by chatThreadService)
	 * @param cleanupThread Function to clean up a thread after use (provided by chatThreadService)
	 * @returns Output from the step execution
	 */
	executeStep(
		step: CodingStep,
		context: string,
		workspaceContext: ChatContext,
		executeAgentTask: (params: any) => Promise<void>,
		getThreadMessages: (threadId: string) => any[],
		cleanupThread: (threadId: string) => void
	): Promise<CodingStepOutput>;
}
