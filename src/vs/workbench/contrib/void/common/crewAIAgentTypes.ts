/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import { URI } from '../../../../base/common/uri.js';
import { Range } from '../../../../editor/common/core/range.js';
import { BuiltinToolName, LintErrorItem, ToolApprovalType, ToolName } from './toolsServiceTypes.js';
import { ModelSelection } from './voidSettingsTypes.js';
import { StagingSelectionItem, ToolMessage } from './chatThreadServiceTypes.js';

/**
 * Type of coding agent in the CrewAI system
 * Each agent has specialized capabilities for different coding tasks
 */
export type CodingAgentType = 'researcher' | 'developer' | 'reviewer' | 'tester' | 'documenter';

/**
 * Profile defining an agent's capabilities and configuration
 * Maps to CrewAI's Agent class (role, goal, backstory, tools, llm)
 */
export type CodingAgentProfile = {
	role: string;
	goal: string;
	backstory: string;
	tools: BuiltinToolName[];
	defaultModel: ModelSelection;
	approvalType?: ToolApprovalType;
};

/**
 * A single step in a coding plan
 * Maps to CrewAI's Task class (description, expected_output, agent, context, tools)
 */
export type CodingStep = {
	id: string;
	description: string;
	agent: CodingAgentType;
	contextStepIds: string[];  // IDs of previous steps whose outputs should be included in context
	expectedOutput: string;
	canRunInParallel: boolean;
	requiresHumanApproval: boolean;
};

/**
 * A complete plan for executing a coding task
 * Maps to CrewAI's Crew + plan (tasks collection, process flow)
 */
export type CodingPlan = {
	steps: CodingStep[];
	originalTask: string;
	complexity: 'simple' | 'complex';
	createdAt: number;
	estimatedImpact: string;
};

/**
 * Output from a single step execution
 * Maps to CrewAI's TaskOutput (raw, pydantic, json_dict, agent, metrics)
 */
export type CodingStepOutput = {
	stepId: string;
	summary: string;
	detailedText: string;
	toolsUsed: BuiltinToolName[];
	filesRead: URI[];
	filesWritten: URI[];
	lintErrors: LintErrorItem[];
	warnings: string[];
	tokenUsage: number | undefined;
	durationMs: number;
	reasoning?: string; // Reasoning from assistant messages in temp thread
	toolMessages?: Array<ToolMessage<ToolName>>; // Tool messages to display in main chat
};

/**
 * Final result from crew execution
 * Maps to CrewAI's CrewOutput (raw, tasks_output, token_usage)
 */
export type CodingResult = {
	success: boolean;
	finalSummary: string;
	allStepOutputs: CodingStepOutput[];
	changedFiles: URI[];
	suggestedNextActions: string[];
	totalTokenUsage: number;
	totalDurationMs: number;
	errors?: string[];
};

/**
 * Context information for executing a coding task
 * Provides workspace and selection context to agents
 */
export type ChatContext = {
	workspaceRoot: URI | undefined;
	openFile: URI | undefined;
	selection: Range | undefined;
	stagingSelections: StagingSelectionItem[];
	projectStructure: string;
};
