import { Disposable } from '../../../../base/common/lifecycle.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { URI } from '../../../../base/common/uri.js';
import { registerWorkbenchContribution2, WorkbenchPhase } from '../../../common/contributions.js';

class HybridPlanWorkbenchContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'void.hybridPlanWorkbench';

	constructor(
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService,
		@IFileService private readonly fileService: IFileService,
	) {
		super();
		this._initialize();
	}

	private async _initialize() {
		const workspaceFolders = this.workspaceContextService.getWorkspace().folders;

		for (const folder of workspaceFolders) {
			const voidPlansPath = URI.joinPath(folder.uri, '.void', 'plans');

			try {
				await this.fileService.createFolder(voidPlansPath);
			} catch (e) {
				// Folder might already exist, ignore
			}
		}
	}
}

registerWorkbenchContribution2(
	HybridPlanWorkbenchContribution.ID,
	HybridPlanWorkbenchContribution,
	WorkbenchPhase.Eventually
);





