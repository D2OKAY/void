<!-- 6df1e3e6-2214-407b-ba8c-ae067a40051b 385f4dd5-8dab-431c-ab30-441f114749e8 -->
# Plan: Refactor Prompts Structure (Conservative Approach + Build Safety)

## Blueprint Overview

We will break down the monolithic `prompts.ts` (1500+ lines) into domain-specific files while keeping `prompts.ts` as a "barrel file" (re-exporter). This ensures backward compatibility.

**Conservative Strategy**: We will NOT rewrite the internal logic of `chat_systemMessage`. The mode-specific conditional logic (`if (mode === 'agent')`) will remain embedded. We are ONLY splitting files and organizing exports, not changing architecture.

**Critical Safeguards**:

- Git branch before starting
- Commit after each phase
- Function-name-based extraction (not line numbers)
- External import documentation
- Baseline comparison testing
- **VSCode build system validation** (NEW)
- **Bundle size regression testing** (NEW)
- **Electron main process testing** (NEW)
- **Automated prompt snapshot tests** (NEW)

## Architectural Foundation

**Barrel File Pattern**: [`src/vs/workbench/contrib/void/common/prompt/prompts.ts`](src/vs/workbench/contrib/void/common/prompt/prompts.ts) becomes:

```typescript
// CRITICAL: Use explicit re-exports instead of export * to preserve tree-shaking
// VSCode's esbuild bundler needs to statically analyze which exports are used
export {
  // Common exports
  tripleTick,
  MAX_DIRSTR_CHARS_TOTAL_BEGINNING,
  MAX_DIRSTR_CHARS_TOTAL_TOOL,
  MAX_DIRSTR_RESULTS_TOTAL_BEGINNING,
  MAX_DIRSTR_RESULTS_TOTAL_TOOL,
  MAX_FILE_CHARS_PAGE,
  MAX_CHILDREN_URIs_PAGE,
  MAX_TERMINAL_CHARS,
  MAX_TERMINAL_INACTIVE_TIME,
  MAX_TERMINAL_BG_COMMAND_TIME,
  MAX_PREFIX_SUFFIX_CHARS,
  ORIGINAL,
  DIVIDER,
  FINAL,
  builtinTools,
  builtinToolNames,
  isABuiltinToolName,
  availableTools,
  reParsedToolXMLString,
  DEFAULT_FILE_SIZE_LIMIT,
  readFile,
  voidPrefixAndSuffix,
  // ... (list ALL exports explicitly)
} from './prompts-common.js';

// Type exports (MUST use 'export type' for types only)
export type { InternalToolInfo, SnakeCase, SnakeCaseKeys } from './prompts-common.js';

export { gitCommitMessage_systemMessage, gitCommitMessage_userMessage } from './prompts-scm.js';

export {
  rewriteCode_systemMessage,
  rewriteCode_userMessage,
  searchReplaceGivenDescription_systemMessage,
  searchReplaceGivenDescription_userMessage,
  defaultQuickEditFimTags,
  ctrlKStream_systemMessage,
  ctrlKStream_userMessage,
} from './prompts-edit.js';
export type { QuickEditFimTagsType } from './prompts-edit.js';

export {
  hybrid_plannerDecision_systemMessage,
  hybrid_createPlan_systemMessage,
  hybrid_enhanceStep_systemMessage,
  hybrid_coder_systemMessage,
} from './prompts-hybrid.js';

export {
  chat_systemMessage,
  chat_systemMessage_compact,
  messageOfSelection,
  chat_userMessageContent,
} from './prompts-system.js';
```

**Why explicit exports?** Barrel exports (`export *`) can break VSCode's tree-shaking optimization, potentially bundling the entire prompts file unnecessarily.

**File Organization**:

- `prompts-common.ts`: Foundation with zero dependencies on other prompt files
- `prompts-scm.ts`: Git commit message generation
- `prompts-edit.ts`: Code modification prompts (Ctrl+K, rewrite, search/replace)
- `prompts-hybrid.ts`: Hybrid agent/planner prompts
- `prompts-system.ts`: Main system message composition (chat_systemMessage, chat_systemMessage_compact)

## Pre-Execution Checklist

**Before starting Phase 0**:

- [ ] Create git branch: `git checkout -b refactor/split-prompts`
- [ ] Ensure no uncommitted changes in `prompts.ts`
- [ ] Backup current file: `cp src/vs/workbench/contrib/void/common/prompt/prompts.ts prompts.ts.backup`
- [ ] Verify you're on the correct branch: `git branch --show-current` should show `stable-base` or similar

## Construction Phases

### Phase 0: Pre-Refactor Inventory (CRITICAL)

**Step 0.1: Document All Current Exports**

Run this command to capture the current export surface:

```bash
cd src/vs/workbench/contrib/void/common/prompt/
grep "^export " prompts.ts > exports-before.txt
```

**Expected exports** (verify against output):

- `tripleTick`
- `MAX_DIRSTR_CHARS_TOTAL_BEGINNING`, `MAX_DIRSTR_CHARS_TOTAL_TOOL`, `MAX_DIRSTR_RESULTS_TOTAL_BEGINNING`, `MAX_DIRSTR_RESULTS_TOTAL_TOOL`
- `MAX_FILE_CHARS_PAGE`, `MAX_CHILDREN_URIs_PAGE`
- `MAX_TERMINAL_CHARS`, `MAX_TERMINAL_INACTIVE_TIME`, `MAX_TERMINAL_BG_COMMAND_TIME`
- `MAX_PREFIX_SUFFIX_CHARS`
- `ORIGINAL`, `DIVIDER`, `FINAL`
- `InternalToolInfo` (type)
- `SnakeCase`, `SnakeCaseKeys` (types)
- `builtinTools`, `builtinToolNames`, `isABuiltinToolName`, `availableTools`
- `reParsedToolXMLString`
- `chat_systemMessage`, `chat_systemMessage_compact`
- `DEFAULT_FILE_SIZE_LIMIT`, `readFile`
- `messageOfSelection`, `chat_userMessageContent`
- `rewriteCode_systemMessage`, `rewriteCode_userMessage`
- `searchReplaceGivenDescription_systemMessage`, `searchReplaceGivenDescription_userMessage`
- `voidPrefixAndSuffix`
- `QuickEditFimTagsType`, `defaultQuickEditFimTags`
- `ctrlKStream_systemMessage`, `ctrlKStream_userMessage`
- `gitCommitMessage_systemMessage`, `gitCommitMessage_userMessage`
- `hybrid_plannerDecision_systemMessage`, `hybrid_createPlan_systemMessage`, `hybrid_enhanceStep_systemMessage`, `hybrid_coder_systemMessage`

**Note**: Internal (non-exported) constants exist but are not in this list:
- `searchReplaceBlockTemplate`, `replaceTool_description`, `createSearchReplaceBlocks_systemMessage`
- `uriParam()`, `paginationParam`, `terminalDescHelper`, `cwdHelper`
- `toolCallDefinitionsXMLString()`, `systemToolsXMLPrompt()`
- `chatSuggestionDiffExample`

These are implementation details and will be moved but not re-exported.

**Step 0.2: Document External Imports**

The current file imports:

```typescript
import { URI } from '../../../../../base/common/uri.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { IDirectoryStrService } from '../directoryStrService.js';
import { StagingSelectionItem } from '../chatThreadServiceTypes.js';
import { os } from '../helpers/systemInfo.js';
import { RawToolParamsObj } from '../sendLLMMessageTypes.js';
import { BuiltinToolCallParams, BuiltinToolName, BuiltinToolResultType, ToolName } from '../toolsServiceTypes.js';
import { ChatMode } from '../voidSettingsTypes.js';
```

**Step 0.3: Identify Import Consumers**

```bash
cd /Users/dokinkim/GenAI/void
grep -r "from.*prompts.js" src/vs/workbench/contrib/void/ > importers.txt
```

**Expected importers** (16 files as of current codebase):
- `browser/convertToLLMMessageService.ts` - Main chat system message generation
- `browser/editCodeService.ts` - Code editing prompts
- `browser/hybridAgentService.ts` - Hybrid mode prompts
- `browser/chatThreadService.ts` - Chat thread management
- `browser/voidSCMService.ts` - Git commit message generation
- `browser/toolsService.ts` - Tool definitions
- `browser/fileService.ts` - File operations
- `browser/terminalToolService.ts` - Terminal operations
- `browser/react/src/sidebar-tsx/SidebarChat.tsx` - **React component** (critical)
- `electron-main/llmMessage/sendLLMMessage.impl.ts` - **Electron main process** (critical)
- `common/directoryStrService.ts` - Directory structure
- `common/toolsServiceTypes.ts` - Tool type definitions
- `common/sendLLMMessageTypes.ts` - LLM message types
- `common/mcpService.ts` - MCP tool integration
- `common/helpers/extractCodeFromResult.ts` - Code extraction
- Plus a few more minor imports

Review this file to understand impact radius.

**Step 0.4: Create Performance Baselines (NEW)**

Before refactoring, capture baseline metrics:

```bash
# 1. Build time baseline
cd /Users/dokinkim/GenAI/void
time npm run compile > build-time-before.txt 2>&1

# 2. Bundle size baseline (compile first if not done)
npm run compile
# Verify output directory exists first
if [ -d "out-build/vs/workbench/contrib/void/" ]; then
  du -sh out-build/vs/workbench/contrib/void/ > bundle-size-before.txt
  du -h out-build/vs/workbench/contrib/void/browser/*.js | sort -h >> bundle-size-before.txt
  du -h out-build/vs/workbench/contrib/void/electron-main/*.js | sort -h >> bundle-size-before.txt
else
  echo "Output directory doesn't exist yet - will create baseline after first compile" > bundle-size-before.txt
fi

# 3. Count total lines in prompts.ts
wc -l src/vs/workbench/contrib/void/common/prompt/prompts.ts > lines-before.txt
```

**Note**: Automated test creation steps removed - manual testing will be performed instead.
**Commit checkpoint**: `git add . && git commit -m "Phase 0: Document exports, dependencies, and baselines"`

### Phase 1: Extract Common Foundation (Create Base Layer First)

**Why first?** Other files will depend on this, so it must exist before them.

**Step 1.1: Create `prompts-common.ts`**

Extract these by FUNCTION/CONSTANT NAME (not line numbers):

**Constants**:

- `tripleTick = ['```', '```']`
- All `MAX_*` constants (11 total)
- `ORIGINAL`, `DIVIDER`, `FINAL`
- `chatSuggestionDiffExample` (used in multiple prompts)

**Internal Constants (not exported, but shared)**:

- `searchReplaceBlockTemplate` (line ~44, used in tool descriptions)
- `replaceTool_description` (line ~109, used by builtinTools.edit_file)

**Helper Functions (internal, used by builtinTools)**:

- `uriParam()` (line ~156, helper for tool parameter definitions)
- `paginationParam` (line ~160, constant object for pagination)
- `terminalDescHelper` (line ~166, string constant for terminal tool descriptions)
- `cwdHelper` (line ~168, string constant for current working directory parameter)

**Types**:

- `InternalToolInfo`
- `SnakeCase<S>`
- `SnakeCaseKeys<T>`

**Tool Definitions**:

- `uriParam()` (helper)
- `paginationParam` (helper)
- `builtinTools` (object, ~400 lines)
- `builtinToolNames` (array)
- `isABuiltinToolName()` (function)
- `availableTools()` (function - NOTE: This is mode-aware but stays in common as a shared utility)

**XML Formatters**:

- `toolCallDefinitionsXMLString()` (function)
- `reParsedToolXMLString()` (function)
- `systemToolsXMLPrompt()` (function)

**File Utilities**:

- `DEFAULT_FILE_SIZE_LIMIT` (constant)
- `readFile()` (async function)

**Other Utilities**:

- `voidPrefixAndSuffix()` (function)

**External imports needed**:

```typescript
import { URI } from '../../../../../base/common/uri.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { RawToolParamsObj } from '../sendLLMMessageTypes.js';
import { BuiltinToolCallParams, BuiltinToolName, BuiltinToolResultType, ToolName } from '../toolsServiceTypes.js';
import { ChatMode } from '../voidSettingsTypes.js';
```

**Step 1.2: Verify No Internal Imports (NEW)**

After creating `prompts-common.ts`, verify it has zero imports from other prompt files:

```bash
# Should return nothing
grep "from './prompts-" src/vs/workbench/contrib/void/common/prompt/prompts-common.ts
```

**Expected**: Empty output. If it imports from other prompts-* files, you have a circular dependency risk.

**Step 1.3: Document Internal Constants (NEW)**

Create a quick reference for future developers:

```bash
cat > src/vs/workbench/contrib/void/common/prompt/INTERNAL_CONSTANTS.md << 'EOF'
# Internal Constants Reference

This documents internal (non-exported) constants and helpers moved during refactoring.

## In prompts-common.ts
- `searchReplaceBlockTemplate` - Used in tool descriptions
- `replaceTool_description` - Used by builtinTools.edit_file
- `uriParam()` - Helper for tool parameter definitions
- `paginationParam` - Pagination parameter object
- `terminalDescHelper` - Terminal tool description string
- `cwdHelper` - Current working directory parameter description

## In prompts-edit.ts
- `createSearchReplaceBlocks_systemMessage` - Referenced by searchReplaceGivenDescription_systemMessage

These are implementation details and should remain non-exported.
EOF
```

**Commit checkpoint**: `git add prompts-common.ts INTERNAL_CONSTANTS.md && git commit -m "Phase 1: Create prompts-common.ts with internal constants"`

### Phase 2: Extract Independent Modules

These modules have NO dependencies on `chat_systemMessage` and can be extracted safely.

**Step 2.1: Create `prompts-scm.ts`**

Extract by name:

- `gitCommitMessage_systemMessage` (constant string)
- `gitCommitMessage_userMessage()` (function)

External imports: `none` (pure strings)

**Step 2.2: Create `prompts-edit.ts`**

Extract by name:

- `rewriteCode_systemMessage` (constant string)
- `rewriteCode_userMessage()` (function)
- `createSearchReplaceBlocks_systemMessage` (constant string, line ~60 - NOT exported but used by searchReplaceGivenDescription_systemMessage)
- `searchReplaceGivenDescription_systemMessage` (constant - references `createSearchReplaceBlocks_systemMessage`)
- `searchReplaceGivenDescription_userMessage()` (function)
- `QuickEditFimTagsType` (type)
- `defaultQuickEditFimTags` (constant)
- `ctrlKStream_systemMessage()` (function)
- `ctrlKStream_userMessage()` (function)

Internal imports from `prompts-common.ts`:

```typescript
import { tripleTick, ORIGINAL, DIVIDER, FINAL, searchReplaceBlockTemplate } from './prompts-common.js';
```

**Note**: `createSearchReplaceBlocks_systemMessage` is NOT exported but must be moved here because it's referenced by `searchReplaceGivenDescription_systemMessage`.

**Step 2.3: Create `prompts-hybrid.ts`**

Extract by name:

- `hybrid_plannerDecision_systemMessage` (constant string)
- `hybrid_createPlan_systemMessage()` (function)
- `hybrid_enhanceStep_systemMessage()` (function)
- `hybrid_coder_systemMessage()` (function)

External imports: `none` (pure strings)

**Commit checkpoint**: `git add . && git commit -m "Phase 2: Extract SCM, Edit, and Hybrid prompts"`

### Phase 2.5: Validate Build Configuration (NEW - CRITICAL)

Before proceeding to system message extraction, validate that the build system handles the new files correctly.

**Step 2.5.1: Quick Compile Check**

```bash
cd /Users/dokinkim/GenAI/void
npm run compile
```

**Expected**: Zero errors. If errors occur, fix missing imports before continuing.

**Step 2.5.2: Verify Module Resolution in Build Output**

```bash
# Check that new prompt files are compiled
ls -lh out-build/vs/workbench/contrib/void/common/prompt/
```

**Expected output**: Should show all new `.js` files:
- `prompts-common.js`
- `prompts-scm.js`
- `prompts-edit.js`
- `prompts-hybrid.js`

**Step 2.5.3: Check Import Paths in Compiled Output**

```bash
# Verify imports are correctly resolved
grep "from './prompts-" out-build/vs/workbench/contrib/void/common/prompt/*.js
```

**Expected**: All imports should use `.js` extensions and resolve correctly.

**Step 2.5.4: Check for Circular Dependencies (NEW)**

```bash
# Use TypeScript compiler's module resolution to detect circular dependencies
npx tsc --noEmit --project src/tsconfig.json 2>&1 | grep -i "circular\|cycle" || echo "No circular dependencies detected"
```

**Expected**: No circular dependency errors involving prompt files. If compilation succeeds without circular dependency warnings, you're good.

**Commit checkpoint**: `git add . && git commit -m "Phase 2.5: Build validation passed"`

### Phase 3: Extract System Message Composition

**Step 3.1: Create `prompts-system.ts`**

**CONSERVATIVE APPROACH**: Move these functions AS-IS without changing internal logic:

- `chat_systemMessage()` - Move entire function (lines 576-816) unchanged
- `chat_systemMessage_compact()` - Move entire function (lines 819-901) unchanged
- `messageOfSelection()` - Move entire async function
- `chat_userMessageContent()` - Move entire async function

Internal imports needed:

```typescript
import {
    tripleTick,
    MAX_DIRSTR_CHARS_TOTAL_BEGINNING,
    MAX_DIRSTR_CHARS_TOTAL_TOOL,
    // ... all other MAX_ constants used
    availableTools,
    builtinTools,
    readFile,
    chatSuggestionDiffExample,
    DEFAULT_FILE_SIZE_LIMIT
} from './prompts-common.js';
```

External imports needed:

```typescript
import { URI } from '../../../../../base/common/uri.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { IDirectoryStrService } from '../directoryStrService.js';
import { StagingSelectionItem } from '../chatThreadServiceTypes.js';
import { os } from '../helpers/systemInfo.js';
import { ChatMode } from '../voidSettingsTypes.js';
```

**Critical Note**: The mode-specific conditional logic (`if (mode === 'agent')` etc.) stays embedded in `chat_systemMessage`. We are NOT extracting `buildAgentDetails()` functions in this conservative approach.

**IMPORTANT - Legacy Code**: The current prompts.ts contains ~180 lines of commented-out code (lines 1185-1366) including old examples and AI regex functions. **Decision**: Move this entire commented block to `prompts-system.ts` as-is to preserve history. Do NOT try to extract or organize it - just move it as a single block at the end of the file.

**Step 3.2: Verify Both System Message Functions Are Identical in Logic**

After moving, manually verify:

- `chat_systemMessage` and `chat_systemMessage_compact` handle all modes the same way
- Both reference the same constants/utilities from `prompts-common.ts`

**Commit checkpoint**: `git add prompts-system.ts && git commit -m "Phase 3: Extract system message composition"`

### Phase 4: Create Barrel File with Explicit Re-Exports (UPDATED)

**Step 4.1: Update `prompts.ts`**

Replace entire file content with **EXPLICIT RE-EXPORTS** (not `export *`):

```typescript
/*---------------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------------*/

// Barrel file - re-exports from modularized prompt files
// All imports throughout the codebase should continue to work unchanged
//
// IMPORTANT: We use explicit re-exports instead of `export *` to preserve
// tree-shaking in VSCode's esbuild bundler. This prevents bundling unused code.

// ============= Common Exports =============
export {
  tripleTick,
  MAX_DIRSTR_CHARS_TOTAL_BEGINNING,
  MAX_DIRSTR_CHARS_TOTAL_TOOL,
  MAX_DIRSTR_RESULTS_TOTAL_BEGINNING,
  MAX_DIRSTR_RESULTS_TOTAL_TOOL,
  MAX_FILE_CHARS_PAGE,
  MAX_CHILDREN_URIs_PAGE,
  MAX_TERMINAL_CHARS,
  MAX_TERMINAL_INACTIVE_TIME,
  MAX_TERMINAL_BG_COMMAND_TIME,
  MAX_PREFIX_SUFFIX_CHARS,
  ORIGINAL,
  DIVIDER,
  FINAL,
  builtinTools,
  builtinToolNames,
  isABuiltinToolName,
  availableTools,
  reParsedToolXMLString,
  DEFAULT_FILE_SIZE_LIMIT,
  readFile,
  voidPrefixAndSuffix,
  // Add any other common exports discovered during extraction
} from './prompts-common.js';

// Type exports (use 'export type' for TypeScript types)
export type {
  InternalToolInfo,
  SnakeCase,
  SnakeCaseKeys,
} from './prompts-common.js';

// ============= SCM Exports =============
export {
  gitCommitMessage_systemMessage,
  gitCommitMessage_userMessage,
} from './prompts-scm.js';

// ============= Edit Exports =============
export {
  rewriteCode_systemMessage,
  rewriteCode_userMessage,
  searchReplaceGivenDescription_systemMessage,
  searchReplaceGivenDescription_userMessage,
  defaultQuickEditFimTags,
  ctrlKStream_systemMessage,
  ctrlKStream_userMessage,
} from './prompts-edit.js';

export type {
  QuickEditFimTagsType,
} from './prompts-edit.js';

// ============= Hybrid Agent Exports =============
export {
  hybrid_plannerDecision_systemMessage,
  hybrid_createPlan_systemMessage,
  hybrid_enhanceStep_systemMessage,
  hybrid_coder_systemMessage,
} from './prompts-hybrid.js';

// ============= System Message Exports =============
export {
  chat_systemMessage,
  chat_systemMessage_compact,
  messageOfSelection,
  chat_userMessageContent,
} from './prompts-system.js';
```

**Why explicit exports matter**: VSCode's optimizer needs to statically analyze which exports are used. `export *` defeats tree-shaking because the bundler can't determine which exports are actually imported.

**Step 4.2: Verify All Exports Are Listed**

```bash
# Compare exports in barrel file vs. original
cd src/vs/workbench/contrib/void/common/prompt/
grep "^export " prompts.ts | wc -l
# Should match or exceed the count in exports-before.txt
```

**Commit checkpoint**: `git add prompts.ts && git commit -m "Phase 4: Convert prompts.ts to barrel file with explicit re-exports"`

### Phase 5: Verification (MANDATORY - DO NOT SKIP)

**Step 5.1: Export Parity Check**

```bash
cd src/vs/workbench/contrib/void/common/prompt/
grep "^export " *.ts | grep -v "prompts.ts:" | sort > exports-after.txt
grep "^export " exports-before.txt | sort > exports-before-sorted.txt

# Compare (should show same exports, just in different files)
diff exports-before-sorted.txt exports-after.txt
```

**Expected**: All exports present in both files. Fix any missing exports before proceeding.

**Step 5.2: Check for Export Name Collisions**

```bash
# Find duplicate export names across files
grep "^export " prompts-*.ts | cut -d: -f2 | sort | uniq -d
```

**Expected**: Empty output (no duplicates). If duplicates exist, rename one.

**Step 5.3: Compile Check**

```bash
cd /Users/dokinkim/GenAI/void
npm run compile
```

**Expected**: Zero TypeScript errors. Fix any missing imports/type errors.

**Step 5.4: Lint Check**

Run linter to catch circular dependencies:

```bash
npm run lint
```

**Step 5.5: Runtime Verification - Baseline Comparison**

**Before testing modes, create a baseline snapshot** (if you saved baseline before starting):

```bash
# Run the app and capture system prompts
# (This requires adding temporary logging to chat_systemMessage)
```

**Manual Mode Testing**:

1. **Start Void application**: `npm run watch` (in one terminal) and launch Void
2. **Test Chat Mode**:
   - Switch to Chat mode in UI
   - Send message: "What files are in this project?"
   - Verify: Response works, no errors in console
3. **Test Plan Mode**:
   - Switch to Plan mode
   - Send message: "Create a plan to add a new API endpoint"
   - Verify: Plan structure is generated correctly
4. **Test Agent Mode**:
   - Switch to Agent mode
   - Send message: "Create a new file called test.txt with 'hello world'"
   - Verify: File creation works
5. **Test Hybrid Mode** (if applicable):
   - Switch to Hybrid mode
   - Test a multi-step task
   - Verify: Planner and Coder work together

**Expected**: All modes work identically to before refactor.

**Step 5.6: Check Importers Still Work**

Review `importers.txt` from Phase 0 and spot-check a few files that import from `prompts.js`:

```bash
# Test key importers
cd /Users/dokinkim/GenAI/void

# 1. Check convertToLLMMessageService.ts (imports chat_systemMessage)
grep "chat_systemMessage" src/vs/workbench/contrib/void/browser/convertToLLMMessageService.ts

# 2. Check editCodeService.ts (imports rewriteCode_*)
grep "rewriteCode" src/vs/workbench/contrib/void/browser/editCodeService.ts

# 3. Check hybridAgentService.ts (imports hybrid_*)
grep "hybrid_" src/vs/workbench/contrib/void/browser/hybridAgentService.ts
```

Compile and run app to verify these critical consumers still work.

### Phase 5.6: Bundle Size Regression Test (NEW - CRITICAL)

**Step 5.6.1: Compare Development Build Size**

```bash
cd /Users/dokinkim/GenAI/void

# Verify output directory exists
if [ -d "out-build/vs/workbench/contrib/void/" ]; then
  du -sh out-build/vs/workbench/contrib/void/ > bundle-size-after.txt
  du -h out-build/vs/workbench/contrib/void/browser/*.js | sort -h >> bundle-size-after.txt
  du -h out-build/vs/workbench/contrib/void/electron-main/*.js | sort -h >> bundle-size-after.txt

  # Compare
  echo "=== BEFORE REFACTOR ==="
  cat bundle-size-before.txt
  echo ""
  echo "=== AFTER REFACTOR ==="
  cat bundle-size-after.txt
else
  echo "Output directory doesn't exist - run 'npm run compile' first"
fi
```

**Expected**: Bundle size should be roughly the same (±5%). If it increases >10%, investigate tree-shaking issues.

**Step 5.6.2: Production Bundle Test (OPTIONAL but RECOMMENDED)**

```bash
# Build production bundle (this takes time)
npm run gulp vscode-darwin-min  # Use your platform: darwin, linux, win32

# Check main workbench bundle size
ls -lh out-vscode/vs/workbench/workbench.desktop.main.js
```

**Expected**: Production bundle size should not increase. Save this for final validation.

**Step 5.6.3: Verify Build Time Hasn't Regressed**

```bash
# Clean build
rm -rf out-build
time npm run compile > build-time-after.txt 2>&1

# Compare
echo "Before: $(cat build-time-before.txt | grep real)"
echo "After: $(cat build-time-after.txt | grep real)"
```

**Expected**: Build time should be similar (±10%). More files = slightly slower, but shouldn't be significant.

### Phase 5.7: Manual Prompt Testing (MANDATORY)

Since we're doing manual testing, perform these verification checks in the running application:

**Step 5.7.1: Test All Chat Modes Work**

In the running Void application:

1. **Agent Mode Test**:
   - Switch to Agent mode via UI dropdown
   - Send test message: "Create a file called test.txt with content 'hello world'"
   - Verify: Agent uses tools and creates the file
   - Check console for errors

2. **Chat Mode Test**:
   - Switch to Chat mode (normal)
   - Send test message: "What files are in this workspace?"
   - Verify: Chat responds with exploration (may use read-only tools)
   - Check console for errors

3. **Plan Mode Test**:
   - Switch to Plan mode
   - Send test message: "Create a plan to add a README file"
   - Verify: Plan structure is generated with phases
   - Check console for errors

4. **Hybrid Mode Test** (if applicable):
   - Switch to Hybrid mode
   - Send test message: "Research how the prompt system works and create documentation"
   - Verify: Planner and Coder coordination works
   - Check console for errors

**Step 5.7.2: Verify Prompt Export Functionality**

Open browser DevTools console and test imports work:

```javascript
// In the running app console, verify exports are accessible
// (This assumes exports are available in the dev build)
console.log("Testing prompt exports...")
```

**Step 5.7.3: Check for Runtime Errors**

```bash
# Monitor terminal output while testing
# Look for:
# - Module resolution errors
# - Import path errors
# - Undefined function/constant errors
```

**Expected**: All modes work identically to before refactor. No console errors. No import/module resolution failures.

### Phase 5.8: Electron Main Process Validation (NEW - CRITICAL)

The Electron main process has different module resolution than the renderer process. Test both contexts.

**Step 5.8.1: Verify Electron Main Process Imports**

```bash
# Check if sendLLMMessage.impl.ts (Electron main) still imports correctly
cd /Users/dokinkim/GenAI/void
grep "from.*prompts" src/vs/workbench/contrib/void/electron-main/llmMessage/sendLLMMessage.impl.ts
```

**Step 5.8.2: Test Electron App Launch**

```bash
# Launch Void in Electron (not web mode)
npm start
```

**Expected**: App launches without errors. Test sending a message in agent mode to verify Electron main process can load prompts.

### Phase 5.9: React Component Bundle Validation (NEW)

Void uses `tsup` to bundle React components separately. Verify the refactor doesn't break React bundling.

**Step 5.9.1: Check React Bundle**

```bash
cd /Users/dokinkim/GenAI/void/src/vs/workbench/contrib/void/browser/react
npm run build
```

**Expected**: Build succeeds without errors.

**Step 5.9.2: Verify React Component Imports**

```bash
# Check specific React component that imports prompts
grep "from.*prompts" src/vs/workbench/contrib/void/browser/react/src/sidebar-tsx/SidebarChat.tsx
```

**Expected**: Only `SidebarChat.tsx` imports from prompts (as of current codebase).

**Manual Test**: In the running Void app:
1. Open the Sidebar (should be visible by default)
2. Interact with the chat interface in the Sidebar
3. Verify no console errors related to prompt imports
4. Send a test message to ensure SidebarChat component works correctly

If `SidebarChat.tsx` breaks, it will be immediately obvious as the main chat interface will fail to load.

### Phase 5.10: Void Brain Service Integration Test (NEW)

The brain service injects lessons into prompts via the `brainGuidance` section in `chat_systemMessage`. Verify this still works.

**Step 5.10.1: Verify Brain Tools Are Available**

In the running Void app (Agent or Plan mode):

1. Switch to Agent mode
2. Send message: "search for lessons about typescript"
3. Verify: Agent can use the `search_lessons` tool
4. Send message: "Remember this: always use const instead of let"
5. Verify: Agent asks for confirmation and can use `add_lesson` tool

**Expected**: Brain tools (search_lessons, add_lesson, etc.) are available in Agent and Plan modes, but NOT in Chat mode (read-only brain tools only).

**Step 5.10.2: Check Brain Guidance Text**

Open DevTools console and check that the brain guidance section appears in prompts for Agent/Plan modes:

```javascript
// The brain guidance section should be in the system message
// Look for text: "LEARNING FROM EXPERIENCE" and "add_lesson tool"
```

**Expected**: Brain integration works identically to before refactor.

**Commit checkpoint**: `git add . && git commit -m "Phase 5: All verification passed - refactor complete"`

## Post-Refactor Documentation

Create a guide for future developers:

**Step 6.1: Create `PROMPTS_ARCHITECTURE.md`**

```bash
cat > src/vs/workbench/contrib/void/common/prompt/PROMPTS_ARCHITECTURE.md << 'EOF'
# Prompts Architecture

This directory contains Void's prompt generation system, split into domain-specific files.

## File Organization

- **`prompts.ts`**: Barrel file - re-exports all prompts. Import from here.
- **`prompts-common.ts`**: Foundation layer (constants, tool definitions, utilities)
- **`prompts-scm.ts`**: Git commit message generation
- **`prompts-edit.ts`**: Code modification prompts (Ctrl+K, rewrite, search/replace)
- **`prompts-hybrid.ts`**: Hybrid agent/planner prompts
- **`prompts-system.ts`**: Main system message composition

## How to Modify Prompts

| Task | File to Edit |
|------|--------------|
| Add new tool definition | `prompts-common.ts` |
| Change agent behavior | `prompts-system.ts` |
| Update git commit prompt | `prompts-scm.ts` |
| Modify Ctrl+K prompt | `prompts-edit.ts` |
| Enhance hybrid planner | `prompts-hybrid.ts` |
| Add new constant (MAX_*) | `prompts-common.ts` |

## Import Guidelines

**Always import from `prompts.ts` (barrel file):**

```typescript
// Good
import { chat_systemMessage, availableTools } from '../common/prompt/prompts.js';

// Bad - don't import from individual files
import { chat_systemMessage } from '../common/prompt/prompts-system.js';
```

## Architecture Rules

1. **No circular dependencies**: `prompts-common.ts` must not import from other prompt files
2. **Explicit re-exports**: `prompts.ts` uses explicit re-exports for tree-shaking
3. **Type exports**: Always use `export type` for TypeScript types
4. **Mode-specific logic**: Stays in `chat_systemMessage()` function (conservative approach)

## Testing

Run prompt tests:

```bash
npm test -- --grep "Prompts"
```

## Build Considerations

- VSCode uses esbuild for bundling
- Tree-shaking requires explicit re-exports (no `export *`)
- React components are bundled separately with tsup
- Electron main process has different module resolution
EOF

git add src/vs/workbench/contrib/void/common/prompt/PROMPTS_ARCHITECTURE.md
git commit -m "docs: Add prompts architecture guide"
```

## Rollback Strategy

If anything breaks during execution:

1. **Immediate rollback**:
   ```bash
   git reset --hard HEAD~1  # Roll back one commit
   # Or restore backup:
   cp prompts.ts.backup src/vs/workbench/contrib/void/common/prompt/prompts.ts
   ```

2. **Phase-by-phase rollback**: Each phase has a commit, so you can roll back to any phase:
   ```bash
   git log --oneline  # Find the commit hash
   git reset --hard <commit-hash>
   ```

3. **Nuclear option** (if everything is broken):
   ```bash
   git checkout stable-base  # Return to stable branch
   git branch -D refactor/split-prompts  # Delete broken branch
   ```

## Success Criteria

- [ ] All exports from original `prompts.ts` are available via barrel file
- [ ] Zero TypeScript compilation errors
- [ ] Zero linter errors (including circular dependencies)
- [ ] All 4 modes (chat, plan, agent, hybrid) work in the running application
- [ ] Export parity check passes (exports-before.txt matches exports-after.txt)
- [ ] No export name collisions across new files
- [ ] **Bundle size hasn't increased >5%** (NEW)
- [ ] **Build time hasn't regressed >10%** (NEW)
- [ ] **Manual testing passes for all modes** (NEW - replaces automated tests)
- [ ] **Electron app launches correctly** (NEW)
- [ ] **React components still work** (specifically SidebarChat.tsx) (NEW)
- [ ] **Brain service integration works** (NEW)
- [ ] **Internal constants properly moved** (NEW - searchReplaceBlockTemplate, helpers, etc.)

## Risk Mitigation

**Risk**: Phase order wrong (creating files that depend on non-existent imports)

**Mitigation**: Create `prompts-common.ts` FIRST in Phase 1

**Risk**: Line numbers change between plan creation and execution

**Mitigation**: Use function/constant names instead of line numbers

**Risk**: Missing external imports cause compilation failure

**Mitigation**: Document external imports in Phase 0, verify in Phase 5.3

**Risk**: Breaking `chat_systemMessage_compact`

**Mitigation**: Move it in same step as `chat_systemMessage`, keep logic identical

**Risk**: Circular dependencies

**Mitigation**: `prompts-common.ts` has zero internal imports; verify with linter in Phase 5.4

**Risk**: Logic errors from splitting

**Mitigation**: Conservative approach (no internal logic changes) + runtime testing in Phase 5.5

**Risk**: Forgetting to export something

**Mitigation**: Phase 5.1 export parity check with `diff`

**Risk**: Tree-shaking breaks, bundle size explodes (NEW)

**Mitigation**: Use explicit re-exports in barrel file; validate bundle size in Phase 5.6

**Risk**: Electron main process fails to load prompts (NEW)

**Mitigation**: Test Electron app launch in Phase 5.8

**Risk**: React component bundling breaks (NEW)

**Mitigation**: Test React build separately in Phase 5.9

**Risk**: Brain service integration breaks (NEW)

**Mitigation**: Test lesson injection in Phase 5.10

## Future Enhancements (Not in This Plan)

After this refactor is stable, we can consider:

- Extracting mode-specific logic into `buildAgentDetails()` functions (more invasive)
- Adding prompt engineering improvements (JSON enforcement, negative examples)
- Creating unit tests for prompt generation
- Performance optimization (lazy loading, caching)
- Prompt versioning system

But those are separate efforts that should only happen after this foundational refactor succeeds.

## Estimated Time

- Phase 0: 30 minutes (baselines and documentation)
- Phase 1: 1-1.5 hours (extract common foundation including internal constants)
- Phase 2: 1 hour (extract independent modules)
- Phase 2.5: 30 minutes (build validation)
- Phase 3: 1 hour (extract system message including legacy code)
- Phase 4: 30 minutes (create barrel file)
- Phase 5: 1.5-2 hours (manual verification and testing)
- Total: **6-7 hours** (with manual testing)

## To-dos

- [ ] Create new prompt files (common, scm, edit, hybrid, system)
- [ ] Move internal constants and helpers to appropriate files
- [ ] Move legacy commented code block to prompts-system.ts
- [ ] Refactor prompts.ts to be a barrel file with explicit re-exports
- [ ] Verify imports and exports with linter
- [ ] Run manual tests for all chat modes
- [ ] Validate bundle size regression
- [ ] Test Electron main process launch
- [ ] Test React component (SidebarChat.tsx)
- [ ] Verify brain service integration
- [ ] Create architecture documentation
- [ ] Celebrate successful refactor!

