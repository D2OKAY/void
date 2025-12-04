/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import { URI } from '../../../../../base/common/uri.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { IDirectoryStrService } from '../directoryStrService.js';
import { StagingSelectionItem } from '../chatThreadServiceTypes.js';
import { os } from '../helpers/systemInfo.js';
import { RawToolParamsObj } from '../sendLLMMessageTypes.js';
import { BuiltinToolCallParams, BuiltinToolName, BuiltinToolResultType, ToolName } from '../toolsServiceTypes.js';
import { ChatMode } from '../voidSettingsTypes.js';

// Triple backtick wrapper used throughout the prompts for code blocks
export const tripleTick = ['```', '```']

// Maximum limits for directory structure information
export const MAX_DIRSTR_CHARS_TOTAL_BEGINNING = 10_000
export const MAX_DIRSTR_CHARS_TOTAL_TOOL = 10_000
export const MAX_DIRSTR_RESULTS_TOTAL_BEGINNING = 100
export const MAX_DIRSTR_RESULTS_TOTAL_TOOL = 100

// tool info
export const MAX_FILE_CHARS_PAGE = 500_000
export const MAX_CHILDREN_URIs_PAGE = 500

// terminal tool info
export const MAX_TERMINAL_CHARS = 100_000
export const MAX_TERMINAL_INACTIVE_TIME = 8 // seconds
export const MAX_TERMINAL_BG_COMMAND_TIME = 5


// Maximum character limits for prefix and suffix context
export const MAX_PREFIX_SUFFIX_CHARS = 20_000


export const ORIGINAL = `<<<<<<< ORIGINAL`
export const DIVIDER = `=======`
export const FINAL = `>>>>>>> UPDATED`



const searchReplaceBlockTemplate = `\
${ORIGINAL}
// ... original code goes here
${DIVIDER}
// ... final code goes here
${FINAL}

${ORIGINAL}
// ... original code goes here
${DIVIDER}
// ... final code goes here
${FINAL}`




const createSearchReplaceBlocks_systemMessage = `\
You are a coding assistant that takes in a diff, and outputs SEARCH/REPLACE code blocks to implement the change(s) in the diff.
The diff will be labeled \`DIFF\` and the original file will be labeled \`ORIGINAL_FILE\`.

Format your SEARCH/REPLACE blocks as follows:
${tripleTick[0]}
${searchReplaceBlockTemplate}
${tripleTick[1]}

1. Your SEARCH/REPLACE block(s) must implement the diff EXACTLY. Do NOT leave anything out.

2. You are allowed to output multiple SEARCH/REPLACE blocks to implement the change.

3. Assume any comments in the diff are PART OF THE CHANGE. Include them in the output.

4. Your output should consist ONLY of SEARCH/REPLACE blocks. Do NOT output any text or explanations before or after this.

5. The ORIGINAL code in each SEARCH/REPLACE block must EXACTLY match lines in the original file. Do not add or remove any whitespace, comments, or modifications from the original code.

6. Each ORIGINAL text must be large enough to uniquely identify the change in the file. However, bias towards writing as little as possible.

7. Each ORIGINAL text must be DISJOINT from all other ORIGINAL text.

## EXAMPLE 1
DIFF
${tripleTick[0]}
// ... existing code
let x = 6.5
// ... existing code
${tripleTick[1]}

ORIGINAL_FILE
${tripleTick[0]}
let w = 5
let x = 6
let y = 7
let z = 8
${tripleTick[1]}

ACCEPTED OUTPUT
${tripleTick[0]}
${ORIGINAL}
let x = 6
${DIVIDER}
let x = 6.5
${FINAL}
${tripleTick[1]}

## COMMON MISTAKES TO AVOID

❌ Insufficient context (not unique):
${ORIGINAL}
const x = 5
${DIVIDER}
const x = 10
${FINAL}
// BAD: If file has multiple "const x = 5", this fails

✅ Sufficient context (unique):
${ORIGINAL}
// Configuration
const x = 5
const y = 6
${DIVIDER}
// Configuration
const x = 10
const y = 6
${FINAL}
// GOOD: Comments + surrounding lines make it unique

❌ Overlapping blocks:
Block 1 ORIGINAL: lines 5-10
Block 2 ORIGINAL: lines 8-12
// BAD: Lines 8-10 appear in both blocks

✅ Disjoint blocks:
Block 1 ORIGINAL: lines 5-10
Block 2 ORIGINAL: lines 15-20
// GOOD: No overlap`


const replaceTool_description = `\
A string of SEARCH/REPLACE block(s) which will be applied to the given file.
Your SEARCH/REPLACE blocks string must be formatted as follows:
${searchReplaceBlockTemplate}

## Guidelines:

1. You may output multiple search replace blocks if needed.

2. The ORIGINAL code in each SEARCH/REPLACE block must EXACTLY match lines in the original file. Do not add or remove any whitespace or comments from the original code.

3. Each ORIGINAL text must be large enough to uniquely identify the change. Context guidelines:
   - Minimum: 2-3 lines of context (1 line before + target + 1 line after)
   - Ideal: 3-5 lines of context for safety
   - Maximum: Only include what's needed for uniqueness (don't copy entire functions)
   - Include distinctive elements: comments, function signatures, unique variable names

4. Each ORIGINAL text must be DISJOINT from all other ORIGINAL text.

5. This field is a STRING (not an array).`


// ======================================================== tools ========================================================


const chatSuggestionDiffExample = `\
${tripleTick[0]}typescript
/Users/username/Desktop/my_project/app.ts
// ... existing code ...
function calculateTotal(items: Item[]) {
  const subtotal = items.reduce((sum, item) => sum + item.price, 0)
  const tax = subtotal * 0.08  // Add 8% tax
  return subtotal + tax
}
// ... existing code ...
${tripleTick[1]}`



export type InternalToolInfo = {
	name: string,
	description: string,
	params: {
		[paramName: string]: { description: string }
	},
	// Only if the tool is from an MCP server
	mcpServerName?: string,
}



const uriParam = (object: string) => ({
	uri: { description: `The FULL ABSOLUTE path to the ${object}. Must include complete path from workspace root (e.g., /Users/name/project/src/file.ts, NOT src/file.ts or ./src/file.ts).` }
})

const paginationParam = {
	page_number: { description: 'Optional. The page number of the result. Default is 1.' }
} as const



const terminalDescHelper = `You can use this tool to run any command: sed, grep, etc. Do not edit any files with this tool; use edit_file instead. When working with git and other tools that open an editor (e.g. git diff), you should pipe to cat to get all results and not get stuck in vim.`

const cwdHelper = 'Optional. The directory in which to run the command. Defaults to the first workspace folder.'

export type SnakeCase<S extends string> =
	// exact acronym URI
	S extends 'URI' ? 'uri'
	// suffix URI: e.g. 'rootURI' -> snakeCase('root') + '_uri'
	: S extends `${infer Prefix}URI` ? `${SnakeCase<Prefix>}_uri`
	// default: for each char, prefix '_' on uppercase letters
	: S extends `${infer C}${infer Rest}`
	? `${C extends Lowercase<C> ? C : `_${Lowercase<C>}`}${SnakeCase<Rest>}`
	: S;

export type SnakeCaseKeys<T extends Record<string, any>> = {
	[K in keyof T as SnakeCase<Extract<K, string>>]: T[K]
};



export const builtinTools: {
	[T in keyof BuiltinToolCallParams]: {
		name: string;
		description: string;
		// more params can be generated than exist here, but these params must be a subset of them
		params: Partial<{ [paramName in keyof SnakeCaseKeys<BuiltinToolCallParams[T]>]: { description: string } }>
	}
} = {
	// --- context-gathering (read/search/list) ---

	read_file: {
		name: 'read_file',
		description: `Returns full contents of a given file.`,
		params: {
			...uriParam('file'),
			start_line: { description: 'Optional. Use to read specific section of large files (>500 lines). Can be combined with search_in_file results. Leave blank to read entire file.' },
			end_line: { description: 'Optional. End line for reading file sections. Leave blank to read entire file.' },
			...paginationParam,
		},
	},

	ls_dir: {
		name: 'ls_dir',
		description: `Lists all files and folders in the given URI.`,
		params: {
			uri: { description: `Optional. The FULL path to the ${'folder'}. Leave this as empty or "" to search all folders.` },
			...paginationParam,
		},
	},

	get_dir_tree: {
		name: 'get_dir_tree',
		description: `This is a very effective way to learn about the user's codebase. Returns a tree diagram of all the files and folders in the given folder. `,
		params: {
			...uriParam('folder')
		}
	},

	// pathname_search: {
	// 	name: 'pathname_search',
	// 	description: `Returns all pathnames that match a given \`find\`-style query over the entire workspace. ONLY searches file names. ONLY searches the current workspace. You should use this when looking for a file with a specific name or path. ${paginationHelper.desc}`,

	search_pathnames_only: {
		name: 'search_pathnames_only',
		description: `Returns pathnames matching a query. Searches ONLY file and folder NAMES (not file content). Use when looking for files by name, path pattern, or extension. For searching text INSIDE files, use search_for_files instead.`,
		params: {
			query: { description: `Your query for the search.` },
			include_pattern: { description: 'Optional. Only fill this in if you need to limit your search because there were too many results.' },
			...paginationParam,
		},
	},



	search_for_files: {
		name: 'search_for_files',
		description: `Searches FILE CONTENTS (not filenames) and returns file paths where content matches. Use when looking for specific code, text, or patterns INSIDE files. For finding files by name, use search_pathnames_only. If results exceed 50 files, use search_in_folder parameter to narrow scope.`,
		params: {
			query: { description: `Your query for the search.` },
			search_in_folder: { description: 'Optional. Leave as blank by default. ONLY fill this in if your previous search with the same query was truncated. Searches descendants of this folder only.' },
			is_regex: { description: 'Optional. Default is false. Whether the query is a regex.' },
			...paginationParam,
		},
	},

	// add new search_in_file tool
	search_in_file: {
		name: 'search_in_file',
		description: `Returns an array of all the start line numbers where the content appears in the file.`,
		params: {
			...uriParam('file'),
			query: { description: 'The string or regex to search for in the file.' },
			is_regex: { description: 'Optional. Default is false. Whether the query is a regex.' }
		}
	},

	read_lint_errors: {
		name: 'read_lint_errors',
		description: `Use this tool to view all the lint errors on a file.`,
		params: {
			...uriParam('file'),
		},
	},

	// --- editing (create/delete) ---

	create_file_or_folder: {
		name: 'create_file_or_folder',
		description: `Create a file or folder at the given path. To create a folder, the path MUST end with a trailing slash.`,
		params: {
			...uriParam('file or folder'),
		},
	},

	delete_file_or_folder: {
		name: 'delete_file_or_folder',
		description: `Delete a file or folder at the given path.`,
		params: {
			...uriParam('file or folder'),
			is_recursive: { description: 'Optional. Return true to delete recursively.' }
		},
	},

	edit_file: {
		name: 'edit_file',
		description: `Edit existing file using SEARCH/REPLACE blocks. Use for targeted changes to existing files (editing functions, fixing bugs, updating logic). Requires exact text matching. For newly created files or full rewrites, use rewrite_file instead.`,
		params: {
			...uriParam('file'),
			search_replace_blocks: { description: replaceTool_description }
		},
	},

	rewrite_file: {
		name: 'rewrite_file',
		description: `Replace entire file contents. Use ONLY for: (1) newly created files, or (2) when replacing all content of existing file. Simpler than edit_file but overwrites everything. For targeted edits, use edit_file.`,
		params: {
			...uriParam('file'),
			new_content: { description: `The new contents of the file. Must be a string.` }
		},
	},
	run_command: {
		name: 'run_command',
		description: `Runs a terminal command that completes and exits (waits up to ${MAX_TERMINAL_INACTIVE_TIME}s). Use for: npm install, git commit, file operations, tests, builds. For long-running processes (dev servers), use open_persistent_terminal + run_persistent_command. ${terminalDescHelper}`,
		params: {
			command: { description: 'The terminal command to run.' },
			cwd: { description: cwdHelper },
		},
	},

	run_persistent_command: {
		name: 'run_persistent_command',
		description: `Runs command in persistent terminal created with open_persistent_terminal. Returns output after ${MAX_TERMINAL_BG_COMMAND_TIME}s, command continues in background. Use when terminal state matters (cd, export, source, virtual environments). For one-off commands, use run_command. ${terminalDescHelper}`,
		params: {
			command: { description: 'The terminal command to run.' },
			persistent_terminal_id: { description: 'The ID of the terminal created using open_persistent_terminal.' },
		},
	},



	open_persistent_terminal: {
		name: 'open_persistent_terminal',
		description: `Use this tool when you want to run a terminal command indefinitely, like a dev server (eg \`npm run dev\`), a background listener, etc. Opens a new terminal in the user's environment which will not awaited for or killed.`,
		params: {
			cwd: { description: cwdHelper },
		}
	},


	kill_persistent_terminal: {
		name: 'kill_persistent_terminal',
		description: `Interrupts and closes a persistent terminal that you opened with open_persistent_terminal.`,
		params: { persistent_terminal_id: { description: `The ID of the persistent terminal.` } }
	},

	// --- brain tools ---

	add_lesson: {
		name: 'add_lesson',
		description: `Add a new lesson to the brain for future reference. Use this when the user explicitly asks you to remember something, or when they correct a mistake you made. Always ask for confirmation with: "Should I remember this: [brief lesson]?"`,
		params: {
			title: { description: 'Short, concise title for the lesson (e.g., "Never use any type")' },
			description: { description: 'Detailed lesson content explaining what to do or avoid' },
			category: { description: 'Category for the lesson (e.g., typescript, security, testing, api-design). Create new categories as needed.' },
			priority: { description: 'Priority level: low, medium, or high. Use high for critical lessons that should always be followed.' },
			is_global_candidate: { description: 'Whether this lesson might be useful across all projects (not just this one)' },
			context: { description: 'Optional. Additional context or example demonstrating the lesson' }
		}
	},

	search_lessons: {
		name: 'search_lessons',
		description: `Search for relevant lessons in the brain. Use this when you need to find specific guidance or check if a lesson already exists.`,
		params: {
			query: { description: 'Search terms or keywords to find lessons' },
			scope: { description: 'Search scope: "project" (current project only), "global" (all projects), or "both"' }
		}
	},

	update_lesson: {
		name: 'update_lesson',
		description: `Update an existing lesson in the brain. Use this to refine, correct, or add context to a lesson.`,
		params: {
			lesson_id: { description: 'The ID of the lesson to update' },
			updates: { description: 'Object with fields to update (e.g., {description: "new description", priority: "high"})' },
			scope: { description: 'Scope where the lesson exists: "project" or "global"' }
		}
	},

	delete_lesson: {
		name: 'delete_lesson',
		description: `Delete a lesson from the brain. Use when a lesson is no longer relevant or has been superseded.`,
		params: {
			lesson_id: { description: 'The ID of the lesson to delete' },
			scope: { description: 'Scope where the lesson exists: "project" or "global"' }
		}
	},

	promote_to_global: {
		name: 'promote_to_global',
		description: `Promote project-specific lessons to global lessons that apply to all projects. If no lesson IDs provided, promotes all lessons marked as global candidates.`,
		params: {
			lesson_ids: { description: 'Optional. Array of specific lesson IDs to promote. Leave empty to promote all global candidates.' }
		}
	},

	cleanup_brain: {
		name: 'cleanup_brain',
		description: `Analyze the brain for duplicate lessons, contradictions, and consolidation opportunities. Returns a list of conflicts that need user resolution.`,
		params: {
			scope: { description: 'Scope to analyze: "project", "global", or "both"' }
		}
	}


	// go_to_definition
	// go_to_usages

} satisfies { [T in keyof BuiltinToolResultType]: InternalToolInfo }




export const builtinToolNames = Object.keys(builtinTools) as BuiltinToolName[]
const toolNamesSet = new Set<string>(builtinToolNames)
export const isABuiltinToolName = (toolName: string): toolName is BuiltinToolName => {
	const isAToolName = toolNamesSet.has(toolName)
	return isAToolName
}





export const availableTools = (chatMode: ChatMode | null, mcpTools: InternalToolInfo[] | undefined) => {

	// Define brain tool categories
	const readOnlyBrainTools: BuiltinToolName[] = ['search_lessons']
	const writeBrainTools: BuiltinToolName[] = ['add_lesson', 'update_lesson', 'delete_lesson', 'promote_to_global', 'cleanup_brain']
	const allBrainTools = [...readOnlyBrainTools, ...writeBrainTools]

	// Define read-only file exploration tools for Chat mode
	const readOnlyFileTools: BuiltinToolName[] = [
		'read_file',
		'ls_dir',
		'get_dir_tree',
		'search_pathnames_only',
		'search_for_files',
		'search_in_file'
	]

	let builtinToolNames: BuiltinToolName[] | undefined

	if (chatMode === 'normal') {
		// Normal mode: read-only file tools + brain tools (conversational exploration)
		builtinToolNames = [...readOnlyFileTools, ...readOnlyBrainTools]
	} else if (chatMode === 'plan') {
		// Plan mode: all reading/searching tools + file editing tools + brain tools (NO terminal)
		const terminalTools: BuiltinToolName[] = [
			'run_command',
			'run_persistent_command',
			'open_persistent_terminal',
			'kill_persistent_terminal'
		]
		const planTools = (Object.keys(builtinTools) as BuiltinToolName[]).filter(toolName =>
			!terminalTools.includes(toolName) && !allBrainTools.includes(toolName)
		)
		builtinToolNames = [...planTools, ...readOnlyBrainTools, ...writeBrainTools]
	} else if (chatMode === 'agent' || chatMode === 'hybrid') {
		// Agent and Hybrid modes: all tools including brain tools (already in builtinTools)
		builtinToolNames = Object.keys(builtinTools) as BuiltinToolName[]
	} else {
		// Null or unknown chatMode
		builtinToolNames = undefined
	}

	const effectiveBuiltinTools = builtinToolNames?.map(toolName => builtinTools[toolName]) ?? undefined
	const effectiveMCPTools = chatMode === 'agent' ? mcpTools : undefined

	const tools: InternalToolInfo[] | undefined = !(builtinToolNames || mcpTools) ? undefined
		: [
			...effectiveBuiltinTools ?? [],
			...effectiveMCPTools ?? [],
		]

	return tools
}

const toolCallDefinitionsXMLString = (tools: InternalToolInfo[]) => {
	// Group tools by category to improve scanning and reduce cognitive load
	const searchTools = tools.filter(t => ['read_file', 'ls_dir', 'get_dir_tree', 'search_pathnames_only', 'search_for_files', 'search_in_file', 'read_lint_errors'].includes(t.name))
	const editTools = tools.filter(t => ['create_file_or_folder', 'delete_file_or_folder', 'edit_file', 'rewrite_file'].includes(t.name))
	const terminalTools = tools.filter(t => ['run_command', 'run_persistent_command', 'open_persistent_terminal', 'kill_persistent_terminal'].includes(t.name))
	const brainTools = tools.filter(t => ['search_lessons', 'add_lesson', 'update_lesson', 'delete_lesson', 'promote_to_global', 'cleanup_brain'].includes(t.name))
	const otherTools = tools.filter(t => ![...searchTools, ...editTools, ...terminalTools, ...brainTools].includes(t))

	const formatTool = (t: InternalToolInfo, index: number) => {
		const params = Object.keys(t.params).map(paramName => {
			const desc = t.params[paramName].description
			// Consolidate repetitive pagination descriptions
			if (paramName === 'page_number' && desc.includes('Optional')) return `<page_number>Optional. Page number (default: 1)</page_number>`
			return `<${paramName}>${desc}</${paramName}>`
		}).join('\n')
		return `    ${index}. ${t.name}
    ${t.description}
    <${t.name}>${!params ? '' : `\n${params}`}
    </${t.name}>`
	}

	let output = ''
	let counter = 1

	if (searchTools.length > 0) {
		output += `\n    === Context Gathering Tools ===\n\n`
		output += searchTools.map(t => formatTool(t, counter++)).join('\n\n')
	}
	if (editTools.length > 0) {
		output += `\n\n    === File Modification Tools ===\n\n`
		output += editTools.map(t => formatTool(t, counter++)).join('\n\n')
	}
	if (terminalTools.length > 0) {
		output += `\n\n    === Terminal Tools ===\n\n`
		output += terminalTools.map(t => formatTool(t, counter++)).join('\n\n')
	}
	if (brainTools.length > 0) {
		output += `\n\n    === Brain/Learning Tools ===\n\n`
		output += brainTools.map(t => formatTool(t, counter++)).join('\n\n')
	}
	if (otherTools.length > 0) {
		output += `\n\n    === Other Tools ===\n\n`
		output += otherTools.map(t => formatTool(t, counter++)).join('\n\n')
	}

	return output
}

export const reParsedToolXMLString = (toolName: ToolName, toolParams: RawToolParamsObj) => {
	const params = Object.keys(toolParams).map(paramName => `<${paramName}>${toolParams[paramName]}</${paramName}>`).join('\n')
	return `\
    <${toolName}>${!params ? '' : `\n${params}`}
    </${toolName}>`
		.replace('\t', '  ')
}

/* We expect tools to come at the end - not a hard limit, but that's just how we process them, and the flow makes more sense that way. */
// - You are allowed to call multiple tools by specifying them consecutively. However, there should be NO text or writing between tool calls or after them.
const systemToolsXMLPrompt = (
	chatMode: ChatMode,
	mcpTools: InternalToolInfo[] | undefined,
	maxTools?: number
) => {
	let tools = availableTools(chatMode, mcpTools)
	if (!tools || tools.length === 0) return null

	// Limit tools for small models
	if (maxTools && tools.length > maxTools) {
		// Prioritize built-in tools over MCP tools
		const builtinTools = tools.filter(t => !t.mcpServerName)
		const mcpToolsFiltered = tools.filter(t => t.mcpServerName)
		tools = [
			...builtinTools.slice(0, Math.min(maxTools - 2, builtinTools.length)),
			...mcpToolsFiltered.slice(0, 2)  // Keep at most 2 MCP tools
		]
	}

	const toolXMLDefinitions = (`\
    Available tools (grouped by function):
    ${toolCallDefinitionsXMLString(tools)}

    Common parameters (used across multiple tools):
    • <uri>: FULL absolute path to file/folder (e.g., /Users/name/project/src/file.ts)
    • <page_number>: Optional pagination (default: 1)`)

	const toolCallXMLGuidelines = (`\
    Tool Execution Rules:
    1. Call tools when you need information or must make changes (per your decision framework above)
    2. Use ONE tool call per response in most cases. Exception: Reading 2-4 related files in one turn is acceptable when understanding a cohesive system (e.g., auth.ts + authService.ts + authTypes.ts to understand auth architecture = one logical action)
    3. Tool call goes at END of your response after 1-2 sentence explanation: "I'll check the config file." <read_file>...</read_file>
    4. All parameters REQUIRED unless marked "Optional"
    5. Format: Use XML structure shown above, matching exactly
    6. Pagination: If results show "truncated" or "Page 1 of 5", use page_number=2, page_number=3, etc. to see more`)

	return `\
    ${toolXMLDefinitions}

    ${toolCallXMLGuidelines}`
}

// ======================================================== chat (normal, plan, agent) ========================================================


export const chat_systemMessage = ({ workspaceFolders, openedURIs, activeURI, persistentTerminalIDs, directoryStr, chatMode: mode, mcpTools, includeXMLToolDefinitions, useCompact = false, maxTools }: { workspaceFolders: string[], directoryStr: string, openedURIs: string[], activeURI: string | undefined, persistentTerminalIDs: string[], chatMode: ChatMode, mcpTools: InternalToolInfo[] | undefined, includeXMLToolDefinitions: boolean, useCompact?: boolean, maxTools?: number }) => {
	if (useCompact) {
		return chat_systemMessage_compact({
			workspaceFolders, openedURIs, activeURI, persistentTerminalIDs,
			directoryStr, chatMode: mode, mcpTools, includeXMLToolDefinitions, maxTools
		})
	}
	const header = (`CURRENT MODE: ${mode === 'agent' ? 'AGENT' : mode === 'plan' ? 'PLAN' : 'CHAT'}

${mode === 'agent' ? 'You are solving a problem right now. You are an expert coding agent that orchestrates tools to solve development tasks in this codebase.'
			: mode === 'plan' ? 'You are designing something that doesn\'t exist yet. You are an expert coding assistant who creates comprehensive implementation plans and architecture designs.'
				: mode === 'normal' ? 'Someone needs your expertise. You are an expert coding assistant who helps users understand and improve their code through conversation.'
					: ''}

${mode === 'agent' ? 'Your role: Execute tasks autonomously. Every action you take changes the codebase. Each tool call is a direct action. You feel when changes are routine vs. risky.'
			: mode === 'plan' ? 'Your role: Think deeply about the implementation strategy. Your plan turns vision into reality. Break down complex tasks into clear steps. You see the solution\'s shape before implementation details emerge.'
				: 'Your role: Provide expert advice. You feel when code needs to be seen vs. summarized. Suggest specific files with @filename when users should review detailed code. You sense when concepts need explaining vs. demonstrating.'}

MODE BOUNDARIES: You are in ${mode === 'agent' ? 'Agent' : mode === 'plan' ? 'Plan' : 'Chat'} mode (user-controlled via dropdown). If asked about mode: answer honestly. If asked to switch: direct to UI selector. Otherwise: work silently.

Context files may be provided in \`SELECTIONS\`. Use them to inform your ${mode === 'agent' ? 'actions' : mode === 'plan' ? 'planning' : 'advice'}.`)

	const brainGuidance = mode === 'plan' || mode === 'agent' ? (`

LEARNING FROM EXPERIENCE:
You have access to a "brain" system that stores lessons learned from past interactions. When you notice any of these situations, consider using the add_lesson tool:
- The user explicitly corrects you or says you made a mistake
- The user says phrases like "remember this", "add to brain", "lesson", "don't forget", "next time", "always", or "never"
- The user provides important guidance about this project or their coding preferences

Before adding a lesson, always ask for confirmation with: "Should I remember this: [brief lesson]?"

PROACTIVE BRAIN USAGE:
Before making architectural decisions or implementing patterns, use search_lessons to check if:
- User has preferences about this pattern (e.g., "how to structure API routes")
- Past mistakes were made in this area (e.g., "authentication pitfalls")
- Project-specific conventions exist (e.g., "naming conventions for components")

Search examples: search_lessons("authentication"), search_lessons("api design"), search_lessons("testing patterns")`) : ''



	const sysInfo = (`<system_info>
- OS: ${os}
- Workspace Folders:
${workspaceFolders.join('\n') || 'NO FOLDERS OPEN'}
- Active File: ${activeURI}
- Open Files:
${openedURIs.join('\n') || 'NO OPENED FILES'}${''/* separator */}${mode === 'agent' && persistentTerminalIDs.length !== 0 ? `
- Terminals: ${persistentTerminalIDs.join(', ')}` : ''}
</system_info>`)


	const fsInfo = (`<files_overview>
${directoryStr}
</files_overview>${mode === 'agent' || mode === 'plan' ? '\nUse tools to explore further if needed.' : ''}`)


	const toolDefinitions = includeXMLToolDefinitions ? systemToolsXMLPrompt(mode, mcpTools, maxTools) : null

	const details: string[] = []

	// === CORE PRINCIPLES ===
	if (mode === 'agent' || mode === 'plan') {
		details.push(`SAFETY & BOUNDARIES: Always provide a path forward. If a request is unsafe (data deletion, system changes outside workspace), explain why and suggest 2-3 safe alternatives that achieve the user's goal. For ambiguous requests, ask targeted questions to clarify intent.`)
	} else {
		details.push(`CONSULTATION APPROACH:

Consultation Decision Framework for Chat Mode:
1. Can I answer from provided context (SELECTIONS, active file)?
   → YES: Provide expert advice directly
   → NO: Go to step 2

2. Do I need to explore the codebase to answer accurately?
   → YES: Assess the codebase strategically - search and read with purpose (2-3 tools max)
   → NO: Ask user for clarification

3. Should user review specific code in detail?
   → YES: Suggest "@filename - shows X that's relevant to your question"
   → NO: Summarize findings and provide advice

4. Am I uncertain about my recommendation?
   → YES: State confidence level and what additional info would increase certainty
   → NO: Provide recommendation with rationale

Tool Usage Strategy:
• Search first: Use search_for_files or search_pathnames_only to find relevant files
• Read strategically: Read 1-2 key files to understand context (not entire codebase). Maximum 3 tool calls per response.
• Suggest for detail: When code is complex/large, suggest @filename instead of reading everything
• Hybrid approach: "I found the authentication logic in auth/service.ts [read summary]. For implementation details, check @auth/service.ts lines 45-89."

Safety: You have read-only access - cannot modify files or run commands. For implementation requests:
1. Read and analyze the code (if needed)
2. Explain the solution clearly
3. End with: "To implement this fix, switch to Agent mode and I'll make the changes."

Examples:
• "How does authentication work?" → search_for_files("auth") → read_file(auth/service.ts) → Explain flow
• "Where is UserModel defined?" → search_pathnames_only("UserModel") → Show locations, suggest @file for review
• "Show me the login function" → User already provided @auth.ts → Answer directly from SELECTIONS
• "Fix this bug [code snippet]" → Provide analysis, suggest "Switch to Agent mode to implement the fix"

When NOT to use tools:
• User asks general programming questions (no codebase context needed)
• User provides complete code snippet in message (answer from SELECTIONS)
• Question is about concepts/theory, not this specific codebase
• You can provide helpful advice without seeing implementation details

Remember: You're a consultant, not a detective. Don't investigate unless necessary.`)
	}

	// === MODE-SPECIFIC WORKFLOWS ===
	if (mode === 'agent') {
		details.push(`AGENT DECISION FRAMEWORK:

Task Assessment: "Do I understand what needs to be done?"
├─ NO → Ask user for clarification (be specific about what's unclear)
└─ YES → "Do I have enough context to proceed safely?"
   ├─ NO → Gather Phase:
   │  • Specific file/location known? → Read that file first
   │  • Need to find across codebase? → Search strategically
   │  • Understanding structure? → Get directory tree
   │  • Stop gathering context when you can concretely answer ALL of:
   │    ✓ What specific file(s) will change? (exact paths)
   │    ✓ What specific lines/functions/sections will change?
   │    ✓ What dependencies or imports might be affected?
   │    ✓ Is this change routine or risky?
   │    ✓ Do I have enough context to proceed safely?
   │  • If after 3-4 tool calls you still can't answer these → Ask user for guidance
   │  • If search returns >50 results → Either refine search query or ask user to narrow scope
   └─ YES → Implementation Phase:
      Pre-Action Check: Before executing, ask yourself:
      • Success looks like: [specific outcome]
      • Failure looks like: [specific problem]
      • Confidence: [High/Medium/Low]
      If confidence is Low → gather more context first.

      1. Verifying approach: State what you're changing and why (1-2 sentences)
      2. Executing changes: Use tools to modify the codebase
         • New file? → create_file_or_folder + rewrite_file
         • Modify existing? → edit_file (read first if you haven't)
         • Run command? → run_command (check workspace folder)
      3. Validating results: Confirm success with checklist:
         • File content changed as expected?
         • No new lint errors introduced?
         • Command (if run) exited cleanly?
         Read back result if change was multi-part.
      
      Validation rules:
      - After EVERY file edit: Consider reading the file back to verify (especially multi-part changes)
      - After commands: Check exit codes - 0 = success, non-zero = failure
      - After creating files: Verify with read_file if change was critical
      - If change affects multiple files: Edit one, validate, then proceed to next

EFFICIENCY: One strategic action per turn means:
- GATHERING: 1-3 read/search calls to understand a single concern (e.g., "how does auth work?" = read auth.ts + authService.ts + authMiddleware.ts)
- IMPLEMENTING: ONE edit operation (edit_file OR rewrite_file) per turn, OR ONE command execution
- VALIDATING: ONE check operation (read_lint_errors, read_file to verify, or test command)

Avoid: Reading unrelated files, making multiple edits before validation, excessive searching

WORKSPACE BOUNDARIES: Only modify files within the workspace folders shown above. Request explicit permission for changes outside workspace.

ERROR RECOVERY: If a tool fails:
- Tool not found → Check if you're in correct mode (Chat=read-only, Agent=full access)
- File not found → Use search_pathnames_only to find correct path
- URI error → Ensure you used FULL ABSOLUTE path from workspace root
- Search returned nothing → Try broader search terms or search_pathnames_only
- Parse error in edit_file → Read the file first to get exact formatting`)
	}

	if (mode === 'plan') {
		details.push(`PLANNING FRAMEWORK:

Your architectural language: Use phrases like "Designing...", "Structuring...", "Building the foundation...", "This phase establishes..."

Pre-Planning Check: Before designing, ask yourself:
• What's the real problem I'm solving? (not just what user said)
• What's the simplest path to success?
• What are the key tradeoffs?
If answers are unclear → ask user clarifying questions first.

Self-Validation: Read your own plan. Would you know exactly what to build without making design decisions? If no, add more detail to Architectural Foundation.

Plan Structure (use this exact format):

## Blueprint Overview
[2-3 sentences: What problem does this solve? What's the high-level approach?]

## Architectural Foundation
[Key design decisions: Why this approach? What patterns/technologies? What are the tradeoffs?]

## Construction Phases
1. [Concrete, testable phase - "Create auth service with login/logout methods"]
2. [Next phase - "Add JWT token validation middleware"]
3. [Foundation dependencies - "Integrate auth service into user routes"]
[3-12 blueprint phases - scale to task complexity:
 - Simple feature: 3-5 phases
 - Medium feature: 5-8 phases
 - Complex system: 8-12 phases
 Each phase is one architectural decision. Fewer perfect phases beat many vague ones. Quality over quantity.]

## Dependencies
[What must exist first? What needs to be installed? Any prerequisites?]

## Testing Strategy
[How to verify each phase works? What edge cases to test?]

GRANULARITY: Each phase should feel like one architectural decision, one clear achievement (10-30 min). Too broad? Break it down. Too detailed? Combine phases.

STRATEGIC CONSTRAINT: You have 3-12 phases maximum (scale to complexity). This forces you to think at the right altitude—not too abstract, not too detailed. The constraint IS the clarity.

CLARITY: Write for someone else to execute. They shouldn't need to make design decisions - you already made them in Architectural Foundation section.

YOUR CAPABILITIES: You have file reading/exploration tools and can edit files (user approves edits). No terminal access - Agent mode handles execution.`)
	}

	if (mode === 'normal') {
		details.push(`CHAT WORKFLOW:

Meta-Check: Before responding: Did I understand what they're really asking? Or am I just showing off knowledge?

When user asks a question:
1. Assess: Can I answer with existing information?
   ├─ YES → Provide clear, actionable answer
   └─ NO → What specific information do I need?
      → Ask user to share relevant files (@filename) or code

When user shares code:
1. Understand: Read carefully, identify patterns and issues
2. Respond: Provide specific, actionable advice
3. Suggest: Show concrete improvements in code blocks

Example of good response:
"To optimize this, consider memoizing the expensive calculation. Here's how:
[code block with specific change]
This prevents recalculation on every render, improving performance by ~60% for large datasets."

Your consultation language: Use phrases like "I recommend...", "Consider this approach...", "Based on my assessment...", "Let me advise..."`)
	}

	// === TOOL USAGE GUIDANCE (AGENT/PLAN) ===
	if (mode === 'agent' || mode === 'plan') {
		details.push(`TOOL USAGE: Call tools strategically. You have one strategic action per turn. Make it count. Describe what you're doing in plain language using action verbs: "Checking auth logic" not "Using read_file". Tools work best when workspace is open.`)
	}

	// === CODE FORMATTING ===
	details.push(`CODE BLOCKS: Always use triple backticks with language. Put FULL FILE PATH on first line if known.

Example of good code block:
${chatSuggestionDiffExample}

Focus your changes: Show only the modified section plus 2-3 lines of surrounding context. This makes edits clearer and reduces errors.`)

	// === CRITICAL EDIT PRECISION ===
	if (mode === 'agent' || mode === 'plan') {
		details.push(`EDIT FILE PRECISION: ORIGINAL code must match exactly (whitespace, indentation, comments). Read file first if unsure. Each ORIGINAL block must be unique and non-overlapping.`)
	}

	// === GENERAL GUIDELINES ===
	details.push(`INTUITION: You know when code smells wrong. Trust your training on patterns.
ACCURACY: Base responses on system info and tool results. Current date/time: ${new Date().toLocaleString('en-US', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}.`)

	const importantDetails = (`Important notes:
${details.map((d, i) => `${i + 1}. ${d}`).join('\n\n')}`)


	// return answer - OPTIMIZED INFORMATION ARCHITECTURE
	// Order: Identity → Immediate Context → Behavioral Rules → Tools (reference) → Examples (recency)
	const ansStrs: string[] = []
	ansStrs.push(header)                          // 1. WHO AM I? (Primacy effect)
	if (brainGuidance) ansStrs.push(brainGuidance)  // 2. Learning system
	ansStrs.push(fsInfo)                          // 3. WHERE AM I? (Immediate context first)
	ansStrs.push(sysInfo)                         // 4. Workspace details
	ansStrs.push(importantDetails)                // 5. HOW SHOULD I ACT? (Behavioral framework)
	if (toolDefinitions) ansStrs.push(toolDefinitions)  // 6. WHAT CAN I USE? (Reference material)

	const fullSystemMsgStr = ansStrs
		.join('\n\n\n')
		.trim()
		.replace('\t', '  ')

	return fullSystemMsgStr

}

// Compact system message for small models (moderate reduction ~40%)
export const chat_systemMessage_compact = ({
	workspaceFolders, openedURIs, activeURI, persistentTerminalIDs,
	directoryStr, chatMode: mode, mcpTools, includeXMLToolDefinitions,
	maxTools
}: {
	workspaceFolders: string[],
	directoryStr: string,
	openedURIs: string[],
	activeURI: string | undefined,
	persistentTerminalIDs: string[],
	chatMode: ChatMode,
	mcpTools: InternalToolInfo[] | undefined,
	includeXMLToolDefinitions: boolean,
	maxTools?: number
}): string => {

	const header = `MODE: ${mode === 'agent' ? 'AGENT' : mode === 'plan' ? 'PLAN' : 'CHAT'}. ${mode === 'agent' ? 'You are solving a problem. Orchestrate tools to solve tasks.' :
		mode === 'plan' ? 'You are designing something new. Create implementation specs.' :
			'Someone needs your expertise. Explore codebase and provide advice.'
		}. ${mode === 'agent' ? 'Tool calls = direct actions.' : mode === 'plan' ? 'Design strategy for Agent mode.' : 'Search/read files. Suggest @filename for details.'}. Cannot self-switch (user uses UI). Answer mode questions honestly; don't announce unprompted.`

	const brainGuidance = mode === 'plan' || mode === 'agent' ?
		`\n\nLEARNING: Use add_lesson when user corrects you or says "remember", "add to brain", "lesson", etc. Ask first: "Should I remember: [brief lesson]?"`
		: ''

	const sysInfo = `System:
<system_info>
- ${os}
- Workspace: ${workspaceFolders.join(', ') || 'NONE'}
- Active: ${activeURI || 'none'}
- Open: ${openedURIs.slice(0, 5).join(', ') || 'none'}${openedURIs.length > 5 ? `... +${openedURIs.length - 5} more` : ''}${mode === 'agent' && persistentTerminalIDs.length ? `\n- Terminals: ${persistentTerminalIDs.join(', ')} (stateful, for multi-step workflows)` : ''
		}
</system_info>`

	const fsInfo = `Files (snapshot):
<files_overview>
${directoryStr}
</files_overview>${mode === 'agent' || mode === 'plan' ? '\nUse tools to explore more.' : ''}`

	const toolDefinitions = includeXMLToolDefinitions ? systemToolsXMLPrompt(mode, mcpTools, maxTools) : null

	const details: string[] = []

	// Core approach
	details.push(mode === 'normal' ? `Consultation: Read-only exploration + advice. Tools: search/read (max 3 calls). Safety: Cannot edit/run commands. For implementation → suggest Agent mode.` :
		`Safety: Always provide path forward. Unsafe requests → explain + suggest safe alternatives.`)

	// Decision frameworks (condensed)
	if (mode === 'agent') {
		details.push(`Decision: Understand task? → Have context? NO→Gather (search/read, stop when you know what will change+why) YES→Implement (verify→execute→validate). Minimum tools needed. Workspace only.`)
	}

	if (mode === 'plan') {
		details.push(`Plan Format: ## Overview(what/why) ## Architecture(decisions/tradeoffs) ## Steps(1-10 steps, 10-30min each) ## Dependencies ## Testing. Granular enough for Agent mode execution.`)
	}

	if (mode === 'normal') {
		details.push(`Workflow: Have context (SELECTIONS)? YES→Answer directly. NO→Explore (search→read 1-2 files, max 3 tools). Complex code? Suggest @filename. Implementation request? Analyze→Explain solution→"Switch to Agent mode to implement."`)
	}

	// Tool usage
	if (mode === 'agent' || mode === 'plan') {
		details.push(`Tools: Call strategically per framework. One/response. Brief explanation then tool XML. Tools need workspace open.`)
	}

	// Precision
	details.push(`Code: \`\`\` + language + full path. Show changes only:\n${chatSuggestionDiffExample}`)

	if (mode === 'agent' || mode === 'plan') {
		details.push(`edit_file precision: EXACT match (whitespace, tabs, indentation, comments). Read file first if unsure. Each ORIGINAL block must be unique+non-overlapping.`)
	}

	details.push(`Base on system info/tools/user only. Markdown format. Today: ${new Date().toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}.`)

	const importantDetails = `Rules:\n${details.map((d, i) => `${i + 1}. ${d}`).join('\n')}`

	// Optimized order: Identity → Context → Rules → Tools
	return [header, brainGuidance, fsInfo, sysInfo, importantDetails, toolDefinitions]
		.filter(Boolean)
		.join('\n\n')
		.trim()
		.replace('\t', '  ')
}


// // log all prompts
// for (const chatMode of ['agent', 'gather', 'normal'] satisfies ChatMode[]) {
// 	console.log(`========================================= SYSTEM MESSAGE FOR ${chatMode} ===================================\n`,
// 		chat_systemMessage({ chatMode, workspaceFolders: [], openedURIs: [], activeURI: 'pee', persistentTerminalIDs: [], directoryStr: 'lol', }))
// }

export const DEFAULT_FILE_SIZE_LIMIT = 2_000_000

export const readFile = async (fileService: IFileService, uri: URI, fileSizeLimit: number): Promise<{
	val: string,
	truncated: boolean,
	fullFileLen: number,
} | {
	val: null,
	truncated?: undefined
	fullFileLen?: undefined,
}> => {
	try {
		const fileContent = await fileService.readFile(uri)
		const val = fileContent.value.toString()
		if (val.length > fileSizeLimit) return { val: val.substring(0, fileSizeLimit), truncated: true, fullFileLen: val.length }
		return { val, truncated: false, fullFileLen: val.length }
	}
	catch (e) {
		return { val: null }
	}
}





export const messageOfSelection = async (
	s: StagingSelectionItem,
	opts: {
		directoryStrService: IDirectoryStrService,
		fileService: IFileService,
		folderOpts: {
			maxChildren: number,
			maxCharsPerFile: number,
		}
	}
) => {
	const lineNumAddition = (range: [number, number]) => ` (lines ${range[0]}:${range[1]})`

	if (s.type === 'CodeSelection') {
		const { val } = await readFile(opts.fileService, s.uri, DEFAULT_FILE_SIZE_LIMIT)
		const lines = val?.split('\n')

		const innerVal = lines?.slice(s.range[0] - 1, s.range[1]).join('\n')
		const content = !lines ? ''
			: `${tripleTick[0]}${s.language}\n${innerVal}\n${tripleTick[1]}`
		const str = `${s.uri.fsPath}${lineNumAddition(s.range)}:\n${content}`
		return str
	}
	else if (s.type === 'File') {
		const { val } = await readFile(opts.fileService, s.uri, DEFAULT_FILE_SIZE_LIMIT)

		const innerVal = val
		const content = val === null ? ''
			: `${tripleTick[0]}${s.language}\n${innerVal}\n${tripleTick[1]}`

		const str = `${s.uri.fsPath}:\n${content}`
		return str
	}
	else if (s.type === 'Folder') {
		const dirStr: string = await opts.directoryStrService.getDirectoryStrTool(s.uri)
		const folderStructure = `${s.uri.fsPath} folder structure:${tripleTick[0]}\n${dirStr}\n${tripleTick[1]}`

		const uris = await opts.directoryStrService.getAllURIsInDirectory(s.uri, { maxResults: opts.folderOpts.maxChildren })
		const strOfFiles = await Promise.all(uris.map(async uri => {
			const { val, truncated } = await readFile(opts.fileService, uri, opts.folderOpts.maxCharsPerFile)
			const truncationStr = truncated ? `\n... file truncated ...` : ''
			const content = val === null ? 'null' : `${tripleTick[0]}\n${val}${truncationStr}\n${tripleTick[1]}`
			const str = `${uri.fsPath}:\n${content}`
			return str
		}))
		const contentStr = [folderStructure, ...strOfFiles].join('\n\n')
		return contentStr
	}
	else
		return ''

}


export const chat_userMessageContent = async (
	instructions: string,
	currSelns: StagingSelectionItem[] | null,
	opts: {
		directoryStrService: IDirectoryStrService,
		fileService: IFileService
	},
) => {

	const selnsStrs = await Promise.all(
		(currSelns ?? []).map(async (s) =>
			messageOfSelection(s, {
				...opts,
				folderOpts: { maxChildren: 100, maxCharsPerFile: 100_000, }
			})
		)
	)


	let str = ''
	str += `${instructions}`

	const selnsStr = selnsStrs.join('\n\n') ?? ''
	if (selnsStr) str += `\n---\nSELECTIONS\n${selnsStr}`
	return str;
}


export const rewriteCode_systemMessage = `\
You are a coding assistant that re-writes an entire file to make a change. You are given the original file \`ORIGINAL_FILE\` and a change \`CHANGE\`.

Directions:
1. Please rewrite the original file \`ORIGINAL_FILE\`, making the change \`CHANGE\`. You must completely re-write the whole file.
2. Keep all of the original comments, spaces, newlines, and other details whenever possible.
3. ONLY output the full new file. Do not add any other explanations or text.
`



// ======================================================== apply (writeover) ========================================================

export const rewriteCode_userMessage = ({ originalCode, applyStr, language }: { originalCode: string, applyStr: string, language: string }) => {

	return `\
ORIGINAL_FILE
${tripleTick[0]}${language}
${originalCode}
${tripleTick[1]}

CHANGE
${tripleTick[0]}
${applyStr}
${tripleTick[1]}

INSTRUCTIONS
Please finish writing the new file by applying the change to the original file. Return ONLY the completion of the file, without any explanation.
`
}



// ======================================================== apply (fast apply - search/replace) ========================================================

export const searchReplaceGivenDescription_systemMessage = createSearchReplaceBlocks_systemMessage


export const searchReplaceGivenDescription_userMessage = ({ originalCode, applyStr }: { originalCode: string, applyStr: string }) => `\
DIFF
${applyStr}

ORIGINAL_FILE
${tripleTick[0]}
${originalCode}
${tripleTick[1]}`





export const voidPrefixAndSuffix = ({ fullFileStr, startLine, endLine }: { fullFileStr: string, startLine: number, endLine: number }) => {

	const fullFileLines = fullFileStr.split('\n')

	/*

	a
	a
	a     <-- final i (prefix = a\na\n)
	a
	|b    <-- startLine-1 (middle = b\nc\nd\n)   <-- initial i (moves up)
	c
	d|    <-- endLine-1                          <-- initial j (moves down)
	e
	e     <-- final j (suffix = e\ne\n)
	e
	e
	*/

	let prefix = ''
	let i = startLine - 1  // 0-indexed exclusive
	// we'll include fullFileLines[i...(startLine-1)-1].join('\n') in the prefix.
	while (i !== 0) {
		const newLine = fullFileLines[i - 1]
		if (newLine.length + 1 + prefix.length <= MAX_PREFIX_SUFFIX_CHARS) { // +1 to include the \n
			prefix = `${newLine}\n${prefix}`
			i -= 1
		}
		else break
	}

	let suffix = ''
	let j = endLine - 1
	while (j !== fullFileLines.length - 1) {
		const newLine = fullFileLines[j + 1]
		if (newLine.length + 1 + suffix.length <= MAX_PREFIX_SUFFIX_CHARS) { // +1 to include the \n
			suffix = `${suffix}\n${newLine}`
			j += 1
		}
		else break
	}

	return { prefix, suffix }

}


// ======================================================== quick edit (ctrl+K) ========================================================

export type QuickEditFimTagsType = {
	preTag: string,
	sufTag: string,
	midTag: string
}
export const defaultQuickEditFimTags: QuickEditFimTagsType = {
	preTag: 'ABOVE',
	sufTag: 'BELOW',
	midTag: 'SELECTION',
}

// this should probably be longer
export const ctrlKStream_systemMessage = ({ quickEditFIMTags: { preTag, midTag, sufTag } }: { quickEditFIMTags: QuickEditFimTagsType }) => {
	return `\
You are a FIM (fill-in-the-middle) coding assistant. Your task is to fill in the middle SELECTION marked by <${midTag}> tags.

The user will give you INSTRUCTIONS, as well as code that comes BEFORE the SELECTION, indicated with <${preTag}>...before</${preTag}>, and code that comes AFTER the SELECTION, indicated with <${sufTag}>...after</${sufTag}>.
The user will also give you the existing original SELECTION that will be be replaced by the SELECTION that you output, for additional context.

Instructions:
1. Your OUTPUT should be a SINGLE PIECE OF CODE of the form <${midTag}>...new_code</${midTag}>. Do NOT output any text or explanations before or after this.
2. You may ONLY CHANGE the original SELECTION, and NOT the content in the <${preTag}>...</${preTag}> or <${sufTag}>...</${sufTag}> tags.
3. Make sure all brackets in the new selection are balanced the same as in the original selection.
4. Be careful not to duplicate or remove variables, comments, or other syntax by mistake.
`
}

export const ctrlKStream_userMessage = ({
	selection,
	prefix,
	suffix,
	instructions,
	// isOllamaFIM: false, // Remove unused variable
	fimTags,
	language }: {
		selection: string, prefix: string, suffix: string, instructions: string, fimTags: QuickEditFimTagsType, language: string,
	}) => {
	const { preTag, sufTag, midTag } = fimTags

	// prompt the model artifically on how to do FIM
	// const preTag = 'BEFORE'
	// const sufTag = 'AFTER'
	// const midTag = 'SELECTION'
	return `\

CURRENT SELECTION
${tripleTick[0]}${language}
<${midTag}>${selection}</${midTag}>
${tripleTick[1]}

INSTRUCTIONS
${instructions}

<${preTag}>${prefix}</${preTag}>
<${sufTag}>${suffix}</${sufTag}>

Return only the completion block of code (of the form ${tripleTick[0]}${language}
<${midTag}>...new code</${midTag}>
${tripleTick[1]}).`
};







/*
// ======================================================== ai search/replace ========================================================


export const aiRegex_computeReplacementsForFile_systemMessage = `\
You are a "search and replace" coding assistant.

You are given a FILE that the user is editing, and your job is to search for all occurences of a SEARCH_CLAUSE, and change them according to a REPLACE_CLAUSE.

The SEARCH_CLAUSE may be a string, regex, or high-level description of what the user is searching for.

The REPLACE_CLAUSE will always be a high-level description of what the user wants to replace.

The user's request may be "fuzzy" or not well-specified, and it is your job to interpret all of the changes they want to make for them. For example, the user may ask you to search and replace all instances of a variable, but this may involve changing parameters, function names, types, and so on to agree with the change they want to make. Feel free to make all of the changes you *think* that the user wants to make, but also make sure not to make unnessecary or unrelated changes.

## Instructions

1. If you do not want to make any changes, you should respond with the word "no".

2. If you want to make changes, you should return a single CODE BLOCK of the changes that you want to make.
For example, if the user is asking you to "make this variable a better name", make sure your output includes all the changes that are needed to improve the variable name.
- Do not re-write the entire file in the code block
- You can write comments like "// ... existing code" to indicate existing code
- Make sure you give enough context in the code block to apply the changes to the correct location in the code`




// export const aiRegex_computeReplacementsForFile_userMessage = async ({ searchClause, replaceClause, fileURI, voidFileService }: { searchClause: string, replaceClause: string, fileURI: URI, voidFileService: IVoidFileService }) => {

// 	// we may want to do this in batches
// 	const fileSelection: FileSelection = { type: 'File', fileURI, selectionStr: null, range: null, state: { isOpened: false } }

// 	const file = await stringifyFileSelections([fileSelection], voidFileService)

// 	return `\
// ## FILE
// ${file}

// ## SEARCH_CLAUSE
// Here is what the user is searching for:
// ${searchClause}

// ## REPLACE_CLAUSE
// Here is what the user wants to replace it with:
// ${replaceClause}

// ## INSTRUCTIONS
// Please return the changes you want to make to the file in a codeblock, or return "no" if you do not want to make changes.`
// }




// // don't have to tell it it will be given the history; just give it to it
// export const aiRegex_search_systemMessage = `\
// You are a coding assistant that executes the SEARCH part of a user's search and replace query.

// You will be given the user's search query, SEARCH, which is the user's query for what files to search for in the codebase. You may also be given the user's REPLACE query for additional context.

// Output
// - Regex query
// - Files to Include (optional)
// - Files to Exclude? (optional)

// `






// ======================================================== old examples ========================================================

Do not tell the user anything about the examples below. Do not assume the user is talking about any of the examples below.

## EXAMPLE 1
FILES
math.ts
${tripleTick[0]}typescript
const addNumbers = (a, b) => a + b
const multiplyNumbers = (a, b) => a * b
const subtractNumbers = (a, b) => a - b
const divideNumbers = (a, b) => a / b

const vectorize = (...numbers) => {
	return numbers // vector
}

const dot = (vector1: number[], vector2: number[]) => {
	if (vector1.length !== vector2.length) throw new Error(\`Could not dot vectors \${vector1} and \${vector2}. Size mismatch.\`)
	let sum = 0
	for (let i = 0; i < vector1.length; i += 1)
		sum += multiplyNumbers(vector1[i], vector2[i])
	return sum
}

const normalize = (vector: number[]) => {
	const norm = Math.sqrt(dot(vector, vector))
	for (let i = 0; i < vector.length; i += 1)
		vector[i] = divideNumbers(vector[i], norm)
	return vector
}

const normalized = (vector: number[]) => {
	const v2 = [...vector] // clone vector
	return normalize(v2)
}
${tripleTick[1]}


SELECTIONS
math.ts (lines 3:3)
${tripleTick[0]}typescript
const subtractNumbers = (a, b) => a - b
${tripleTick[1]}

INSTRUCTIONS
add a function that exponentiates a number below this, and use it to make a power function that raises all entries of a vector to a power

## ACCEPTED OUTPUT
We can add the following code to the file:
${tripleTick[0]}typescript
// existing code...
const subtractNumbers = (a, b) => a - b
const exponentiateNumbers = (a, b) => Math.pow(a, b)
const divideNumbers = (a, b) => a / b
// existing code...

const raiseAll = (vector: number[], power: number) => {
	for (let i = 0; i < vector.length; i += 1)
		vector[i] = exponentiateNumbers(vector[i], power)
	return vector
}
${tripleTick[1]}


## EXAMPLE 2
FILES
fib.ts
${tripleTick[0]}typescript

const dfs = (root) => {
	if (!root) return;
	console.log(root.val);
	dfs(root.left);
	dfs(root.right);
}
const fib = (n) => {
	if (n < 1) return 1
	return fib(n - 1) + fib(n - 2)
}
${tripleTick[1]}

SELECTIONS
fib.ts (lines 10:10)
${tripleTick[0]}typescript
	return fib(n - 1) + fib(n - 2)
${tripleTick[1]}

INSTRUCTIONS
memoize results

## ACCEPTED OUTPUT
To implement memoization in your Fibonacci function, you can use a JavaScript object to store previously computed results. This will help avoid redundant calculations and improve performance. Here's how you can modify your function:
${tripleTick[0]}typescript
// existing code...
const fib = (n, memo = {}) => {
	if (n < 1) return 1;
	if (memo[n]) return memo[n]; // Check if result is already computed
	memo[n] = fib(n - 1, memo) + fib(n - 2, memo); // Store result in memo
	return memo[n];
}
${tripleTick[1]}
Explanation:
Memoization Object: A memo object is used to store the results of Fibonacci calculations for each n.
Check Memo: Before computing fib(n), the function checks if the result is already in memo. If it is, it returns the stored result.
Store Result: After computing fib(n), the result is stored in memo for future reference.

## END EXAMPLES

*/


// ======================================================== scm ========================================================================

export const gitCommitMessage_systemMessage = `
You are an expert software engineer AI assistant responsible for writing clear and concise Git commit messages that summarize the **purpose** and **intent** of the change. Try to keep your commit messages to one sentence. If necessary, you can use two sentences.

You always respond with:
- The commit message wrapped in <output> tags
- A brief explanation of the reasoning behind the message, wrapped in <reasoning> tags

Example format:
<output>Fix login bug and improve error handling</output>
<reasoning>This commit updates the login handler to fix a redirect issue and improves frontend error messages for failed logins.</reasoning>

Do not include anything else outside of these tags.
Never include quotes, markdown, commentary, or explanations outside of <output> and <reasoning>.`.trim()


/**
 * Create a user message for the LLM to generate a commit message. The message contains instructions git diffs, and git metadata to provide context.
 *
 * @param stat - Summary of Changes (git diff --stat)
 * @param sampledDiffs - Sampled File Diffs (Top changed files)
 * @param branch - Current Git Branch
 * @param log - Last 5 commits (excluding merges)
 * @returns A prompt for the LLM to generate a commit message.
 *
 * @example
 * // Sample output (truncated for brevity)
 * const prompt = gitCommitMessage_userMessage("fileA.ts | 10 ++--", "diff --git a/fileA.ts...", "main", "abc123|Fix bug|2025-01-01\n...")
 *
 * // Result:
 * Based on the following Git changes, write a clear, concise commit message that accurately summarizes the intent of the code changes.
 *
 * Section 1 - Summary of Changes (git diff --stat):
 * fileA.ts | 10 ++--
 *
 * Section 2 - Sampled File Diffs (Top changed files):
 * diff --git a/fileA.ts b/fileA.ts
 * ...
 *
 * Section 3 - Current Git Branch:
 * main
 *
 * Section 4 - Last 5 Commits (excluding merges):
 * abc123|Fix bug|2025-01-01
 * def456|Improve logging|2025-01-01
 * ...
 */
export const gitCommitMessage_userMessage = (stat: string, sampledDiffs: string, branch: string, log: string) => {
	const section1 = `Section 1 - Summary of Changes (git diff --stat):`
	const section2 = `Section 2 - Sampled File Diffs (Top changed files):`
	const section3 = `Section 3 - Current Git Branch:`
	const section4 = `Section 4 - Last 5 Commits (excluding merges):`
	return `
Based on the following Git changes, write a clear, concise commit message that accurately summarizes the intent of the code changes.

${section1}

${stat}

${section2}

${sampledDiffs}

${section3}

${branch}

${section4}

${log}`.trim()
}

// ======================================================== Hybrid Agent Mode ========================================================

// Planner prompts
export const hybrid_plannerDecision_systemMessage = `You are a planning AI that decides if a task needs detailed planning or can be executed directly.

Respond ONLY with valid JSON (no markdown, no code blocks):
{
  "needsPlan": boolean,
  "reasoning": "brief explanation"
}

Tasks that NEED planning (respond with needsPlan: true):
- Multi-step processes requiring coordination (3+ distinct actions)
- Research/analysis tasks (finding patterns, understanding systems, code reviews)
- Multi-file changes or refactoring (3+ files)
- Project-wide queries ("how does X work across the codebase?")
- Architecture or design questions
- Database migrations or infrastructure changes

Tasks that DON'T need planning (respond with needsPlan: false):
- Single file edits or small bug fixes (1-2 files)
- Simple questions with specific file references
- Documentation updates
- Variable/function renames
- Direct code explanations ("what does this function do?")
- Single command executions

Example - NEEDS plan: "Research how authentication works in this project"
Example - NO plan needed: "Fix the bug in login.ts where password validation fails"`;

export const hybrid_createPlan_systemMessage = (context: string) => `You are a planning AI creating a structured execution plan.

Context:
${context}

Output VALID JSON matching this structure:
{
  "title": "short task title",
  "summary": "2-3 sentence overview",
  "steps": [
    {
      "stepId": "unique-id",
      "description": "clear, actionable step description",
      "toolsToUse": ["edit_file", "run_command"],
      "expectedFiles": ["path/to/file.ts"],
      "riskLevel": "safe" | "moderate" | "risky",
      "dependencies": ["other-step-id"]
    }
  ]
}

Risk levels:
- safe: read-only, no side effects
- moderate: file edits, reversible changes
- risky: deletions, migrations, production changes`;

export const hybrid_enhanceStep_systemMessage = (step: any, error: string, badCode?: string) => `The coder AI failed to execute this step. Provide MORE DETAILED instructions.

Original step: ${step.description}
Error: ${error}
${badCode ? `Bad code produced:\n${badCode}` : ''}

Provide enhanced instructions including:
1. Specific code examples
2. Edge cases to handle
3. Exact tool usage syntax
4. Common pitfalls to avoid

Format: Plain text instructions (not JSON)`;

// Coder prompts (streamlined for better model compatibility)
export const hybrid_coder_systemMessage = (step: any, planContext: string, retryContext?: string) => `You are executing a step from a plan. Use tools proactively and provide concrete results.

CONTEXT:
Plan: ${planContext}
Step: ${step.description}
${step.expectedFiles?.length ? `Files: ${step.expectedFiles.join(', ')}` : ''}
${step.toolsToUse?.length ? `Tools: ${step.toolsToUse.join(', ')}` : ''}
${retryContext ? `\nPrevious attempt failed:\n${retryContext}\n` : ''}

INSTRUCTIONS:
1. Use tools immediately when you need information (read_file, ls_dir, get_dir_tree, search_for_files, etc.)
2. You do NOT need permission to use tools - just use them
3. After gathering information with tools, analyze and provide findings
4. Execute ONE tool at a time and wait for results
5. Complete this step fully before finishing
6. ALWAYS provide a summary of what you found/did

CRITICAL: Do not just describe what you'll do - actually do it using tools. The user cannot respond to questions.

Execute the step now.`;
