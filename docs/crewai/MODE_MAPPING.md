# CrewAI Mode Pattern Mapping

**Version:** 1.0
**Date:** November 30, 2025
**Status:** Initial Implementation Complete (Core v0.7)

---

## Overview

This document maps the TypeScript implementation of CrewAI Coding Mode in Void to CrewAI's core patterns from the Python framework. This ensures architectural fidelity and helps developers familiar with CrewAI understand and contribute to this codebase.

**Key Principle:** This is a faithful port of CrewAI's multi-agent orchestration patterns to TypeScript, not a superficial imitation. It adapts Python/LangChain constructs to Void's native TypeScript/LLM infrastructure while preserving CrewAI's conceptual model.

---

## Architecture Mapping

### Core Classes & Types

| CrewAI (Python) | Void TypeScript Implementation | File Location |
|-----------------|--------------------------------|---------------|
| `Agent` class | `CodingAgentProfile` type | `common/crewAIAgentTypes.ts` |
| `Task` class | `CodingStep` type | `common/crewAIAgentTypes.ts` |
| `Crew` class | `CodingPlan` type + `CrewAICodingService` | `common/crewAIAgentTypes.ts` + `browser/crewAICodingService.ts` |
| `TaskOutput` | `CodingStepOutput` type | `common/crewAIAgentTypes.ts` |
| `CrewOutput` | `CodingResult` type | `common/crewAIAgentTypes.ts` |
| `CrewPlanner` | `buildPlan()` method | `browser/crewAICodingService.ts:176` |

### Agent Profile Mapping

CrewAI's `Agent` initialization:

```python
# CrewAI (Python)
agent = Agent(
    role='Code Researcher',
    goal='Analyze codebase and provide insights',
    backstory='Expert code analyst...',
    tools=[read_file, search_files],
    llm=ChatOpenAI(model='gpt-4'),
    allow_delegation=False
)
```

Void's `CodingAgentProfile`:

```typescript
// Void TypeScript
const researcher: CodingAgentProfile = {
    role: 'Code Researcher',
    goal: 'Analyze the codebase, find relevant files, understand project structure',
    backstory: 'You are an expert code analyst...',
    tools: ['read_file', 'search_for_files', 'get_dir_tree', 'search_in_file'],
    defaultModel: { featureName: 'Chat', providerName: 'openAI', modelName: 'gpt-4' },
    approvalType: undefined // No approval for read-only ops
}
```

**Key Differences:**
- Tools: CrewAI uses `BaseTool` instances → Void uses builtin tool names (strings)
- LLM: CrewAI uses LangChain LLMs → Void uses `ModelSelection` with `ILLMMessageService`
- Delegation: Not implemented in v1 (all agents are leaf nodes)

---

## Execution Flow Mapping

### 1. Task Initiation

**CrewAI:** `Crew.kickoff()`
**Void:** `CrewAICodingService.executeCodingTask()`

```python
# CrewAI (crew.py:1029-1115)
def kickoff(self, inputs: dict = {}) -> CrewOutput:
    self._execution_span = self._telemetry.crew_execution_span(self, inputs)
    # ... planning and task execution
    task_outputs = self._execute_tasks()
    # ... result synthesis
    return CrewOutput(raw=output, tasks_output=task_outputs)
```

```typescript
// Void (crewAICodingService.ts:75)
async executeCodingTask(userTask: string, context: ChatContext, onProgress?: CrewAIProgressCallback): Promise<CodingResult> {
    const plan = await this.buildPlan(userTask, context);
    // ... step execution loop
    const allStepOutputs = await this._executeSteps(plan, context);
    return { success: true, finalSummary, allStepOutputs, ... };
}
```

**Mapping:**
- `inputs` → `userTask` + `ChatContext` (workspace-aware context)
- `_execute_tasks()` → Sequential loop through `plan.steps`
- `CrewOutput` → `CodingResult`
- Telemetry → Progress callbacks (`onProgress`)

---

### 2. Task Planning

**CrewAI:** `CrewPlanner` class
**Void:** `buildPlan()` method

```python
# CrewAI (uses LLM to generate plan)
planner = CrewPlanner(tasks, agents)
plan = planner.plan(crew=self)
```

```typescript
// Void (crewAICodingService.ts:176)
async buildPlan(userTask: string, context: ChatContext): Promise<CodingPlan> {
    // v1: Heuristic-based planning
    // TODO v2: Use LLM for plan generation
    const taskLower = userTask.toLowerCase();

    if (taskLower.includes('explain')) {
        // researcher + documenter
    } else if (taskLower.includes('test')) {
        // researcher + tester
    } else if (taskLower.includes('fix')) {
        // researcher + developer + reviewer
    }
    // ...
}
```

**Current Status:** v1 uses heuristics; v2 will use LLM-based planning like CrewAI

---

### 3. Context Aggregation

**CrewAI:** `Crew._get_context()` (crew.py:1305-1313)
**Void:** `CrewAICodingService._getStepContext()`

```python
# CrewAI (crew.py:1305-1313)
def _get_context(self, task: Task, task_outputs: List[TaskOutput]) -> str:
    if task.context:
        context_tasks = [t for t in self.tasks if t in task.context]
        context = aggregate_raw_outputs_from_task_outputs(
            [output for output in task_outputs if output.task in context_tasks]
        )
        return context
    return ""
```

```typescript
// Void (crewAICodingService.ts:423)
private _getStepContext(step: CodingStep, previousOutputs: CodingStepOutput[]): string {
    if (step.contextStepIds.length === 0) return '';

    const relevantOutputs = previousOutputs.filter(output =>
        step.contextStepIds.includes(output.stepId)
    );

    // Aggregate raw outputs (like CrewAI's aggregate_raw_outputs_from_task_outputs)
    const contextParts = relevantOutputs.map(output =>
        `=== Output from previous step ===\n${output.detailedText}\n`
    );

    return contextParts.join('\n');
}
```

**Mapping:**
- `task.context` → `step.contextStepIds`
- `aggregate_raw_outputs_from_task_outputs()` → Manual aggregation of `detailedText`
- Context filtering by task dependencies → Context filtering by step IDs

---

### 4. Agent Task Execution

**CrewAI:** `Agent.execute_task()` → `agent_executor.invoke()` (agent/core.py:277-550)
**Void:** `CrewAICodingService.executeStep()`

```python
# CrewAI (agent/core.py:277-550)
def execute_task(self, task: Task, context: str = None) -> TaskOutput:
    # Build prompt with role/goal/backstory
    prompt = self._build_prompt(task, context)
    # Execute with LangChain agent executor
    result = self.agent_executor.invoke({"input": prompt})
    # Parse tools used, validate output
    return TaskOutput(raw=result, agent=self.role, ...)
```

```typescript
// Void (crewAICodingService.ts:319)
async executeStep(step: CodingStep, context: string, workspaceContext: ChatContext): Promise<CodingStepOutput> {
    const agentProfile = getAgentProfile(step.agent);

    // Build agent system message with role/goal/backstory (similar to CrewAI prompt)
    const systemMessage = this._buildAgentSystemMessage(agentProfile, step, workspaceContext);
    const userMessage = this._buildUserMessage(step, context);

    // Execute with Void's LLM service (agent mode for tool calling)
    await this.llmMessageService.sendLLMMessage({
        messages: [
            { role: 'system', content: systemMessage },
            { role: 'user', content: userMessage }
        ],
        chatMode: 'agent', // Enables tool calling
        onToolCall: ({ toolName, result }) => { /* track tools */ },
        onFinalMessage: () => { /* completion */ }
    });

    return { stepId, summary, detailedText, toolsUsed, filesRead, filesWritten, ... };
}
```

**Mapping:**
- `agent_executor.invoke()` → `llmMessageService.sendLLMMessage()` with `chatMode: 'agent'`
- LangChain tools → Void builtin tools (via `IToolsService`)
- Prompt building → System message with role/goal/backstory + user message with context
- `TaskOutput` → `CodingStepOutput`

---

## Quality Control Mapping

### Guardrails

**CrewAI:** `Task.guardrails` (task.py:545-570)

```python
# CrewAI (task.py:545-570)
def execute_with_guardrails(self):
    for attempt in range(self.max_retry + 1):
        output = self.agent.execute_task(self)
        if self._validate_output(output):
            return output
        # Retry with enhanced instructions
    return output  # Return last attempt
```

**Void Status:** ⚠️ **PLANNED BUT NOT YET IMPLEMENTED**

```typescript
// TODO: Implement in crewAICodingService.ts executeStep()
// After step execution:
// 1. For developer/tester: check lint errors, syntax validity
// 2. For reviewer/documenter: check content length, key sections
// 3. On failure: retry once with enhanced instructions
// 4. Surface clear error if retry fails
```

**Implementation Location:** `crewAICodingService.ts:379` (after LLM execution)

---

### Error Recovery

**CrewAI:** Handles errors at task level with fallback strategies
**Void:** Implements partial results and error surfacing

```typescript
// Void (crewAICodingService.ts:155)
catch (error) {
    return {
        success: false,
        finalSummary: `Execution failed: ${errorMessage}`,
        allStepOutputs, // Partial results included
        errors: [errorMessage]
    };
}
```

**Pattern:** Fail gracefully with partial results, similar to CrewAI's error handling

---

## Output Structure Mapping

### Task Output

**CrewAI:** `TaskOutput`

```python
class TaskOutput:
    raw: str              # Raw output text
    pydantic: BaseModel   # Structured output
    json_dict: dict       # JSON representation
    agent: str            # Agent that executed
    output_format: str    # Format type
```

**Void:** `CodingStepOutput`

```typescript
type CodingStepOutput = {
    stepId: string;
    summary: string;              // Brief summary (like raw excerpt)
    detailedText: string;         // Full output (like raw)
    toolsUsed: BuiltinToolName[];
    filesRead: URI[];             // Void-specific: track file access
    filesWritten: URI[];          // Void-specific: track changes
    lintErrors: LintErrorItem[];  // Void-specific: code quality
    warnings: string[];
    tokenUsage: number | undefined;
    durationMs: number;
}
```

**Enhancements:** Void adds IDE-specific metadata (files, lints, metrics)

---

### Crew Output

**CrewAI:** `CrewOutput`

```python
class CrewOutput:
    raw: str                    # Final output text
    tasks_output: List[TaskOutput]
    token_usage: int
    pydantic: BaseModel
    json_dict: dict
```

**Void:** `CodingResult`

```typescript
type CodingResult = {
    success: boolean;
    finalSummary: string;              // Like raw
    allStepOutputs: CodingStepOutput[]; // Like tasks_output
    changedFiles: URI[];               // Void-specific
    suggestedNextActions: string[];    // Void-specific: guide user
    totalTokenUsage: number;           // Like token_usage
    totalDurationMs: number;
    errors?: string[];
}
```

**Enhancements:** Void adds success flag, suggested actions, changed files tracking

---

## Design Decisions & Rationale

### What We Kept (Faithful to CrewAI)

1. ✅ **Multi-agent orchestration pattern** - Multiple specialized agents with distinct roles
2. ✅ **Role/Goal/Backstory agent definition** - Same prompt structure
3. ✅ **Task-based execution model** - Steps = Tasks with dependencies
4. ✅ **Context aggregation** - Previous outputs inform next steps
5. ✅ **Sequential execution** - Default is sequential (like CrewAI's sequential process)
6. ✅ **Tool integration** - Agents use tools to interact with environment
7. ✅ **Retry logic** - Exponential backoff for robustness

### What We Adapted (Platform Differences)

1. 🔄 **Python → TypeScript** - Language adaptation (types, async/await patterns)
2. 🔄 **LangChain → Void LLM Service** - Native integration with `ILLMMessageService`
3. 🔄 **BaseTool → Builtin Tools** - Use Void's existing tool ecosystem
4. 🔄 **Planning** - v1 uses heuristics (simpler), v2 will use LLM (like CrewAI)
5. 🔄 **Telemetry → Progress Callbacks** - Void-specific progress reporting

### What We Scoped Out (Future Work)

1. ⏸️ **Memory Systems** - CrewAI's STM/LTM/Entity/External memory (can use brain tools later)
2. ⏸️ **Delegation** - Agent-to-agent delegation (not needed for coding tasks)
3. ⏸️ **Hierarchical Process** - Manager agent pattern (v2 enhancement)
4. ⏸️ **Conditional Tasks** - Branching logic (v2 enhancement)
5. ⏸️ **Flows** - Advanced orchestration with routers (v2 enhancement)

---

## Implementation Status

### ✅ Implemented (v0.7)

- Core type system (`CodingAgentProfile`, `CodingStep`, `CodingPlan`, etc.)
- 5 agent profiles (researcher, developer, reviewer, tester, documenter)
- Service architecture with DI (`CrewAICodingService`)
- Execution flow (`executeCodingTask`, `executeStep`)
- Context aggregation (`_getStepContext`)
- Heuristic-based planning
- Retry logic with exponential backoff
- UI integration (chat mode dropdown, routing in `chatThreadService`)
- Progress callbacks with status updates
- Checkpoint system for rollback

### ⚠️ Partially Implemented

- **Settings** - Types exist, no UI or defaults
- **Metrics** - Structure exists, token usage not captured
- **Error handling** - Basic error handling, no guardrails

### ❌ Not Yet Implemented

- **Human-in-the-loop approval** (Section 7 of plan)
  - Plan approval for complex tasks
  - Step-level approval for `requiresHumanApproval === true`
  - Clarification requests
  - Integration with `autoApprove` settings
- **Guardrails** (Section 6 of plan)
  - Lint checking after developer/tester steps
  - Content validation for reviewer/documenter
  - Retry on validation failure
- **Parallelism** (Section 6 of plan)
  - Parallel execution of independent steps
  - Respecting `crewAIMaxConcurrentSteps`
- **Settings UI** (Section 9 of plan)
- **Tests** (Section 11 of plan)
- **Documentation** (this file is the start!)

---

## Code Reference Map

### Key Files

| File | Purpose | Lines |
|------|---------|-------|
| `common/crewAIAgentTypes.ts` | Core type definitions | 100 |
| `common/crewAIAgentProfiles.ts` | Agent profiles (5 agents) | 72 |
| `common/crewAICodingServiceTypes.ts` | Service interface | 66 |
| `browser/crewAICodingService.ts` | Main service implementation | 595 |
| `browser/chatThreadService.ts` | Integration & routing | 150 (added) |
| `common/voidSettingsTypes.ts` | Settings types | 3 (added) |
| `react/.../SidebarChat.tsx` | UI mode selector | 4 (added) |

### Key Methods with CrewAI Mapping

```typescript
// Entry point (like Crew.kickoff)
CrewAICodingService.executeCodingTask() // Line 75

// Planning (like CrewPlanner)
CrewAICodingService.buildPlan() // Line 176

// Agent execution (like Agent.execute_task)
CrewAICodingService.executeStep() // Line 319

// Context aggregation (like Crew._get_context)
CrewAICodingService._getStepContext() // Line 423

// Prompt building (like Agent._build_prompt)
CrewAICodingService._buildAgentSystemMessage() // Line 444
CrewAICodingService._buildUserMessage() // Line 486
```

---

## Future Enhancements (v2+)

### Short-term (Next Sprint)

1. **Human-in-the-loop approval** - Block execution on critical operations
2. **Guardrails** - Validate outputs, retry on failure
3. **Settings UI** - User configuration panel
4. **Default settings** - Sensible defaults for new installs

### Medium-term (Next Quarter)

1. **LLM-based planning** - Replace heuristics with LLM planner (like CrewAI)
2. **Parallelism** - Execute independent steps concurrently
3. **Tests** - Unit and integration tests
4. **Metrics logging** - Capture token usage, duration, success rates

### Long-term (Future)

1. **Memory systems** - STM/LTM using brain tools
2. **Conditional tasks** - Branching logic based on step outcomes
3. **Hierarchical orchestration** - Manager agent for very complex tasks
4. **Custom agents** - User-definable agents beyond the built-in 5
5. **MCP standardization** - Expose as MCP server for broader ecosystem

---

## Contributing

When modifying CrewAI mode, please:

1. **Preserve pattern fidelity** - Keep architectural alignment with CrewAI
2. **Update this document** - Document any new mappings or deviations
3. **Reference CrewAI source** - Add inline comments like `// Following CrewAI pattern (crew.py:123)`
4. **Test thoroughly** - Ensure changes don't break existing orchestration
5. **Consider v2 features** - Design for extensibility (memory, flows, etc.)

---

## References

- **CrewAI GitHub:** https://github.com/joaomdmoura/crewAI
- **CrewAI Docs:** https://docs.crewai.com/
- **Key CrewAI Files:**
  - `crew.py` - Main orchestrator (lines 1029-1115, 1305-1313)
  - `agent/core.py` - Agent execution (lines 277-550)
  - `task.py` - Task definition and guardrails (lines 545-570)
- **Void Implementation Plan:** `crewai-void-implementation-plan.md`

---

**Maintained by:** Void Development Team
**Last Updated:** November 30, 2025
**Next Review:** After v2 features implemented


