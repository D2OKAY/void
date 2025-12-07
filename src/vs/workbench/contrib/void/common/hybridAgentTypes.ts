export type HybridPlanStep = {
	stepId: string
	description: string
	toolsToUse: string[]
	expectedFiles: string[]
	riskLevel: 'safe' | 'moderate' | 'risky'
	dependencies: string[]
}

export type HybridPlan = {
	planId: string
	title: string
	summary: string
	createdAt: string
	createdBy: string
	planType: 'hybrid-execution' | 'plan-mode' | 'user-saved'
	steps: HybridPlanStep[]
	isTemplate: boolean
	projectPath?: string
	conversationId?: string
	tags?: string[]
	// Edit mode fields
	editSessions?: string[] // Array of sessionIds
	lastEditedAt?: string
	version?: number // Schema version for migration
}

// Edit session for plan editing history
export type PlanEditSession = {
	sessionId: string
	planId: string
	timestamp: string
	messages: PlanEditMessage[]
	changesSummary: string // What was changed
	scope: 'project' | 'global'
}

export type PlanEditMessage = {
	role: 'user' | 'assistant'
	content: string
	timestamp: string
	toolCalls?: PlanEditToolCall[]
}

export type PlanEditToolCall = {
	toolName: string
	parameters: Record<string, unknown>
	result?: { success: boolean; message?: string; error?: string }
}

export type HybridExecutionState = {
	planId: string
	currentStepIndex: number
	completedSteps: string[]
	failedSteps: { stepId: string, error: string, retryCount: number }[]
	status: 'planning' | 'reviewing' | 'executing' | 'paused' | 'completed' | 'failed'
}

export type CoderResponse = {
	success: boolean
	output?: string // Full text response from the Coder
	conversationMessages?: Array<{ role: 'assistant' | 'tool', content: string, toolName?: string }> // All messages from execution
	error?: string
	needsClarification?: boolean
	clarificationRequest?: string
}


