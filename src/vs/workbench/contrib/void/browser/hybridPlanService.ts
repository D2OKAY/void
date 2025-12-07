import { Disposable } from '../../../../base/common/lifecycle.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { URI } from '../../../../base/common/uri.js';
import { IHybridPlanService, PlanEditResponse } from '../common/hybridPlanServiceTypes.js';
import { HybridPlan, HybridExecutionState, PlanEditSession, PlanEditMessage, PlanEditToolCall } from '../common/hybridAgentTypes.js';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { registerSingleton, InstantiationType } from '../../../../platform/instantiation/common/extensions.js';
import { ILLMMessageService } from '../common/sendLLMMessageService.js';
import { IVoidSettingsService } from '../common/voidSettingsService.js';

export class HybridPlanService extends Disposable implements IHybridPlanService {
	readonly _serviceBrand: undefined;

	private static readonly GLOBAL_PLANS_KEY = 'void.hybridAgent.globalPlans';
	private static readonly EXECUTION_STATE_KEY_PREFIX = 'void.hybridAgent.executionState.';
	private static readonly GLOBAL_EDIT_SESSIONS_KEY = 'void.hybridAgent.globalEditSessions';
	private static readonly GLOBAL_SNAPSHOTS_KEY_PREFIX = 'void.hybridAgent.snapshot.';
	private static readonly LOCK_TIMEOUT_MS = 30 * 1000; // 30 seconds (short timeout for better UX)
	private static readonly GLOBAL_LOCKS_KEY_PREFIX = 'void.hybridAgent.lock.';

	// Track current session's locks to allow re-acquisition
	private readonly _currentSessionLocks = new Set<string>();

	constructor(
		@IFileService private readonly fileService: IFileService,
		@IStorageService private readonly storageService: IStorageService,
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService,
		@ILLMMessageService private readonly llmMessageService: ILLMMessageService,
		@IVoidSettingsService private readonly voidSettingsService: IVoidSettingsService,
	) {
		super();
	}

	async savePlan(plan: HybridPlan, scope: 'project' | 'global'): Promise<void> {
		if (scope === 'project') {
			await this._saveProjectPlan(plan);
		} else {
			await this._saveGlobalPlan(plan);
		}
	}

	async getPlan(planId: string, scope: 'project' | 'global'): Promise<HybridPlan | null> {
		if (scope === 'project') {
			return this._getProjectPlan(planId);
		} else {
			return this._getGlobalPlan(planId);
		}
	}

	async listPlans(scope: 'project' | 'global' | 'both'): Promise<HybridPlan[]> {
		const plans: HybridPlan[] = [];

		if (scope === 'project' || scope === 'both') {
			const projectPlans = await this._listProjectPlans();
			plans.push(...projectPlans);
		}

		if (scope === 'global' || scope === 'both') {
			const globalPlans = await this._listGlobalPlans();
			plans.push(...globalPlans);
		}

		return plans;
	}

	async deletePlan(planId: string, scope: 'project' | 'global' | 'both'): Promise<void> {
		// Try to delete from both locations to handle orphaned plans
		if (scope === 'project' || scope === 'both') {
			try {
				await this._deleteProjectPlan(planId);
			} catch (error) {
				// Plan might not exist in project scope, continue
				console.log('No project plan found for deletion:', planId);
			}
		}

		if (scope === 'global' || scope === 'both') {
			try {
				await this._deleteGlobalPlan(planId);
			} catch (error) {
				// Plan might not exist in global scope, continue
				console.log('No global plan found for deletion:', planId);
			}
		}
	}

	async saveExecutionState(state: HybridExecutionState): Promise<void> {
		const key = HybridPlanService.EXECUTION_STATE_KEY_PREFIX + state.planId;
		this.storageService.store(key, JSON.stringify(state), StorageScope.WORKSPACE, StorageTarget.MACHINE);
	}

	async getExecutionState(planId: string): Promise<HybridExecutionState | null> {
		const key = HybridPlanService.EXECUTION_STATE_KEY_PREFIX + planId;
		const stateStr = this.storageService.get(key, StorageScope.WORKSPACE);
		if (!stateStr) {
			return null;
		}
		try {
			return JSON.parse(stateStr);
		} catch {
			return null;
		}
	}

	async clearExecutionState(planId: string): Promise<void> {
		const key = HybridPlanService.EXECUTION_STATE_KEY_PREFIX + planId;
		this.storageService.remove(key, StorageScope.WORKSPACE);
	}

	// Plan mode specific methods
	async savePlanFromConversation(
		conversationId: string,
		title: string,
		content: string,
		scope: 'project' | 'global'
	): Promise<string> {
		const plan: HybridPlan = {
			planId: `plan-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
			title,
			summary: content,
			createdAt: new Date().toISOString(),
			createdBy: 'plan-mode',
			planType: 'plan-mode',
			steps: [],
			isTemplate: false,
			projectPath: this.workspaceContextService.getWorkspace().folders[0]?.uri.path,
			conversationId,
			tags: []
		};
		await this.savePlan(plan, scope);
		return plan.planId;
	}

	async archivePlan(planId: string, scope: 'project' | 'global'): Promise<void> {
		const plan = await this.getPlan(planId, scope);
		if (plan) {
			plan.tags = plan.tags || [];
			if (!plan.tags.includes('archived')) {
				plan.tags.push('archived');
			}
			await this.savePlan(plan, scope);
		}
	}

	async listPlansByType(planType: HybridPlan['planType'], scope: 'project' | 'global' | 'both'): Promise<HybridPlan[]> {
		const allPlans = await this.listPlans(scope);
		return allPlans.filter(p => (p.planType || 'hybrid-execution') === planType);
	}

	// Edit session management
	async saveEditSession(session: PlanEditSession, scope: 'project' | 'global'): Promise<void> {
		if (scope === 'project') {
			await this._saveProjectEditSession(session);
		} else {
			await this._saveGlobalEditSession(session);
		}
	}

	async getEditSessions(planId: string, scope: 'project' | 'global' | 'both'): Promise<PlanEditSession[]> {
		const sessions: PlanEditSession[] = [];

		if (scope === 'project' || scope === 'both') {
			const projectSessions = await this._listProjectEditSessions(planId);
			sessions.push(...projectSessions);
		}

		if (scope === 'global' || scope === 'both') {
			const globalSessions = await this._listGlobalEditSessions(planId);
			sessions.push(...globalSessions);
		}

		return sessions;
	}

	async deleteEditSession(sessionId: string, scope: 'project' | 'global'): Promise<void> {
		if (scope === 'project') {
			await this._deleteProjectEditSession(sessionId);
		} else {
			await this._deleteGlobalEditSession(sessionId);
		}
	}

	// Snapshot management for undo
	async savePlanSnapshot(planId: string, snapshot: HybridPlan, scope: 'project' | 'global'): Promise<void> {
		if (scope === 'project') {
			await this._saveProjectSnapshot(planId, snapshot);
		} else {
			await this._saveGlobalSnapshot(planId, snapshot);
		}
	}

	async getLastPlanSnapshot(planId: string, scope: 'project' | 'global'): Promise<HybridPlan | null> {
		if (scope === 'project') {
			return this._getProjectSnapshot(planId);
		} else {
			return this._getGlobalSnapshot(planId);
		}
	}

	// Plan edit message handling
	async sendPlanEditMessage(
		planId: string,
		message: string,
		history: PlanEditMessage[],
		scope: 'project' | 'global'
	): Promise<PlanEditResponse | null> {
		// Get the current plan
		const plan = await this.getPlan(planId, scope);
		if (!plan) {
			return null;
		}

		// Get the model to use (use Plan Edit model, fallback to Hybrid Planner)
		const modelSelection = this.voidSettingsService.state.globalSettings.planEditModel
			|| this.voidSettingsService.state.globalSettings.hybridPlannerModel;

		if (!modelSelection) {
			return {
				content: 'No AI model configured for plan editing. Please configure a Plan Edit model in Void Settings → Plan Edit section.',
				toolCalls: []
			};
		}

		// Build system prompt for plan editing
		const systemPrompt = this._buildPlanEditSystemPrompt(plan);
		const overridesOfModel = this.voidSettingsService.state.overridesOfModel;

		// Build message array with proper types for OpenAI format
		const chatMessages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
			{ role: 'system', content: systemPrompt },
			...history.map(m => ({
				role: m.role as 'user' | 'assistant',
				content: m.content
			})),
			{ role: 'user', content: message }
		];

		return new Promise((resolve, reject) => {
			let fullResponse = '';
			let toolCalls: PlanEditToolCall[] = [];
			let updatedPlan: HybridPlan | undefined;
			let updatedSection: string | undefined;

			this.llmMessageService.sendLLMMessage({
				messagesType: 'chatMessages',
				logging: { loggingName: 'Plan Edit - Message' },
				messages: chatMessages as any, // Type cast to handle LLMChatMessage union
				modelSelection,
				modelSelectionOptions: undefined,
				overridesOfModel,
				separateSystemMessage: undefined,
				chatMode: null,
				onText: ({ fullText }) => {
					fullResponse = fullText;
				},
				onFinalMessage: async ({ fullText }) => {
					fullResponse = fullText;

					// Try to parse tool calls from the response
					const toolCallResult = this._parseToolCallsFromResponse(fullText, plan);
					if (toolCallResult.hasToolCalls) {
						toolCalls = toolCallResult.toolCalls;

						// Execute the tool calls to update the plan
						if (toolCallResult.parsedUpdate) {
							try {
								const result = await this._executePlanUpdate(
									plan,
									toolCallResult.parsedUpdate,
									scope
								);
								updatedPlan = result.updatedPlan;
								updatedSection = result.section;

								// Add success result to tool calls
								toolCalls = toolCalls.map(tc => ({
									...tc,
									result: { success: true, message: `Updated ${result.section}` }
								}));
							} catch (error) {
								toolCalls = toolCalls.map(tc => ({
									...tc,
									result: { success: false, error: String(error) }
								}));
							}
						}
					}

					resolve({
						content: fullResponse,
						toolCalls,
						updatedPlan,
						updatedSection
					});
				},
				onError: ({ message: errorMessage }) => {
					resolve({
						content: `Error: ${errorMessage}. Please try again.`,
						toolCalls: []
					});
				},
				onAbort: () => {
					resolve({
						content: 'Request was cancelled.',
						toolCalls: []
					});
				}
			});
		});
	}

	// Parse tool calls from AI response
	private _parseToolCallsFromResponse(response: string, plan: HybridPlan): {
		hasToolCalls: boolean;
		toolCalls: PlanEditToolCall[];
		parsedUpdate?: {
			section: 'title' | 'summary' | 'steps' | 'tags' | 'full';
			newContent: string;
			operation: 'replace' | 'append' | 'prepend';
			reason: string;
		};
	} {
		// Look for update_plan_content tool call patterns in the response
		// The AI should output structured JSON for tool calls

		// Pattern 1: Look for JSON code block with tool call
		const jsonMatch = response.match(/```(?:json)?\s*\n?(\{[\s\S]*?"section"[\s\S]*?\})\s*\n?```/);
		if (jsonMatch) {
			try {
				const parsed = JSON.parse(jsonMatch[1]);
				if (parsed.section && parsed.newContent) {
					return {
						hasToolCalls: true,
						toolCalls: [{
							toolName: 'update_plan_content',
							parameters: parsed,
						}],
						parsedUpdate: {
							section: parsed.section,
							newContent: parsed.newContent,
							operation: parsed.operation || 'replace',
							reason: parsed.reason || 'Updated via AI'
						}
					};
				}
			} catch {
				// Not valid JSON, continue
			}
		}

		// Pattern 2: Look for inline update instructions
		// e.g., "I'll update the title to: New Title"
		const titleMatch = response.match(/(?:update|change|set)\s+(?:the\s+)?title\s+to[:\s]+["']?([^"'\n]+)["']?/i);
		if (titleMatch) {
			return {
				hasToolCalls: true,
				toolCalls: [{
					toolName: 'update_plan_content',
					parameters: { section: 'title', newContent: titleMatch[1].trim() },
				}],
				parsedUpdate: {
					section: 'title',
					newContent: titleMatch[1].trim(),
					operation: 'replace',
					reason: 'Title updated'
				}
			};
		}

		// Pattern 3: Look for "UPDATE:" marker (structured output from AI)
		const updateMatch = response.match(/UPDATE:\s*\n?```(?:json)?\s*\n?(\{[\s\S]*?\})\s*\n?```/);
		if (updateMatch) {
			try {
				const parsed = JSON.parse(updateMatch[1]);
				if (parsed.section && parsed.newContent) {
					return {
						hasToolCalls: true,
						toolCalls: [{
							toolName: 'update_plan_content',
							parameters: parsed,
						}],
						parsedUpdate: {
							section: parsed.section,
							newContent: parsed.newContent,
							operation: parsed.operation || 'replace',
							reason: parsed.reason || 'Updated via AI'
						}
					};
				}
			} catch {
				// Not valid JSON
			}
		}

		return { hasToolCalls: false, toolCalls: [] };
	}

	// Execute plan update
	private async _executePlanUpdate(
		plan: HybridPlan,
		update: {
			section: 'title' | 'summary' | 'steps' | 'tags' | 'full';
			newContent: string | any; // Can be string or already parsed object/array
			operation: 'replace' | 'append' | 'prepend';
			reason: string;
		},
		scope: 'project' | 'global'
	): Promise<{ updatedPlan: HybridPlan; section: string }> {
		// Create updated plan
		const updatedPlan = { ...plan, lastEditedAt: new Date().toISOString() };

		// Helper to parse content - handles both string JSON and already-parsed objects
		const parseContent = (content: any): any => {
			if (typeof content === 'string') {
				try {
					return JSON.parse(content);
				} catch {
					return content; // Return as-is if not valid JSON
				}
			}
			return content; // Already an object/array
		};

		switch (update.section) {
			case 'title':
				updatedPlan.title = typeof update.newContent === 'string'
					? update.newContent
					: String(update.newContent);
				break;
			case 'summary':
				const summaryContent = typeof update.newContent === 'string'
					? update.newContent
					: JSON.stringify(update.newContent, null, 2);
				if (update.operation === 'append') {
					updatedPlan.summary = (plan.summary || '') + '\n\n' + summaryContent;
				} else if (update.operation === 'prepend') {
					updatedPlan.summary = summaryContent + '\n\n' + (plan.summary || '');
				} else {
					updatedPlan.summary = summaryContent;
				}
				break;
			case 'steps':
				const parsedSteps = parseContent(update.newContent);
				if (Array.isArray(parsedSteps)) {
					// Normalize step format - AI might return {id, title, description} but we want {stepId, description, ...}
					const normalizedSteps = parsedSteps.map((s: any, idx: number) => {
						if (typeof s === 'string') {
							return {
								stepId: `step-${Date.now()}-${idx}`,
								description: s,
								toolsToUse: [],
								expectedFiles: [],
								riskLevel: 'safe' as const,
								dependencies: []
							};
						}
						// Keep original structure but ensure we have a stepId
						return {
							...s,
							stepId: s.stepId || s.id || `step-${Date.now()}-${idx}`,
							description: s.description || s.title || '',
							toolsToUse: s.toolsToUse || [],
							expectedFiles: s.expectedFiles || [],
							riskLevel: s.riskLevel || 'safe',
							dependencies: s.dependencies || []
						};
					});

					if (update.operation === 'append') {
						updatedPlan.steps = [...plan.steps, ...normalizedSteps];
					} else if (update.operation === 'prepend') {
						updatedPlan.steps = [...normalizedSteps, ...plan.steps];
					} else {
						updatedPlan.steps = normalizedSteps;
					}
				} else if (typeof parsedSteps === 'string') {
					// Single step as string
					const newStep = {
						stepId: `step-${Date.now()}`,
						description: parsedSteps,
						toolsToUse: [],
						expectedFiles: [],
						riskLevel: 'safe' as const,
						dependencies: []
					};
					if (update.operation === 'append') {
						updatedPlan.steps = [...plan.steps, newStep];
					} else if (update.operation === 'prepend') {
						updatedPlan.steps = [newStep, ...plan.steps];
					} else {
						updatedPlan.steps = [newStep];
					}
				}
				break;
			case 'tags':
				const parsedTags = parseContent(update.newContent);
				if (Array.isArray(parsedTags)) {
					const stringTags = parsedTags.map(t => typeof t === 'string' ? t : String(t));
					if (update.operation === 'append') {
						updatedPlan.tags = [...(plan.tags || []), ...stringTags];
					} else {
						updatedPlan.tags = stringTags;
					}
				} else if (typeof parsedTags === 'string') {
					// Split by comma
					const tags = parsedTags.split(',').map(t => t.trim()).filter(Boolean);
					if (update.operation === 'append') {
						updatedPlan.tags = [...(plan.tags || []), ...tags];
					} else {
						updatedPlan.tags = tags;
					}
				}
				break;
			case 'full':
				// Handle both string JSON and already-parsed objects
				let fullUpdate: any = null;
				if (typeof update.newContent === 'string') {
					try {
						fullUpdate = JSON.parse(update.newContent);
					} catch {
						// If not valid JSON string, treat as summary text
						updatedPlan.summary = update.newContent;
					}
				} else if (typeof update.newContent === 'object' && update.newContent !== null) {
					fullUpdate = update.newContent;
				}

				if (fullUpdate) {
					// Only allow updating safe fields
					if (fullUpdate.title && typeof fullUpdate.title === 'string') {
						updatedPlan.title = fullUpdate.title;
					}
					if (fullUpdate.summary && typeof fullUpdate.summary === 'string') {
						updatedPlan.summary = fullUpdate.summary;
					}
					if (fullUpdate.steps && Array.isArray(fullUpdate.steps)) {
						// Normalize steps format
						updatedPlan.steps = fullUpdate.steps.map((s: any, idx: number) => {
							if (typeof s === 'string') {
								return {
									stepId: `step-${Date.now()}-${idx}`,
									description: s,
									toolsToUse: [],
									expectedFiles: [],
									riskLevel: 'safe' as const,
									dependencies: []
								};
							}
							return {
								...s,
								stepId: s.stepId || s.id || `step-${Date.now()}-${idx}`,
								description: s.description || s.title || '',
								toolsToUse: s.toolsToUse || [],
								expectedFiles: s.expectedFiles || [],
								riskLevel: s.riskLevel || 'safe',
								dependencies: s.dependencies || []
							};
						});
					}
					if (fullUpdate.tags && Array.isArray(fullUpdate.tags)) {
						updatedPlan.tags = fullUpdate.tags.map((t: any) => typeof t === 'string' ? t : String(t));
					}
				}
				break;
		}

		// Save the updated plan
		await this.savePlan(updatedPlan, scope);

		return { updatedPlan, section: update.section };
	}

	// Build system prompt for plan editing
	private _buildPlanEditSystemPrompt(plan: HybridPlan): string {
		const stepsInfo = plan.steps && plan.steps.length > 0
			? `\n\nSTEPS (${plan.steps.length} total):\n${plan.steps.map((s, i) => `${i + 1}. ${s.description}`).join('\n')}`
			: '\n\nSTEPS: None defined';

		const tagsInfo = plan.tags && plan.tags.length > 0
			? `\n\nTAGS: ${plan.tags.join(', ')}`
			: '';

		return `You are a plan editing assistant. Help the user modify their plan.

CURRENT PLAN:
- Title: ${plan.title}
- Created: ${new Date(plan.createdAt).toLocaleString()}
- Last Edited: ${plan.lastEditedAt ? new Date(plan.lastEditedAt).toLocaleString() : 'Never'}
${tagsInfo}

SUMMARY:
${plan.summary || '(No content)'}
${stepsInfo}

HOW TO MAKE CHANGES:
When you want to update the plan, output a JSON code block with your changes:

\`\`\`json
{
  "section": "title" | "summary" | "steps" | "tags" | "full",
  "newContent": "the new content",
  "operation": "replace" | "append" | "prepend",
  "reason": "Brief explanation of change"
}
\`\`\`

SECTIONS:
- "title": Change the plan title (newContent = string)
- "summary": Update the plan content/description (newContent = markdown string)
- "steps": Modify steps (newContent = JSON array or description string)
- "tags": Update tags (newContent = comma-separated or JSON array)
- "full": Update multiple fields (newContent = JSON object with title/summary/steps/tags)

OPERATIONS:
- "replace": Replace the section entirely
- "append": Add to the end of existing content
- "prepend": Add to the beginning of existing content

RULES:
1. NEVER modify planId, createdAt, or projectPath
2. Explain what you're changing BEFORE the JSON block
3. Ask clarifying questions if the user's request is ambiguous
4. Make minimal, targeted changes unless user asks for major rewrite
5. Preserve existing formatting and structure where possible

EXAMPLE RESPONSE:
"I'll update the title to reflect the new focus on authentication.

\`\`\`json
{
  "section": "title",
  "newContent": "User Authentication Implementation Plan",
  "operation": "replace",
  "reason": "Updated title to focus on auth"
}
\`\`\`"`;
	}

	// Helper methods for file naming and content generation
	private _generatePlanFileName(title: string, createdAt: string): string {
		// Extract date in YYYY-MM-DD format
		const date = createdAt.split('T')[0];

		// Sanitize title for filename (replace invalid chars with underscores)
		const safeTitle = title
			.replace(/[<>:"/\\|?*]/g, '_')  // Replace invalid filename chars
			.replace(/\s+/g, '_')            // Replace spaces with underscores
			.trim();

		return `${date}_${safeTitle}`;
	}

	private _generateMarkdownContent(plan: HybridPlan): string {
		const md = [
			`# ${plan.title}`,
			'',
			'## Metadata',
			`- **Created:** ${new Date(plan.createdAt).toLocaleString()}`,
			`- **Plan ID:** ${plan.planId}`,
			`- **Conversation ID:** ${plan.conversationId || 'N/A'}`,
			`- **Created By:** ${plan.createdBy}`,
			`- **Plan Type:** ${plan.planType}`,
			'',
			'## Plan Content',
			'',
			plan.summary || '(No content)',
			'',
		];

		if (plan.steps && plan.steps.length > 0) {
			md.push('## Steps', '');
			plan.steps.forEach((step, idx) => {
				md.push(`${idx + 1}. ${step.description || 'Step'}`);
			});
			md.push('');
		}

		if (plan.tags && plan.tags.length > 0) {
			md.push(`**Tags:** ${plan.tags.join(', ')}`);
			md.push('');
		}

		return md.join('\n');
	}

	// Private methods for project plans
	private async _saveProjectPlan(plan: HybridPlan): Promise<void> {
		const workspaceFolders = this.workspaceContextService.getWorkspace().folders;
		if (workspaceFolders.length === 0) {
			throw new Error('No workspace folder open');
		}

		const plansDir = URI.joinPath(workspaceFolders[0].uri, '.void', 'plans');
		const fileName = this._generatePlanFileName(plan.title, plan.createdAt);
		const jsonFile = URI.joinPath(plansDir, `${fileName}.json`);
		const mdFile = URI.joinPath(plansDir, `${fileName}.md`);

		try {
			await this.fileService.createFolder(plansDir);
		} catch {
			// Folder might already exist
		}

		// Save JSON file
		const jsonContent = JSON.stringify(plan, null, 2);
		await this.fileService.writeFile(jsonFile, VSBuffer.fromString(jsonContent));

		// Save Markdown file
		const mdContent = this._generateMarkdownContent(plan);
		await this.fileService.writeFile(mdFile, VSBuffer.fromString(mdContent));
	}

	private async _getProjectPlan(planId: string): Promise<HybridPlan | null> {
		const workspaceFolders = this.workspaceContextService.getWorkspace().folders;
		if (workspaceFolders.length === 0) {
			return null;
		}

		// First try legacy format (planId.json)
		const planFile = URI.joinPath(workspaceFolders[0].uri, '.void', 'plans', `${planId}.json`);

		try {
			const content = await this.fileService.readFile(planFile);
			const rawPlan = JSON.parse(content.value.toString());

			// MIGRATION: Add defaults for new fields
			return {
				...rawPlan,
				planType: rawPlan.planType || 'hybrid-execution',
				conversationId: rawPlan.conversationId,
				tags: rawPlan.tags || []
			} as HybridPlan;
		} catch {
			// If not found, search through all JSON files for matching planId
			const plansDir = URI.joinPath(workspaceFolders[0].uri, '.void', 'plans');
			try {
				const entries = await this.fileService.resolve(plansDir);
				if (entries.children) {
					for (const entry of entries.children) {
						if (entry.name.endsWith('.json')) {
							try {
								const content = await this.fileService.readFile(entry.resource);
								const rawPlan = JSON.parse(content.value.toString());
								if (rawPlan.planId === planId) {
									return {
										...rawPlan,
										planType: rawPlan.planType || 'hybrid-execution',
										conversationId: rawPlan.conversationId,
										tags: rawPlan.tags || []
									} as HybridPlan;
								}
							} catch {
								// Skip invalid files
							}
						}
					}
				}
			} catch {
				// Directory doesn't exist or other error
			}
			return null;
		}
	}

	private async _listProjectPlans(): Promise<HybridPlan[]> {
		const workspaceFolders = this.workspaceContextService.getWorkspace().folders;
		if (workspaceFolders.length === 0) {
			return [];
		}

		const plansDir = URI.joinPath(workspaceFolders[0].uri, '.void', 'plans');

		try {
			const entries = await this.fileService.resolve(plansDir);
			if (!entries.children) {
				return [];
			}

			const plans: HybridPlan[] = [];
			for (const entry of entries.children) {
				if (entry.name.endsWith('.json')) {
					try {
						const content = await this.fileService.readFile(entry.resource);
						const rawPlan = JSON.parse(content.value.toString());
						// MIGRATION: Add defaults for new fields
						const plan: HybridPlan = {
							...rawPlan,
							planType: rawPlan.planType || 'hybrid-execution',
							conversationId: rawPlan.conversationId,
							tags: rawPlan.tags || []
						};
						plans.push(plan);
					} catch {
						// Skip invalid files
					}
				}
			}

			return plans;
		} catch {
			return [];
		}
	}

	private async _deleteProjectPlan(planId: string): Promise<void> {
		const workspaceFolders = this.workspaceContextService.getWorkspace().folders;
		if (workspaceFolders.length === 0) {
			return;
		}

		// Find and delete both JSON and MD files with matching planId
		const plansDir = URI.joinPath(workspaceFolders[0].uri, '.void', 'plans');
		try {
			const entries = await this.fileService.resolve(plansDir);
			if (entries.children) {
				for (const entry of entries.children) {
					if (entry.name.endsWith('.json')) {
						try {
							const content = await this.fileService.readFile(entry.resource);
							const rawPlan = JSON.parse(content.value.toString());
							if (rawPlan.planId === planId) {
								// Delete both JSON and corresponding MD file
								await this.fileService.del(entry.resource);
								const mdFile = URI.file(entry.resource.fsPath.replace('.json', '.md'));
								try {
									await this.fileService.del(mdFile);
								} catch {
									// MD file might not exist for legacy plans
								}
								break;
							}
						} catch {
							// Skip invalid files
						}
					}
				}
			}
		} catch {
			// Directory doesn't exist or other error
		}
	}

	// Private methods for global plans
	private async _saveGlobalPlan(plan: HybridPlan): Promise<void> {
		const plans = await this._listGlobalPlans();
		const existingIndex = plans.findIndex(p => p.planId === plan.planId);

		if (existingIndex >= 0) {
			plans[existingIndex] = plan;
		} else {
			plans.push(plan);
		}

		this.storageService.store(
			HybridPlanService.GLOBAL_PLANS_KEY,
			JSON.stringify(plans),
			StorageScope.APPLICATION,
			StorageTarget.MACHINE
		);
	}

	private async _getGlobalPlan(planId: string): Promise<HybridPlan | null> {
		const plans = await this._listGlobalPlans();
		const rawPlan = plans.find(p => p.planId === planId);
		if (!rawPlan) return null;

		// MIGRATION: Add defaults for new fields
		return {
			...rawPlan,
			planType: rawPlan.planType || 'hybrid-execution',
			conversationId: rawPlan.conversationId,
			tags: rawPlan.tags || []
		};
	}

	private async _listGlobalPlans(): Promise<HybridPlan[]> {
		const plansStr = this.storageService.get(HybridPlanService.GLOBAL_PLANS_KEY, StorageScope.APPLICATION);
		if (!plansStr) {
			return [];
		}

		try {
			return JSON.parse(plansStr);
		} catch {
			return [];
		}
	}

	private async _deleteGlobalPlan(planId: string): Promise<void> {
		const plans = await this._listGlobalPlans();
		const filtered = plans.filter(p => p.planId !== planId);

		this.storageService.store(
			HybridPlanService.GLOBAL_PLANS_KEY,
			JSON.stringify(filtered),
			StorageScope.APPLICATION,
			StorageTarget.MACHINE
		);
	}

	// Edit session helper methods - Project scope
	private async _saveProjectEditSession(session: PlanEditSession): Promise<void> {
		const workspaceFolders = this.workspaceContextService.getWorkspace().folders;
		if (workspaceFolders.length === 0) {
			throw new Error('No workspace folder open');
		}

		const sessionsDir = URI.joinPath(workspaceFolders[0].uri, '.void', 'plans', 'edit-sessions');
		const sessionFile = URI.joinPath(sessionsDir, `${session.sessionId}.json`);

		try {
			await this.fileService.createFolder(sessionsDir);
		} catch {
			// Folder might already exist
		}

		await this.fileService.writeFile(sessionFile, VSBuffer.fromString(JSON.stringify(session, null, 2)));
	}

	private async _listProjectEditSessions(planId: string): Promise<PlanEditSession[]> {
		const workspaceFolders = this.workspaceContextService.getWorkspace().folders;
		if (workspaceFolders.length === 0) {
			return [];
		}

		const sessionsDir = URI.joinPath(workspaceFolders[0].uri, '.void', 'plans', 'edit-sessions');

		try {
			const entries = await this.fileService.resolve(sessionsDir);
			if (!entries.children) {
				return [];
			}

			const sessions: PlanEditSession[] = [];
			for (const entry of entries.children) {
				if (entry.name.endsWith('.json')) {
					try {
						const content = await this.fileService.readFile(entry.resource);
						const session = JSON.parse(content.value.toString()) as PlanEditSession;
						if (session.planId === planId) {
							sessions.push(session);
						}
					} catch {
						// Skip invalid files
					}
				}
			}

			return sessions;
		} catch {
			return [];
		}
	}

	private async _deleteProjectEditSession(sessionId: string): Promise<void> {
		const workspaceFolders = this.workspaceContextService.getWorkspace().folders;
		if (workspaceFolders.length === 0) {
			return;
		}

		const sessionFile = URI.joinPath(workspaceFolders[0].uri, '.void', 'plans', 'edit-sessions', `${sessionId}.json`);
		try {
			await this.fileService.del(sessionFile);
		} catch {
			// File might not exist
		}
	}

	// Edit session helper methods - Global scope
	private async _saveGlobalEditSession(session: PlanEditSession): Promise<void> {
		const sessions = await this._listAllGlobalEditSessions();
		sessions.push(session);

		// Keep only last 50 sessions for global scope (storage limits)
		const trimmed = sessions.slice(-50);

		this.storageService.store(
			HybridPlanService.GLOBAL_EDIT_SESSIONS_KEY,
			JSON.stringify(trimmed),
			StorageScope.APPLICATION,
			StorageTarget.MACHINE
		);
	}

	private async _listAllGlobalEditSessions(): Promise<PlanEditSession[]> {
		const sessionsStr = this.storageService.get(HybridPlanService.GLOBAL_EDIT_SESSIONS_KEY, StorageScope.APPLICATION);
		if (!sessionsStr) {
			return [];
		}

		try {
			return JSON.parse(sessionsStr);
		} catch {
			return [];
		}
	}

	private async _listGlobalEditSessions(planId: string): Promise<PlanEditSession[]> {
		const sessions = await this._listAllGlobalEditSessions();
		return sessions.filter(s => s.planId === planId);
	}

	private async _deleteGlobalEditSession(sessionId: string): Promise<void> {
		const sessions = await this._listAllGlobalEditSessions();
		const filtered = sessions.filter(s => s.sessionId !== sessionId);

		this.storageService.store(
			HybridPlanService.GLOBAL_EDIT_SESSIONS_KEY,
			JSON.stringify(filtered),
			StorageScope.APPLICATION,
			StorageTarget.MACHINE
		);
	}

	// Snapshot helper methods - Project scope
	private async _saveProjectSnapshot(planId: string, snapshot: HybridPlan): Promise<void> {
		const workspaceFolders = this.workspaceContextService.getWorkspace().folders;
		if (workspaceFolders.length === 0) {
			throw new Error('No workspace folder open');
		}

		const snapshotsDir = URI.joinPath(workspaceFolders[0].uri, '.void', 'plans', 'snapshots');
		const snapshotFile = URI.joinPath(snapshotsDir, `${planId}.json`);

		try {
			await this.fileService.createFolder(snapshotsDir);
		} catch {
			// Folder might already exist
		}

		await this.fileService.writeFile(snapshotFile, VSBuffer.fromString(JSON.stringify(snapshot, null, 2)));
	}

	private async _getProjectSnapshot(planId: string): Promise<HybridPlan | null> {
		const workspaceFolders = this.workspaceContextService.getWorkspace().folders;
		if (workspaceFolders.length === 0) {
			return null;
		}

		const snapshotFile = URI.joinPath(workspaceFolders[0].uri, '.void', 'plans', 'snapshots', `${planId}.json`);

		try {
			const content = await this.fileService.readFile(snapshotFile);
			return JSON.parse(content.value.toString()) as HybridPlan;
		} catch {
			return null;
		}
	}

	// Snapshot helper methods - Global scope
	private async _saveGlobalSnapshot(planId: string, snapshot: HybridPlan): Promise<void> {
		const key = HybridPlanService.GLOBAL_SNAPSHOTS_KEY_PREFIX + planId;
		this.storageService.store(key, JSON.stringify(snapshot), StorageScope.APPLICATION, StorageTarget.MACHINE);
	}

	private async _getGlobalSnapshot(planId: string): Promise<HybridPlan | null> {
		const key = HybridPlanService.GLOBAL_SNAPSHOTS_KEY_PREFIX + planId;
		const snapshotStr = this.storageService.get(key, StorageScope.APPLICATION);
		if (!snapshotStr) {
			return null;
		}

		try {
			return JSON.parse(snapshotStr);
		} catch {
			return null;
		}
	}

	// Lock management for conflict resolution
	async acquireEditLock(planId: string, scope: 'project' | 'global'): Promise<{ success: boolean; error?: string }> {
		const lockKey = `${planId}-${scope}`;

		// If this session already holds this lock, just refresh it
		if (this._currentSessionLocks.has(lockKey)) {
			const lock = {
				planId,
				lockedAt: new Date().toISOString(),
				expiresAt: new Date(Date.now() + HybridPlanService.LOCK_TIMEOUT_MS).toISOString(),
				sessionId: lockKey
			};

			if (scope === 'project') {
				await this._saveProjectLock(planId, lock);
			} else {
				await this._saveGlobalLock(planId, lock);
			}
			return { success: true };
		}

		const existingLock = await this.isEditLocked(planId, scope);

		if (existingLock.locked && existingLock.expiresAt) {
			const expiresAt = new Date(existingLock.expiresAt).getTime();
			if (expiresAt > Date.now()) {
				return {
					success: false,
					error: `Plan is being edited in another session (started ${new Date(existingLock.lockedAt!).toLocaleTimeString()})`
				};
			}
		}

		const lock = {
			planId,
			lockedAt: new Date().toISOString(),
			expiresAt: new Date(Date.now() + HybridPlanService.LOCK_TIMEOUT_MS).toISOString(),
			sessionId: lockKey
		};

		if (scope === 'project') {
			await this._saveProjectLock(planId, lock);
		} else {
			await this._saveGlobalLock(planId, lock);
		}

		// Track this lock as owned by current session
		this._currentSessionLocks.add(lockKey);

		return { success: true };
	}

	async releaseEditLock(planId: string, scope: 'project' | 'global'): Promise<void> {
		const lockKey = `${planId}-${scope}`;
		this._currentSessionLocks.delete(lockKey);

		if (scope === 'project') {
			await this._deleteProjectLock(planId);
		} else {
			await this._deleteGlobalLock(planId);
		}
	}

	async isEditLocked(planId: string, scope: 'project' | 'global'): Promise<{ locked: boolean; lockedAt?: string; expiresAt?: string }> {
		let lock: { lockedAt: string; expiresAt: string } | null = null;

		if (scope === 'project') {
			lock = await this._getProjectLock(planId);
		} else {
			lock = await this._getGlobalLock(planId);
		}

		if (!lock) {
			return { locked: false };
		}

		const expiresAt = new Date(lock.expiresAt).getTime();
		if (expiresAt <= Date.now()) {
			// Lock expired, clean it up
			await this.releaseEditLock(planId, scope);
			return { locked: false };
		}

		return {
			locked: true,
			lockedAt: lock.lockedAt,
			expiresAt: lock.expiresAt
		};
	}

	// Project lock helpers
	private async _saveProjectLock(planId: string, lock: object): Promise<void> {
		const workspaceFolders = this.workspaceContextService.getWorkspace().folders;
		if (workspaceFolders.length === 0) {
			return;
		}

		const locksDir = URI.joinPath(workspaceFolders[0].uri, '.void', 'plans', 'locks');
		const lockFile = URI.joinPath(locksDir, `${planId}.lock`);

		try {
			await this.fileService.createFolder(locksDir);
		} catch {
			// Folder might already exist
		}

		await this.fileService.writeFile(lockFile, VSBuffer.fromString(JSON.stringify(lock)));
	}

	private async _getProjectLock(planId: string): Promise<{ lockedAt: string; expiresAt: string } | null> {
		const workspaceFolders = this.workspaceContextService.getWorkspace().folders;
		if (workspaceFolders.length === 0) {
			return null;
		}

		const lockFile = URI.joinPath(workspaceFolders[0].uri, '.void', 'plans', 'locks', `${planId}.lock`);

		try {
			const content = await this.fileService.readFile(lockFile);
			return JSON.parse(content.value.toString());
		} catch {
			return null;
		}
	}

	private async _deleteProjectLock(planId: string): Promise<void> {
		const workspaceFolders = this.workspaceContextService.getWorkspace().folders;
		if (workspaceFolders.length === 0) {
			return;
		}

		const lockFile = URI.joinPath(workspaceFolders[0].uri, '.void', 'plans', 'locks', `${planId}.lock`);

		try {
			await this.fileService.del(lockFile);
		} catch {
			// File might not exist
		}
	}

	// Global lock helpers
	private async _saveGlobalLock(planId: string, lock: object): Promise<void> {
		const key = HybridPlanService.GLOBAL_LOCKS_KEY_PREFIX + planId;
		this.storageService.store(key, JSON.stringify(lock), StorageScope.APPLICATION, StorageTarget.MACHINE);
	}

	private async _getGlobalLock(planId: string): Promise<{ lockedAt: string; expiresAt: string } | null> {
		const key = HybridPlanService.GLOBAL_LOCKS_KEY_PREFIX + planId;
		const lockStr = this.storageService.get(key, StorageScope.APPLICATION);
		if (!lockStr) {
			return null;
		}

		try {
			return JSON.parse(lockStr);
		} catch {
			return null;
		}
	}

	private async _deleteGlobalLock(planId: string): Promise<void> {
		const key = HybridPlanService.GLOBAL_LOCKS_KEY_PREFIX + planId;
		this.storageService.remove(key, StorageScope.APPLICATION);
	}
}

registerSingleton(IHybridPlanService, HybridPlanService, InstantiationType.Delayed);

