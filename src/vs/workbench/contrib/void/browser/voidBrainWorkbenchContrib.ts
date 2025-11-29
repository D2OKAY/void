import { Disposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../common/contributions.js';
import { IVoidBrainService } from '../common/voidBrainService.js';
import { VSBuffer } from '../../../../base/common/buffer.js';

class VoidBrainWorkbenchContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.void.brain';
	_serviceBrand: undefined;

	constructor(
		@IVoidBrainService _voidBrainService: IVoidBrainService,
		@IWorkspaceContextService private readonly workspaceContext: IWorkspaceContextService,
		@IFileService private readonly fileService: IFileService,
	) {
		super();

		// Initialize .void folder and brain.json for each workspace
		this._register(this.workspaceContext.onDidChangeWorkspaceFolders((e) => {
			[...e.changed, ...e.added].forEach(w => { this._initializeWorkspace(w.uri); });
		}));

		// Initialize for existing workspaces
		this.workspaceContext.getWorkspace().folders.forEach(w => {
			this._initializeWorkspace(w.uri);
		});
	}

	private async _initializeWorkspace(workspaceUri: URI): Promise<void> {
		try {
			const voidDirUri = URI.joinPath(workspaceUri, '.void');
			const brainFileUri = URI.joinPath(voidDirUri, 'brain.json');
			const gitignoreUri = URI.joinPath(workspaceUri, '.gitignore');

			// Check if .void directory exists, create if not
			try {
				await this.fileService.resolve(voidDirUri);
			} catch {
				// Directory doesn't exist, create it
				await this.fileService.createFolder(voidDirUri);
			}

			// Check if brain.json exists, create empty one if not
			try {
				await this.fileService.resolve(brainFileUri);
			} catch {
				// File doesn't exist, create empty brain
				const emptyBrain = {
					metadata: {
						version: '1.0',
						lastUpdated: new Date().toISOString(),
						totalLessons: 0,
						categories: [],
					},
					lessons: [],
				};
				const content = JSON.stringify(emptyBrain, null, 2);
				await this.fileService.writeFile(brainFileUri, VSBuffer.fromString(content));
			}

			// Add .void/ to .gitignore if it exists
			try {
				const gitignoreFile = await this.fileService.readFile(gitignoreUri);
				const gitignoreContent = gitignoreFile.value.toString();
				
				// Check if .void/ is already in .gitignore
				if (!gitignoreContent.includes('.void/')) {
					// Add .void/ to .gitignore
					const newContent = gitignoreContent + (gitignoreContent.endsWith('\n') ? '' : '\n') + '.void/\n';
					await this.fileService.writeFile(gitignoreUri, VSBuffer.fromString(newContent));
				}
			} catch {
				// .gitignore doesn't exist, create it with .void/ entry
				const content = '.void/\n';
				await this.fileService.writeFile(gitignoreUri, VSBuffer.fromString(content));
			}
		} catch (e) {
			console.error('Failed to initialize .void folder:', e);
		}
	}
}

registerWorkbenchContribution2(
	VoidBrainWorkbenchContribution.ID,
	VoidBrainWorkbenchContribution,
	WorkbenchPhase.Eventually // Initialize after workspace is loaded
);

