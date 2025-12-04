# Prompt Fine-tuning for Improved AI Accuracy (Enhanced)

## Overview

Fine-tune prompts in [`src/vs/workbench/contrib/void/common/prompt/prompts.ts`](src/vs/workbench/contrib/void/common/prompt/prompts.ts) to improve AI decision-making, tool selection accuracy, and user intent understanding. Focus on clarifying ambiguities, strengthening guidance, and preventing common failure modes.

**IMPORTANT**: This plan only modifies prompt strings - no system architecture changes.

## Pre-Implementation Checklist

**⚠️ CRITICAL SAFETY CHECKS** - Verify before editing prompts.ts:

1. ✅ All template string interpolations are preserved (`${variable}`)
2. ✅ No changes to function signatures
3. ✅ No changes to the `availableTools` function (lines 420-472)
4. ✅ No changes to tool registration in `builtinTools` object structure
5. ✅ Only `description` fields and prompt strings are modified
6. ✅ TypeScript types and interfaces remain untouched
7. ✅ Control flow logic (if/else, loops) remains unchanged

**Special attention required:**
- The `uriParam` function uses `${object}` interpolation - must be preserved
- All constants like `${MAX_TERMINAL_INACTIVE_TIME}` must remain as template strings
- Mode detection logic in `availableTools` must not be modified

## Key Problem Areas Identified

### 1. Tool Descriptions Lack Clarity
- **search_for_files vs search_pathnames_only**: Distinction between content search and filename search is unclear
- **edit_file vs rewrite_file**: Missing guidance on when to use each
- **read_file line parameters**: Too restrictive ("Do NOT fill unless given exact line numbers")
- **Terminal tools**: Difference between run_command and run_persistent_command needs clarification
- **URI parameters**: Inconsistent terminology ("FULL path" vs "FULL ABSOLUTE path")

### 2. Decision Framework Ambiguities
- **"ONE tool per response"** (line 562) contradicts Agent mode's "logical sequence" concept (line 702)
- **"Stop when" criteria** (line 682) too subjective - needs concrete stopping conditions
- **Pagination guidance missing**: No clear instructions on when/how to use page_number parameter
- **Error recovery absent**: No guidance on what to do when tools fail
- **Vague quantifiers**: "Brief explanation", "excessive searching", "large file" undefined

### 3. Mode-Specific Issues
- **Chat mode**: Lacks explicit guidance on when NOT to use tools (avoid over-exploration)
- **Agent mode**: "One strategic action" is vague - what counts as "one action"?
- **Plan mode**: "5-10 phases" too rigid - some tasks need 3, some need 15
- **"Routine vs risky"**: Mentioned but no examples provided

### 4. Brain Tool Usage
- Missing proactive guidance: AI should search_lessons BEFORE making architectural decisions
- No explicit trigger points for when to check the brain
- "Architectural decision" undefined - needs concrete examples

### 5. Search/Replace Block Guidance
- Example doesn't show common failure modes (overlapping blocks, insufficient unique context)
- Missing guidance on how much context is "enough"

### 6. Missing Workflow Patterns (NEW)
- No guidance on tool chaining (search → read → edit pipeline)
- No guidance on when search returns 50+ results (pagination vs refining query)
- No success patterns - only failure modes shown

### 7. Compact Mode Ignored (NEW)
- `chat_systemMessage_compact` (lines 819-901) not addressed - should have parallel improvements

## Fine-tuning Changes

### Phase 0: Capture Baseline Metrics (NEW)

**Purpose**: Establish measurable baseline before changes to enable comparison and rollback if needed.

**Actions**:

1. **Create test cases file**:
   ```bash
   cat > /Users/dokinkim/GenAI/void/prompt-test-cases.md << 'EOF'
   # Prompt Test Cases - Baseline & Post-Implementation

   ## Tool Selection Tests
   1. "Where is authentication handled?"
      - Expected: search_for_files (content search)
      - Baseline: [Record result]
      - Post-fix: [Record result]

   2. "Find the config.json file"
      - Expected: search_pathnames_only (filename search)
      - Baseline: [Record result]
      - Post-fix: [Record result]

   3. "What's in the src directory?"
      - Expected: ls_dir or get_dir_tree
      - Baseline: [Record result]
      - Post-fix: [Record result]

   ## Mode Behavior Tests
   4. [Chat Mode] "How does authentication work?"
      - Expected: Read-only exploration, suggest files to user if code is complex
      - Baseline: [Record result]
      - Post-fix: [Record result]

   5. [Agent Mode] "Fix the login bug in auth.ts"
      - Expected: read_file(auth.ts) → identify issue → edit_file → validate
      - Baseline: [Record result]
      - Post-fix: [Record result]

   6. [Plan Mode] "Add user registration feature"
      - Expected: 5-8 structured phases with architecture section
      - Baseline: [Record result]
      - Post-fix: [Record result]

   ## Error Recovery Tests
   7. "Read /wrong/path/file.ts"
      - Expected: Error → Use search_pathnames_only("file.ts") to find correct path
      - Baseline: [Record result]
      - Post-fix: [Record result]

   8. "Search for xyz123uniquestring" (returns 0 results)
      - Expected: Suggest broader search terms or ask user for clarification
      - Baseline: [Record result]
      - Post-fix: [Record result]

   ## Brain Tool Tests
   9. [Agent Mode] "Implement JWT authentication"
      - Expected: search_lessons("authentication") BEFORE implementation
      - Baseline: [Record result]
      - Post-fix: [Record result]

   ## Complex Request Tests
   10. "Research how authentication works in this project and create documentation"
       - Expected: get_dir_tree → search_for_files → read key files → create doc
       - Baseline: [Record result]
       - Post-fix: [Record result]

   ## Tool Chaining Tests
   11. "Fix all TypeScript errors in the auth module"
       - Expected: search_pathnames_only("auth") → read_lint_errors → edit_file per file
       - Baseline: [Record result]
       - Post-fix: [Record result]

   12. "Find and update all references to oldFunction"
       - Expected: search_for_files("oldFunction") → read relevant files → edit_file
       - Baseline: [Record result]
       - Post-fix: [Record result]
   EOF
   ```

2. **Run baseline tests** - Manually test each case with current prompts:
   - Which tool was called first
   - Total tool calls needed
   - Accuracy of response
   - Any errors or confusion

3. **Document baseline** in the test cases file

**Time estimate**: 30-45 minutes

**Commit**: `git add prompt-test-cases.md && git commit -m "Phase 0: Baseline test cases captured"`

---

### Phase 1: Sharpen Tool Descriptions

**Files to modify**: Lines 196-339 in prompts.ts

**Terminology consistency**: Use "FULL ABSOLUTE path" everywhere (not "FULL path")

**Specific improvements**:

1. **search_pathnames_only** (line 230):
   ```typescript
   description: `Returns pathnames matching a query. Searches ONLY file and folder NAMES (not file content). Use when looking for files by name, path pattern, or extension. For searching text INSIDE files, use search_for_files instead.`
   ```

2. **search_for_files** (line 242):
   ```typescript
   description: `Searches FILE CONTENTS (not filenames) and returns file paths where content matches. Use when looking for specific code, text, or patterns INSIDE files. For finding files by name, use search_pathnames_only. If results exceed 50 files, use search_in_folder parameter to narrow scope.`
   ```

3. **read_file** (lines 201-202):
   ```typescript
   start_line: { description: 'Optional. Use to read specific section of large files (>500 lines). Can be combined with search_in_file results. Leave blank to read entire file.' }
   end_line: { description: 'Optional. End line for reading file sections. Leave blank to read entire file.' }
   ```

4. **edit_file** (line 291):
   ```typescript
   description: `Edit existing file using SEARCH/REPLACE blocks. Use for targeted changes to existing files (editing functions, fixing bugs, updating logic). Requires exact text matching. For newly created files or full rewrites, use rewrite_file instead.`
   ```

5. **rewrite_file** (line 300):
   ```typescript
   description: `Replace entire file contents. Use ONLY for: (1) newly created files, or (2) when replacing all content of existing file. Simpler than edit_file but overwrites everything. For targeted edits, use edit_file.`
   ```

6. **run_command** (line 308):
   ```typescript
   description: `Runs a terminal command that completes and exits (waits up to ${MAX_TERMINAL_INACTIVE_TIME}s). Use for: npm install, git commit, file operations, tests, builds. For long-running processes (dev servers), use open_persistent_terminal + run_persistent_command. ${terminalDescHelper}`
   ```

7. **run_persistent_command** (line 317):
   ```typescript
   description: `Runs command in persistent terminal created with open_persistent_terminal. Returns output after ${MAX_TERMINAL_BG_COMMAND_TIME}s, command continues in background. Use when terminal state matters (cd, export, source, virtual environments). For one-off commands, use run_command. ${terminalDescHelper}`
   ```

8. **uriParam** (line 157) - **⚠️ CRITICAL - Preserve ${object} interpolation**:
   ```typescript
   const uriParam = (object: string) => ({
     uri: { description: `The FULL ABSOLUTE path to the ${object}. Must include complete path from workspace root (e.g., /Users/name/project/src/file.ts, NOT src/file.ts or ./src/file.ts).` }
   })
   ```

9. **ls_dir** (line 209):
   ```typescript
   description: `Lists immediate children (files and folders) in the given directory. Use for shallow directory inspection. For deep tree structure, use get_dir_tree instead.`
   ```

10. **get_dir_tree** (line 218):
    ```typescript
    description: `Returns a tree diagram of ALL files and folders in the given folder (recursive). Very effective for understanding codebase structure. Use before searching when you need to understand project layout. For single-level listing, use ls_dir.`
    ```

**Tone consistency**: All tool descriptions should be imperative and action-oriented.

---

### Phase 2: Resolve Decision Framework Ambiguities

**Files to modify**: Lines 559-704 in prompts.ts

**Changes**:

1. **Tool Execution Rules** (lines 559-565) - Clarify with concrete numbers:
   ```
   Tool Execution Rules:
   1. Call tools when you need information or must make changes (per your decision framework above)
   2. Use ONE tool call per response in most cases. Exception: Reading 2-4 related files in one turn is acceptable when understanding a cohesive system (e.g., auth.ts + authService.ts + authTypes.ts to understand auth architecture = one logical action)
   3. Tool call goes at END of your response after 1-2 sentence explanation: "I'll check the config file." <read_file>...</read_file>
   4. All parameters REQUIRED unless marked "Optional"
   5. Format: Use XML structure shown above, matching exactly
   6. Pagination: If results show "truncated" or "Page 1 of 5", use page_number=2, page_number=3, etc. to see more
   ```

2. **Agent mode stopping criteria** (line 682) - Make concrete with checklist:
   ```
   • Stop gathering context when you can concretely answer ALL of:
     ✓ What specific file(s) will change? (exact paths)
     ✓ What specific lines/functions/sections will change?
     ✓ What dependencies or imports might be affected?
     ✓ Is this change routine or risky? (see examples below)
     ✓ Do I have enough context to proceed safely?

   • If after 3-4 tool calls you still can't answer these → Ask user for guidance with specific questions

   • If search returns >50 results → Either refine search query or ask user to narrow scope
   ```

3. **Agent mode "one strategic action"** (line 702) - Define with examples:
   ```
   EFFICIENCY: One strategic action per turn means:

   GATHERING (Information):
   - Read 1-3 related files to understand a single concern (e.g., "how does auth work?" = auth.ts + authService.ts + authMiddleware.ts)
   - Or: 1-2 search operations to locate relevant code
   - Or: get_dir_tree + read 1-2 key files to understand structure

   IMPLEMENTING (Changes):
   - ONE edit operation (edit_file OR rewrite_file OR create_file_or_folder) per turn
   - Or: ONE command execution (run_command)
   - Then STOP and wait for validation

   VALIDATING (Verification):
   - ONE check operation: read_lint_errors, read_file to verify changes, or test command

   ❌ AVOID: Reading 10+ unrelated files, making multiple edits before validation, searching without clear goal
   ```

4. **Add "Routine vs Risky" Examples** (after line 590):
   ```
   CHANGE CLASSIFICATION:

   Routine (proceed confidently):
   - Adding console.log/debugging statements
   - Fixing typos or formatting
   - Updating comments or documentation
   - Adding utility functions
   - Renaming variables locally

   Risky (gather extra context or ask user):
   - Deleting files or directories
   - Changing authentication/authorization logic
   - Modifying database schemas or migrations
   - Updating API contracts or interfaces used elsewhere
   - Changing build configuration or dependencies
   - Refactoring code used across many files

   When uncertain → err on side of caution, ask user
   ```

---

### Phase 3: Add Missing Guidance (Tool Workflows & Error Recovery)

**Files to modify**: Lines 420-571 in prompts.ts

**New sections to add**:

1. **Tool Chaining Workflows** (add after toolCallXMLGuidelines around line 571):
   ```
   Common Tool Workflows:

   📍 "Find and fix" pattern:
      search_for_files("error message") → read_file(results[0]) → edit_file

   📍 "Explore then act" pattern:
      get_dir_tree(folder) → identify relevant files → read_file → edit_file

   📍 "Locate by name" pattern:
      search_pathnames_only("config") → read_file(best_match) → modify

   📍 "Understand system" pattern:
      get_dir_tree → search_for_files(key_term) → read 2-3 key files

   📍 "Fix all occurrences" pattern:
      search_for_files("oldFunction") → read_file each → edit_file each (one per turn)

   When to use get_dir_tree FIRST:
   - User asks "how is this project structured?"
   - Before searching, when you don't know where to look
   - When user request is vague and you need context
   ```

2. **Error Recovery Playbook** (add to each mode's decision framework):
   ```
   ERROR RECOVERY PLAYBOOK:

   🔴 Tool not found error:
   → Check current mode: Chat=read-only tools, Agent=full access, Plan=no terminal
   → Verify tool name spelling matches exactly

   🔴 File not found (URI error):
   → Use search_pathnames_only to find correct path
   → Check for typos in file path
   → Verify file exists: use ls_dir on parent directory

   🔴 Search returned 0 results:
   → Try broader search terms (e.g., "auth" instead of "authenticateUser")
   → Try search_pathnames_only if you were using search_for_files
   → Ask user: "I couldn't find X. Can you tell me where to look?"

   🔴 Search returned 50+ results:
   → Use search_in_folder parameter to narrow by directory
   → Refine query with more specific terms
   → Use get_dir_tree first to understand structure
   → Ask user: "Found many matches. Which part of the codebase should I focus on?"

   🔴 Parse error in edit_file:
   → read_file first to see exact formatting (whitespace, indentation, quotes)
   → Copy EXACT text including all whitespace
   → Ensure ORIGINAL block is unique in file

   🔴 Permission denied / Access error:
   → Verify file is within workspace folders
   → Check if file is gitignored (cannot access ignored files)
   → Ask user for permission if outside workspace
   ```

3. **Brain Tool Proactive Usage** (add to brainGuidance section around line 606):
   ```
   PROACTIVE BRAIN USAGE:

   Before implementing, use search_lessons to check for:
   - User preferences about patterns (e.g., "API design")
   - Past mistakes in this area (e.g., "authentication pitfalls")
   - Project-specific conventions (e.g., "component structure")

   Trigger points - Check brain when:
   ✓ User asks to "implement" or "add" a feature
   ✓ Task involves architectural decision (see below)
   ✓ User corrects you or mentions "last time"
   ✓ Working in sensitive areas: auth, database, API, build config

   Search examples:
   - search_lessons("authentication", scope="both")
   - search_lessons("api design", scope="project")
   - search_lessons("testing", scope="global")

   WHAT IS AN ARCHITECTURAL DECISION?

   ✅ Architectural (check brain first):
   - State management approach (Redux vs Context vs Zustand)
   - Database schema design
   - API endpoint structure and REST conventions
   - Component hierarchy and organization
   - Authentication/authorization strategy
   - Build system or bundler configuration
   - Error handling patterns

   ❌ NOT Architectural (no brain check needed):
   - Variable naming
   - Adding a utility function
   - Fixing a bug
   - Writing unit tests
   - Updating documentation
   ```

---

### Phase 4: Strengthen Mode-Specific Frameworks

**Files to modify**: Lines 634-771 in prompts.ts

**Changes**:

1. **Chat mode - Add "when NOT to use tools"** (after line 658):
   ```
   When to use tools (DO explore):
   ✓ User asks about THIS specific codebase
   ✓ User mentions specific files/features to investigate
   ✓ Question needs concrete implementation details
   ✓ User says "in this project" or "in our code"

   When NOT to use tools (DON'T explore):
   ✗ User asks general programming questions (no codebase context needed)
   ✗ User provides complete code snippet in their message (answer from SELECTIONS)
   ✗ Question is about concepts/theory, not this specific codebase
   ✗ You can provide helpful general advice without seeing implementation
   ✗ User asks "what is X?" or "how does X work?" (concept question)

   Examples:
   - "What is dependency injection?" → NO tools (concept question)
   - "How does our app handle dependency injection?" → YES tools (codebase-specific)
   - "Should I use async/await?" → NO tools (general advice)
   - "Where do we use async/await?" → YES tools (find usage)

   Remember: You're a consultant, not a detective. Don't investigate unless the question specifically needs codebase context. Maximum 3 tool calls per response in Chat mode.
   ```

2. **Plan mode - Make phase count flexible** (line 732):
   ```
   [3-12 blueprint phases - scale to task complexity:

    Simple (3-5 phases):
    - Single file feature
    - Small bug fix with test
    - Add new endpoint
    - Update documentation

    Medium (5-8 phases):
    - New feature spanning 3-5 files
    - Refactoring a module
    - Add authentication to feature
    - Database migration + code changes

    Complex (8-12 phases):
    - New major system/architecture
    - Multi-module integration
    - Complete feature with auth + DB + UI + tests
    - Large-scale refactoring

    Each phase = one architectural decision or meaningful milestone.
    Fewer perfect phases beat many vague ones. Quality over quantity.]
   ```

3. **Agent mode - Clarify validation expectations** (after line 700):
   ```
   VALIDATION WORKFLOW:

   After file edits:
   ✓ Read file back if change was multi-part or complex
   ✓ Check read_lint_errors if editing code
   ✓ Visually confirm change applied correctly
   ✓ If critical file, re-read to verify

   After commands:
   ✓ Check exit code (shown in tool result)
   ✓ Exit code 0 = success, proceed
   ✓ Exit code non-zero = failure, read error, try fix
   ✓ If unclear, ask user: "Command exited with code X. Should I investigate?"

   After file creation:
   ✓ Use read_file to verify content if critical
   ✓ Check with ls_dir to confirm file exists in right location

   Multi-file changes:
   ✓ Edit one file
   ✓ Validate it worked
   ✓ Then proceed to next file
   ✗ Don't edit 5 files then validate (too risky)

   If validation fails:
   → Explain what went wrong
   → Fix the immediate issue
   → Continue with original task
   ```

---

### Phase 5: Improve Search/Replace Block Guidance + Success Patterns

**Files to modify**: Lines 60-125 in prompts.ts

**Changes**:

1. **Add comprehensive examples** (after line 106):
   ```
   SEARCH/REPLACE BLOCK EXAMPLES:

   ❌ COMMON MISTAKES:

   Mistake 1: Insufficient context (not unique)
   ${ORIGINAL}
   const x = 5
   ${DIVIDER}
   const x = 10
   ${FINAL}
   // BAD: If file has multiple "const x = 5", this fails

   ✅ Fix: Add unique surrounding context
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


   Mistake 2: Overlapping blocks
   Block 1 ORIGINAL: lines 5-10
   Block 2 ORIGINAL: lines 8-12
   // BAD: Lines 8-10 appear in both blocks → ambiguous

   ✅ Fix: Disjoint blocks
   Block 1 ORIGINAL: lines 5-10
   Block 2 ORIGINAL: lines 15-20
   // GOOD: No overlap, each block is independent


   Mistake 3: Whitespace mismatch
   ${ORIGINAL}
   function test() {
   ____return true;  // 4 spaces
   }
   ${DIVIDER}
   function test() {
   \treturn true;  // tab character
   }
   ${FINAL}
   // BAD: Original uses spaces but replacement uses tab

   ✅ Fix: Match exact whitespace
   ${ORIGINAL}
   function test() {
   ____return true;
   }
   ${DIVIDER}
   function test() {
   ____return false;
   }
   ${FINAL}
   // GOOD: Whitespace matches exactly


   ✅ SUCCESS PATTERNS:

   Pattern 1: Include function signature
   ${ORIGINAL}
   export function calculateTotal(items: Item[]) {
     const subtotal = items.reduce((sum, item) => sum + item.price, 0)
     return subtotal
   }
   ${DIVIDER}
   export function calculateTotal(items: Item[]) {
     const subtotal = items.reduce((sum, item) => sum + item.price, 0)
     const tax = subtotal * 0.08
     return subtotal + tax
   }
   ${FINAL}
   // GOOD: Function signature makes it unique


   Pattern 2: Include comments as landmarks
   ${ORIGINAL}
   // Database configuration
   const dbHost = "localhost"
   ${DIVIDER}
   // Database configuration
   const dbHost = process.env.DB_HOST || "localhost"
   ${FINAL}
   // GOOD: Comment acts as unique identifier


   Pattern 3: Multiple small changes
   ${ORIGINAL}
   const isAdmin = false
   ${DIVIDER}
   const isAdmin = true
   ${FINAL}

   ${ORIGINAL}
   const canEdit = false
   ${DIVIDER}
   const canEdit = true
   ${FINAL}
   // GOOD: Two separate non-overlapping blocks for two changes
   ```

2. **Update context size guidance** (in replaceTool_description around line 120):
   ```
   3. Each ORIGINAL text must be large enough to uniquely identify the change. Context guidelines:

      Minimum context (2-3 lines):
      - 1 line before target
      - Target line(s)
      - 1 line after target

      Ideal context (3-5 lines):
      - 2 lines before (especially if one is a comment)
      - Target line(s)
      - 2 lines after
      - Include function signature if changing function body

      Maximum context:
      - Only include what's needed for uniqueness
      - Don't copy entire functions (defeats the purpose)
      - Stop at natural boundaries (function end, blank line)

      Context elements that increase uniqueness:
      ✓ Comments (especially distinctive ones)
      ✓ Function signatures
      ✓ Variable declarations with unique names
      ✓ Import statements
      ✓ Class/interface names
   ```

---

### Phase 6: Align Compact Mode (NEW)

**Files to modify**: Lines 819-901 in prompts.ts (chat_systemMessage_compact)

**Purpose**: Ensure compact version reflects same improvements as full version

**Changes**:

Apply parallel improvements to `chat_systemMessage_compact`:
1. Tool description improvements (condensed versions)
2. Decision framework clarifications (abbreviated)
3. Error recovery guidance (condensed)
4. Tool workflow patterns (shortened)

**Example compact version update** (line 863):
```typescript
// Before:
`Consultation: Read-only exploration + advice. Tools: search/read (max 3 calls). Safety: Cannot edit/run commands. For implementation → suggest Agent mode.`

// After:
`Consultation: Read-only (max 3 tools). Use tools when question needs THIS codebase context, not for general programming questions. Available: search_for_files (content), search_pathnames_only (names), read_file, ls_dir, get_dir_tree. Cannot edit/run commands → suggest Agent mode for implementation.`
```

Maintain the ~40% size reduction while incorporating key improvements from Phases 1-5.

---

## Testing & Validation

### Post-Implementation Testing

**Run all 12 baseline test cases** from Phase 0 and compare:

| Metric | Before | After | Target |
|--------|--------|-------|--------|
| Correct tool selection (first try) | ___ | ___ | >90% |
| Unnecessary tool calls | ___ | ___ | <10% |
| Error self-recovery rate | ___ | ___ | >80% |
| Proactive brain checks | ___ | ___ | >70% for arch decisions |
| SEARCH/REPLACE errors | ___ | ___ | <5% |

### Manual Validation Checklist

**Tool Selection Tests**:
- [ ] Content search uses search_for_files
- [ ] Filename search uses search_pathnames_only
- [ ] Large file reading uses start_line/end_line appropriately
- [ ] Existing file edits use edit_file
- [ ] New file creation uses create_file_or_folder + rewrite_file

**Mode Behavior Tests**:
- [ ] Chat mode doesn't over-explore for general questions
- [ ] Agent mode validates after each edit
- [ ] Plan mode produces flexible phase counts (3-12)
- [ ] Hybrid mode (if applicable) coordinates planner + coder

**Error Recovery Tests**:
- [ ] File not found → searches for correct path
- [ ] 0 search results → tries broader terms or asks user
- [ ] 50+ search results → refines or asks user to narrow
- [ ] Edit parse error → reads file first to get exact formatting

**Brain Integration Tests**:
- [ ] Architectural decisions trigger search_lessons
- [ ] User corrections prompt "Should I remember this?"
- [ ] Brain tools available in correct modes (Agent/Plan=write, Chat=read-only)

**Workflow Tests**:
- [ ] "Find and fix" workflow executes correctly
- [ ] "Explore then act" pattern with get_dir_tree works
- [ ] Multi-file changes edit one at a time with validation

### Rollback Strategy

If post-implementation metrics show degradation:

1. **Immediate rollback**:
   ```bash
   git log --oneline  # Find commit before Phase 1
   git revert <commit-hash>
   ```

2. **Partial rollback** (if only one phase caused issues):
   - Identify problematic phase
   - Revert specific changes from that phase
   - Keep improvements from successful phases

3. **A/B Testing** (recommended):
   - Keep original prompts in `prompts.ts.backup`
   - Run production with new prompts for 1 week
   - Compare error rates, user feedback, tool usage patterns
   - Roll back if clear degradation

## Success Metrics

These fine-tuning changes should improve:

- ✅ **Tool selection accuracy**: 85% → 90%+ correct tool on first attempt
- ✅ **Reduced unnecessary tool calls**: Especially in Chat mode (30% reduction)
- ✅ **Better error recovery**: AI self-corrects 80%+ of path/search failures
- ✅ **Proactive brain usage**: 70%+ of architectural decisions check lessons first
- ✅ **Clearer edit boundaries**: <5% SEARCH/REPLACE block errors (from ~15%)
- ✅ **Workflow execution**: Multi-step tasks follow logical tool chains
- ✅ **Mode-appropriate behavior**: Chat doesn't over-explore, Agent validates, Plan structures properly
- ✅ **Terminology consistency**: "FULL ABSOLUTE path" used uniformly

## Implementation Timeline

- **Phase 0**: 30-45 minutes (baseline capture)
- **Phase 1**: 45-60 minutes (tool descriptions)
- **Phase 2**: 45-60 minutes (decision frameworks)
- **Phase 3**: 60-75 minutes (workflows & error recovery)
- **Phase 4**: 45-60 minutes (mode-specific improvements)
- **Phase 5**: 45-60 minutes (search/replace guidance)
- **Phase 6**: 30-45 minutes (compact mode alignment)
- **Testing**: 60-90 minutes (run all test cases, compare metrics)

**Total**: 6-8 hours

## Commit Strategy

After each phase:
```bash
git add src/vs/workbench/contrib/void/common/prompt/prompts.ts
git commit -m "Phase X: [description] - prompts only, no architecture changes"
```

Final commit:
```bash
git add prompt-test-cases.md
git commit -m "Prompt fine-tuning complete - baseline vs results documented"
```

---

## Summary of Enhancements

This enhanced plan adds:

1. ✅ **Phase 0: Baseline metrics** - Measurable before/after comparison
2. ✅ **Tool chaining workflows** - Common patterns documented
3. ✅ **Concrete examples** - Routine vs risky, architectural decisions
4. ✅ **Quantified vague terms** - "Brief" = 1-2 sentences, "large file" = >500 lines
5. ✅ **Compact mode alignment** - Phase 6 ensures consistency
6. ✅ **Success patterns** - Not just failure modes
7. ✅ **Terminology consistency** - "FULL ABSOLUTE path" everywhere
8. ✅ **Partial match handling** - When searches return 50+ results
9. ✅ **Error recovery playbook** - Specific steps for each error type
10. ✅ **Rollback strategy** - A/B testing and revert procedures


