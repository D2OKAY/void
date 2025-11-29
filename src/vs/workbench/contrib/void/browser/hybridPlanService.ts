import { Disposable } from '../../../../base/common/lifecycle.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { URI } from '../../../../base/common/uri.js';
import { IHybridPlanService } from '../common/hybridPlanServiceTypes.js';
import { HybridPlan, HybridExecutionState } from '../common/hybridAgentTypes.js';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { registerSingleton, InstantiationType } from '../../../../platform/instantiation/common/extensions.js';

export class HybridPlanService extends Disposable implements IHybridPlanService {
	readonly _serviceBrand: undefined;

	private static readonly GLOBAL_PLANS_KEY = 'void.hybridAgent.globalPlans';
	private static readonly EXECUTION_STATE_KEY_PREFIX = 'void.hybridAgent.executionState.';

	constructor(
		@IFileService private readonly fileService: IFileService,
		@IStorageService private readonly storageService: IStorageService,
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService,
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

	async deletePlan(planId: string, scope: 'project' | 'global'): Promise<void> {
		if (scope === 'project') {
			await this._deleteProjectPlan(planId);
		} else {
			await this._deleteGlobalPlan(planId);
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

	// Private methods for project plans
	private async _saveProjectPlan(plan: HybridPlan): Promise<void> {
		const workspaceFolders = this.workspaceContextService.getWorkspace().folders;
		if (workspaceFolders.length === 0) {
			throw new Error('No workspace folder open');
		}

		const plansDir = URI.joinPath(workspaceFolders[0].uri, '.void', 'plans');
		const planFile = URI.joinPath(plansDir, `${plan.planId}.json`);

		try {
			await this.fileService.createFolder(plansDir);
		} catch {
			// Folder might already exist
		}

		const content = JSON.stringify(plan, null, 2);
		await this.fileService.writeFile(planFile, VSBuffer.fromString(content));
	}

	private async _getProjectPlan(planId: string): Promise<HybridPlan | null> {
		const workspaceFolders = this.workspaceContextService.getWorkspace().folders;
		if (workspaceFolders.length === 0) {
			return null;
		}

		const planFile = URI.joinPath(workspaceFolders[0].uri, '.void', 'plans', `${planId}.json`);

		try {
			const content = await this.fileService.readFile(planFile);
			return JSON.parse(content.value.toString());
		} catch {
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
						const plan = JSON.parse(content.value.toString());
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

		const planFile = URI.joinPath(workspaceFolders[0].uri, '.void', 'plans', `${planId}.json`);

		try {
			await this.fileService.del(planFile);
		} catch {
			// File might not exist
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
		return plans.find(p => p.planId === planId) || null;
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
}

registerSingleton(IHybridPlanService, HybridPlanService, InstantiationType.Delayed);

