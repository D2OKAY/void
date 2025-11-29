import { Disposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { registerSingleton, InstantiationType } from '../../../../platform/instantiation/common/extensions.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { BrainLesson, BrainScope, BrainState, LessonConflict } from './voidBrainTypes.js';
import { VSBuffer } from '../../../../base/common/buffer.js';

const VOID_BRAIN_STORAGE_KEY = 'void.brain.global';
const BRAIN_FILE_NAME = 'brain.json';
const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export const IVoidBrainService = createDecorator<IVoidBrainService>('voidBrainService');

export interface IVoidBrainService {
	readonly _serviceBrand: undefined;

	// Lesson management
	addLesson(lesson: Omit<BrainLesson, 'id' | 'dateAdded' | 'timesReferenced'>, scope: BrainScope): Promise<string>;
	updateLesson(id: string, updates: Partial<BrainLesson>, scope: BrainScope): Promise<void>;
	deleteLesson(id: string, scope: BrainScope): Promise<void>;
	searchLessons(query: string, scope: BrainScope | 'both'): BrainLesson[];

	// Injection logic
	getRelevantLessons(context: { fileUri?: URI; language?: string }): BrainLesson[];
	formatLessonsForPrompt(lessons: BrainLesson[], maxChars: number): string;

	// Promotion & cleanup
	promoteToGlobal(projectLessonIds: string[]): Promise<void>;
	shouldPromptGlobalSync(): boolean;
	detectConflicts(scope: BrainScope | 'both'): LessonConflict[];
	markCleanup(scope: BrainScope): Promise<void>;
}

class VoidBrainService extends Disposable implements IVoidBrainService {
	readonly _serviceBrand: undefined;
	static readonly ID = 'voidBrainService';

	private _projectBrain: BrainState | null = null;
	private _globalBrain: BrainState | null = null;

	constructor(
		@IFileService private readonly fileService: IFileService,
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService,
		@IStorageService private readonly storageService: IStorageService,
	) {
		super();
		this._initializeGlobalBrain();
	}

	// ============ Lesson Management ============

	async addLesson(lesson: Omit<BrainLesson, 'id' | 'dateAdded' | 'timesReferenced'>, scope: BrainScope): Promise<string> {
		const brain = scope === 'project' ? await this._getProjectBrain() : this._getGlobalBrain();

		const newLesson: BrainLesson = {
			...lesson,
			id: this._generateId(),
			dateAdded: new Date().toISOString(),
			timesReferenced: 0,
		};

		brain.lessons.push(newLesson);

		// Update metadata
		brain.metadata.totalLessons = brain.lessons.length;
		brain.metadata.lastUpdated = new Date().toISOString();
		if (!brain.metadata.categories.includes(newLesson.category)) {
			brain.metadata.categories.push(newLesson.category);
		}

		await this._saveBrain(brain, scope);
		return newLesson.id;
	}

	async updateLesson(id: string, updates: Partial<BrainLesson>, scope: BrainScope): Promise<void> {
		const brain = scope === 'project' ? await this._getProjectBrain() : this._getGlobalBrain();
		const lesson = brain.lessons.find(l => l.id === id);

		if (!lesson) {
			throw new Error(`Lesson with id ${id} not found in ${scope} brain`);
		}

		Object.assign(lesson, updates, {
			dateModified: new Date().toISOString(),
		});

		// Update category list if category changed
		if (updates.category && !brain.metadata.categories.includes(updates.category)) {
			brain.metadata.categories.push(updates.category);
		}

		brain.metadata.lastUpdated = new Date().toISOString();
		await this._saveBrain(brain, scope);
	}

	async deleteLesson(id: string, scope: BrainScope): Promise<void> {
		const brain = scope === 'project' ? await this._getProjectBrain() : this._getGlobalBrain();
		const index = brain.lessons.findIndex(l => l.id === id);

		if (index === -1) {
			throw new Error(`Lesson with id ${id} not found in ${scope} brain`);
		}

		brain.lessons.splice(index, 1);
		brain.metadata.totalLessons = brain.lessons.length;
		brain.metadata.lastUpdated = new Date().toISOString();

		await this._saveBrain(brain, scope);
	}

	searchLessons(query: string, scope: BrainScope | 'both'): BrainLesson[] {
		const lessons: BrainLesson[] = [];
		const lowerQuery = query.toLowerCase();

		if (scope === 'project' || scope === 'both') {
			const projectBrain = this._projectBrain;
			if (projectBrain) {
				lessons.push(...projectBrain.lessons.filter(l =>
					l.title.toLowerCase().includes(lowerQuery) ||
					l.description.toLowerCase().includes(lowerQuery) ||
					l.category.toLowerCase().includes(lowerQuery)
				));
			}
		}

		if (scope === 'global' || scope === 'both') {
			const globalBrain = this._globalBrain;
			if (globalBrain) {
				lessons.push(...globalBrain.lessons.filter(l =>
					l.title.toLowerCase().includes(lowerQuery) ||
					l.description.toLowerCase().includes(lowerQuery) ||
					l.category.toLowerCase().includes(lowerQuery)
				));
			}
		}

		return lessons;
	}

	// ============ Injection Logic ============

	getRelevantLessons(context: { fileUri?: URI; language?: string }): BrainLesson[] {
		const lessons: BrainLesson[] = [];

		// All global lessons (always included)
		const globalBrain = this._globalBrain;
		if (globalBrain) {
			lessons.push(...globalBrain.lessons);
		}

		// Context-matched project lessons
		const projectBrain = this._projectBrain;
		if (projectBrain) {
			const matchedLessons = this._filterByContext(projectBrain.lessons, context);
			lessons.push(...matchedLessons);
		}

		// Update usage tracking
		const now = new Date().toISOString();
		lessons.forEach(lesson => {
			lesson.timesReferenced++;
			lesson.lastUsed = now;
		});

		// Sort by priority (high > medium > low)
		return lessons.sort((a, b) => {
			const priorityOrder = { high: 3, medium: 2, low: 1 };
			return priorityOrder[b.priority] - priorityOrder[a.priority];
		});
	}

	formatLessonsForPrompt(lessons: BrainLesson[], maxChars: number): string {
		const globalLessons = lessons.filter(l => this._isGlobalLesson(l));
		const projectLessons = lessons.filter(l => !this._isGlobalLesson(l));

		let output = '';

		// Format global lessons
		if (globalLessons.length > 0) {
			output += 'GLOBAL LESSONS (apply to all projects):\n';
			for (const lesson of globalLessons) {
				const formatted = `- [${lesson.category}] ${lesson.description}\n`;
				if (output.length + formatted.length > maxChars) break;
				output += formatted;
			}
			output += '\n';
		}

		// Format project lessons
		if (projectLessons.length > 0 && output.length < maxChars) {
			output += 'PROJECT-SPECIFIC LESSONS:\n';
			for (const lesson of projectLessons) {
				const formatted = `- [${lesson.category}] ${lesson.description}\n`;
				if (output.length + formatted.length > maxChars) break;
				output += formatted;
			}
		}

		return output.trim();
	}

	// ============ Promotion & Cleanup ============

	async promoteToGlobal(projectLessonIds: string[]): Promise<void> {
		const projectBrain = await this._getProjectBrain();
		const globalBrain = this._getGlobalBrain();

		const lessonsToPromote = projectBrain.lessons.filter(l =>
			projectLessonIds.includes(l.id) || (projectLessonIds.length === 0 && l.isGlobalCandidate)
		);

		for (const lesson of lessonsToPromote) {
			// Remove from project and add to global
			const index = projectBrain.lessons.findIndex(l => l.id === lesson.id);
			if (index !== -1) {
				projectBrain.lessons.splice(index, 1);
			}

			// Add to global with new ID
			const globalLesson: BrainLesson = {
				...lesson,
				id: this._generateId(),
				isGlobalCandidate: false, // No longer a candidate, it IS global
			};
			globalBrain.lessons.push(globalLesson);

			// Update category
			if (!globalBrain.metadata.categories.includes(globalLesson.category)) {
				globalBrain.metadata.categories.push(globalLesson.category);
			}
		}

		// Update metadata
		projectBrain.metadata.totalLessons = projectBrain.lessons.length;
		projectBrain.metadata.lastGlobalSync = new Date().toISOString();
		projectBrain.metadata.lastUpdated = new Date().toISOString();

		globalBrain.metadata.totalLessons = globalBrain.lessons.length;
		globalBrain.metadata.lastUpdated = new Date().toISOString();

		await Promise.all([
			this._saveBrain(projectBrain, 'project'),
			this._saveBrain(globalBrain, 'global'),
		]);
	}

	shouldPromptGlobalSync(): boolean {
		const projectBrain = this._projectBrain;
		if (!projectBrain || !projectBrain.metadata.lastGlobalSync) {
			return false;
		}

		const lastSync = new Date(projectBrain.metadata.lastGlobalSync).getTime();
		const now = Date.now();
		return (now - lastSync) > ONE_WEEK_MS;
	}

	detectConflicts(scope: BrainScope | 'both'): LessonConflict[] {
		const lessons: BrainLesson[] = [];

		if (scope === 'project' || scope === 'both') {
			if (this._projectBrain) {
				lessons.push(...this._projectBrain.lessons);
			}
		}

		if (scope === 'global' || scope === 'both') {
			if (this._globalBrain) {
				lessons.push(...this._globalBrain.lessons);
			}
		}

		const conflicts: LessonConflict[] = [];

		// Detect similar titles or contradicting descriptions
		for (let i = 0; i < lessons.length; i++) {
			for (let j = i + 1; j < lessons.length; j++) {
				const lesson1 = lessons[i];
				const lesson2 = lessons[j];

				// Check for similar titles
				const titleSimilarity = this._calculateSimilarity(lesson1.title, lesson2.title);
				if (titleSimilarity > 0.7) {
					conflicts.push({
						lesson1,
						lesson2,
						reason: 'Similar titles suggest duplicate lessons',
					});
				}

				// Check for contradictions (contains "never" vs "always" for same concept)
				if (this._hasContradiction(lesson1.description, lesson2.description)) {
					conflicts.push({
						lesson1,
						lesson2,
						reason: 'Lessons may contain contradicting guidance',
					});
				}
			}
		}

		return conflicts;
	}

	async markCleanup(scope: BrainScope): Promise<void> {
		const brain = scope === 'project' ? await this._getProjectBrain() : this._getGlobalBrain();
		brain.metadata.lastCleanup = new Date().toISOString();
		await this._saveBrain(brain, scope);
	}

	// ============ Private Helpers ============

	private _initializeGlobalBrain(): void {
		this._globalBrain = this._loadGlobalBrain();
	}

	private async _getProjectBrain(): Promise<BrainState> {
		if (!this._projectBrain) {
			this._projectBrain = await this._loadProjectBrain();
		}
		return this._projectBrain;
	}

	private _getGlobalBrain(): BrainState {
		if (!this._globalBrain) {
			this._globalBrain = this._createEmptyBrain();
		}
		return this._globalBrain;
	}

	private async _loadProjectBrain(): Promise<BrainState> {
		try {
			const folders = this.workspaceContextService.getWorkspace().folders;
			if (folders.length === 0) {
				return this._createEmptyBrain();
			}

			const brainUri = URI.joinPath(folders[0].uri, '.void', BRAIN_FILE_NAME);
			const content = await this.fileService.readFile(brainUri);
			const brainState = JSON.parse(content.value.toString()) as BrainState;
			return brainState;
		} catch (e) {
			// File doesn't exist yet, return empty brain
			return this._createEmptyBrain();
		}
	}

	private _loadGlobalBrain(): BrainState {
		try {
			const stored = this.storageService.get(VOID_BRAIN_STORAGE_KEY, StorageScope.APPLICATION);
			if (!stored) {
				return this._createEmptyBrain();
			}
			return JSON.parse(stored) as BrainState;
		} catch (e) {
			return this._createEmptyBrain();
		}
	}

	private async _saveBrain(brain: BrainState, scope: BrainScope): Promise<void> {
		if (scope === 'project') {
			this._projectBrain = brain;
			await this._saveProjectBrain(brain);
		} else {
			this._globalBrain = brain;
			this._saveGlobalBrain(brain);
		}
	}

	private async _saveProjectBrain(brain: BrainState): Promise<void> {
		try {
			const folders = this.workspaceContextService.getWorkspace().folders;
			if (folders.length === 0) {
				return;
			}

			const voidDirUri = URI.joinPath(folders[0].uri, '.void');
			const brainUri = URI.joinPath(voidDirUri, BRAIN_FILE_NAME);

			// Ensure .void directory exists
			try {
				await this.fileService.resolve(voidDirUri);
			} catch {
				await this.fileService.createFolder(voidDirUri);
			}

			const content = JSON.stringify(brain, null, 2);
			await this.fileService.writeFile(brainUri, VSBuffer.fromString(content));
		} catch (e) {
			console.error('Failed to save project brain:', e);
		}
	}

	private _saveGlobalBrain(brain: BrainState): void {
		try {
			const serialized = JSON.stringify(brain);
			this.storageService.store(VOID_BRAIN_STORAGE_KEY, serialized, StorageScope.APPLICATION, StorageTarget.USER);
		} catch (e) {
			console.error('Failed to save global brain:', e);
		}
	}

	private _createEmptyBrain(): BrainState {
		return {
			metadata: {
				version: '1.0',
				lastUpdated: new Date().toISOString(),
				totalLessons: 0,
				categories: [],
			},
			lessons: [],
		};
	}

	private _generateId(): string {
		return `lesson-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
	}

	private _isGlobalLesson(lesson: BrainLesson): boolean {
		return this._globalBrain?.lessons.some(l => l.id === lesson.id) ?? false;
	}

	private _filterByContext(lessons: BrainLesson[], context: { fileUri?: URI; language?: string }): BrainLesson[] {
		if (!context.fileUri && !context.language) {
			return lessons; // No context, return all
		}

		// Extract language from file extension if not provided
		let language = context.language;
		if (!language && context.fileUri) {
			const path = context.fileUri.path;
			const ext = path.substring(path.lastIndexOf('.') + 1).toLowerCase();
			language = ext;
		}

		// Filter lessons by category matching language or file context
		return lessons.filter(lesson => {
			// Always include high priority lessons
			if (lesson.priority === 'high') {
				return true;
			}

			// Match category to language
			if (language && lesson.category.toLowerCase().includes(language.toLowerCase())) {
				return true;
			}

			// Match common language mappings
			const languageMatches: Record<string, string[]> = {
				'typescript': ['ts', 'tsx', 'javascript', 'js', 'jsx'],
				'javascript': ['js', 'jsx', 'ts', 'tsx'],
				'python': ['py'],
				'rust': ['rs'],
				'go': ['go'],
			};

			if (language) {
				for (const [category, extensions] of Object.entries(languageMatches)) {
					if (lesson.category.toLowerCase().includes(category) &&
						extensions.includes(language.toLowerCase())) {
						return true;
					}
				}
			}

			return false;
		});
	}

	private _calculateSimilarity(str1: string, str2: string): number {
		const longer = str1.length > str2.length ? str1 : str2;
		const shorter = str1.length > str2.length ? str2 : str1;

		if (longer.length === 0) {
			return 1.0;
		}

		const editDistance = this._levenshteinDistance(longer.toLowerCase(), shorter.toLowerCase());
		return (longer.length - editDistance) / longer.length;
	}

	private _levenshteinDistance(str1: string, str2: string): number {
		const matrix: number[][] = [];

		for (let i = 0; i <= str2.length; i++) {
			matrix[i] = [i];
		}

		for (let j = 0; j <= str1.length; j++) {
			matrix[0][j] = j;
		}

		for (let i = 1; i <= str2.length; i++) {
			for (let j = 1; j <= str1.length; j++) {
				if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
					matrix[i][j] = matrix[i - 1][j - 1];
				} else {
					matrix[i][j] = Math.min(
						matrix[i - 1][j - 1] + 1,
						matrix[i][j - 1] + 1,
						matrix[i - 1][j] + 1
					);
				}
			}
		}

		return matrix[str2.length][str1.length];
	}

	private _hasContradiction(desc1: string, desc2: string): boolean {
		const lower1 = desc1.toLowerCase();
		const lower2 = desc2.toLowerCase();

		// Simple heuristic: check for "never" vs "always" for similar concepts
		const hasNever1 = lower1.includes('never');
		const hasAlways1 = lower1.includes('always');
		const hasNever2 = lower2.includes('never');
		const hasAlways2 = lower2.includes('always');

		if ((hasNever1 && hasAlways2) || (hasAlways1 && hasNever2)) {
			// Check if they're talking about similar things
			const words1 = new Set(lower1.split(/\s+/).filter(w => w.length > 4));
			const words2 = new Set(lower2.split(/\s+/).filter(w => w.length > 4));

			let commonWords = 0;
			words1.forEach(word => {
				if (words2.has(word)) commonWords++;
			});

			return commonWords >= 2; // At least 2 common words suggests same topic
		}

		return false;
	}
}

registerSingleton(IVoidBrainService, VoidBrainService, InstantiationType.Eager);

