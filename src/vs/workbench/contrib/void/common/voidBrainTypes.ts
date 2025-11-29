export interface BrainLesson {
	id: string;                    // unique identifier
	title: string;                 // short title
	description: string;           // full lesson content
	category: string;              // AI-determined category
	priority: 'low' | 'medium' | 'high';
	isGlobalCandidate: boolean;    // marked for potential global promotion
	dateAdded: string;             // ISO date
	dateModified?: string;         // ISO date
	timesReferenced: number;       // usage counter
	lastUsed?: string;             // ISO date
	context?: string;              // optional context/example
}

export interface BrainMetadata {
	version: string;               // schema version "1.0"
	lastUpdated: string;           // ISO date
	lastCleanup?: string;          // ISO date of last cleanup
	lastGlobalSync?: string;       // ISO date of last global promotion
	totalLessons: number;
	categories: string[];          // dynamic list of categories
}

export interface BrainState {
	metadata: BrainMetadata;
	lessons: BrainLesson[];
}

export type BrainScope = 'project' | 'global';

export interface LessonConflict {
	lesson1: BrainLesson;
	lesson2: BrainLesson;
	reason: string;
}

