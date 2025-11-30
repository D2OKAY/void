# Hybrid Agent System - Technical Reference

**Last Updated:** 2025-01-15
**Version:** 1.0
**Critical System Component**

---

## Table of Contents

1. [System Architecture](#system-architecture)
2. [Critical Bug Fixed](#critical-bug-fixed)
3. [Execution Flow](#execution-flow)
4. [Code Locations](#code-locations)
5. [Message Handling](#message-handling)
6. [Configuration](#configuration)
7. [Troubleshooting](#troubleshooting)

---

## System Architecture

### Overview
The Hybrid Agent system uses a **two-model architecture** for complex task execution:

- **Planner Model:** High-level reasoning, plan creation, decision-making
- **Coder Model:** Tool execution, file operations, autonomous step completion

### Components

```
┌─────────────────────────────────────────────────────────────────┐
│                      User Input (Complex Task)                   │
└─────────────────┬───────────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────────┐
│              decidePlanningNeeded (Planner Model)                │
│  - Analyzes task complexity                                      │
│  - Returns JSON: { needsPlan: boolean, reasoning: string }       │
└─────────────────┬───────────────────────────────────────────────┘
                  │
        ┌─────────┴─────────┐
        │ Complex?          │ Simple?
        ▼                   ▼
┌───────────────────┐  ┌────────────────────────┐
│   createPlan      │  │  Direct Execution      │
│  (Planner Model)  │  │  (Agent Mode)          │
│  - Multi-step     │  │  - Single execution    │
│    structured     │  │  - Uses planner model  │
│    plan           │  │                        │
└─────┬─────────────┘  └────────────────────────┘
      │
      ▼
┌─────────────────────────────────────────────────────────────────┐
│              _executeHybridPlan (Orchestration)                  │
│  - Loop through plan steps                                       │
│  - Execute each step with Coder model                            │
│  - Accumulate findings for context                               │
└─────────────────┬───────────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────────┐
│              executeStep (Coder Model)                           │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ 1. Create temp thread for isolated execution             │  │
│  │ 2. System Message: Hybrid coder instructions             │  │
│  │ 3. User Message: Step description                        │  │
│  │ 4. Agent Mode: FORCED (tools available)                  │  │
│  │ 5. Execute with full tool access                         │  │
│  │ 6. Extract results (text + tool outputs)                 │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                   │
│  Retry Logic:                                                    │
│  - First failure → Enhanced instructions → Retry                 │
│  - Second failure → Planner takeover                             │
└───────────────────────────────────────────────────────────────────┘
```

---

## Critical Bug Fixed

### The Problem (Root Cause)

**CRITICAL BUG:** System messages were being sent in the **USER message role** instead of the **SYSTEM message role**.

#### Original Code (BROKEN):
```typescript
// ❌ WRONG - hybridAgentService.ts
const instructionMessage = `${hybrid_coder_systemMessage(step, planContext, retryContext)}\n\nExecute step: ${step.description}`;

// ❌ WRONG - chatThreadService.ts
await this.executeAgentTask({
    threadId: execThreadId,
    initialMessage: params.instructionMessage,  // Contains system message!
    modelSelection: params.modelSelection,
    modelSelectionOptions: params.modelSelectionOptions
    // Missing: systemMessageOverride
    // Missing: forceAgentMode
});
```

#### Why This Broke Everything:
1. **LLMs expect system instructions in system role** - GPT-4, Claude, Grok all distinguish between system/user messages
2. **System instructions in user message confuses the model** - Model doesn't understand its role
3. **Agent mode not explicitly enabled** - Tools might not be available
4. **Result:** Model produces no output → "Response from model was empty" error

### The Fix (3-Layer Architecture)

#### Layer 1: Separate System from User Messages
**File:** `src/vs/workbench/contrib/void/browser/hybridAgentService.ts`

```typescript
// ✅ CORRECT - Lines 265-281
const systemMessageOverride = `${hybrid_coder_systemMessage(step, planContext, retryContext)}${workspaceInfo}`;
const instructionMessage = `Execute step: ${step.description}`;

return await executeCallback({
    instructionMessage,           // ✅ User message only
    systemMessageOverride,        // ✅ System message separate!
    modelSelection: coderModel,
    modelSelectionOptions: coderModelOptions
});
```

#### Layer 2: Pass Through System Override
**File:** `src/vs/workbench/contrib/void/browser/chatThreadService.ts`

```typescript
// ✅ CORRECT - Lines 854-862
await this.executeAgentTask({
    threadId: execThreadId,
    initialMessage: params.instructionMessage,
    systemMessageOverride: params.systemMessageOverride,  // ✅ Passed through!
    modelSelection: params.modelSelection,
    modelSelectionOptions: params.modelSelectionOptions,
    forceAgentMode: true  // ✅ Ensures tools available!
});
```

**Function Signature Update - Lines 2295-2297:**
```typescript
async executeAgentTask({
    threadId,
    initialMessage,
    systemMessageOverride,  // ✅ Added
    modelSelection,
    modelSelectionOptions,
    forceAgentMode  // ✅ Added
}: { ... })
```

#### Layer 3: Use System Override
**File:** `src/vs/workbench/contrib/void/browser/convertToLLMMessageService.ts`

```typescript
// ✅ CORRECT - Line 759
const fullSystemMessage = systemMessageOverride ?? await this._generateChatMessagesSystemMessage(chatMode, specialToolFormat);
```

---

## Execution Flow

### Phase 1: Planning Decision
**Function:** `decidePlanningNeeded` (hybridAgentService.ts:75-121)

**LLM Call:**
```typescript
{
  messagesType: 'chatMessages',
  messages: [
    { role: 'system', content: hybrid_plannerDecision_systemMessage },
    { role: 'user', content: `Task: ${userTask}` }
  ],
  modelSelection: plannerModel,
  chatMode: null
}
```

**Expected Response:**
```json
{
  "needsPlan": true|false,
  "reasoning": "brief explanation"
}
```

**Critical:** Response MUST be valid JSON. Uses `extractJSON()` to handle markdown wrappers.

---

### Phase 2: Plan Creation (If Needed)
**Function:** `createPlan` (hybridAgentService.ts:124-177)

**LLM Call:**
```typescript
{
  messagesType: 'chatMessages',
  messages: [
    { role: 'system', content: hybrid_createPlan_systemMessage(context) },
    { role: 'user', content: `Task: ${userTask}` }
  ],
  modelSelection: plannerModel,
  chatMode: null
}
```

**Expected Response:**
```json
{
  "title": "Task title",
  "summary": "Task overview",
  "steps": [
    {
      "stepId": "unique-id",
      "description": "Actionable step description",
      "toolsToUse": ["tool_name"],
      "expectedFiles": ["path/to/file"],
      "riskLevel": "safe|moderate|risky",
      "dependencies": ["other-step-id"]
    }
  ]
}
```

**Validation:**
- Plan must have at least 1 step (chatThreadService.ts:776-778)
- All required fields must be present

---

### Phase 3: Step Execution
**Function:** `executeStep` (hybridAgentService.ts:246-296)

**Process:**
1. Build system message with coder instructions + workspace context
2. Create user message with step description
3. Execute via callback in temp thread
4. Agent mode is FORCED (tools available)
5. Extract results from temp thread

**Critical Code:**
```typescript
const systemMessageOverride = `${hybrid_coder_systemMessage(step, planContext, retryContext)}${workspaceInfo}`;
const instructionMessage = `Execute step: ${step.description}`;

await executeCallback({
    instructionMessage,
    systemMessageOverride,  // ✅ Separate!
    modelSelection: coderModel,
    modelSelectionOptions: coderModelOptions
});
```

**System Message Structure:**
```
You are executing a step from a plan. Use tools proactively.

CONTEXT:
Plan: [plan summary]
Step: [step description]
Tools: [suggested tools]
Previous steps' findings: [accumulated context]

INSTRUCTIONS:
1. Use tools immediately
2. No permission needed
3. Provide summary after gathering info
...

WORKSPACE CONTEXT:
- Workspace folders: [paths]
- Active file: [file]
```

---

### Phase 4: Result Extraction
**Function:** executeCallback (chatThreadService.ts:832-935)

**Process:**
1. Create temporary thread for isolated execution
2. Execute agent task with system override
3. Extract all messages (assistant + tool results)
4. Build fullOutput from text + key tool results
5. Check for errors
6. **CRITICAL:** Handle tool-only responses (lines 912-921)

**Tool-Only Response Handling:**
```typescript
const hasActualOutput = fullOutput.trim().length > 0 || conversationMessages.length > 0;
const isEmptyResponseError = errorMessage.includes('Response from model was empty');

if (hasActualOutput && isEmptyResponseError) {
    // ✅ Override error - we have useful output from tools
    hadError = false;
    errorMessage = '';
}
```

**Result Structure:**
```typescript
{
    success: boolean,
    output: string,  // Full text + abbreviated tool results
    conversationMessages: Array<{role, content, toolName}>,
    error?: string
}
```

---

### Phase 5: Retry Logic
**Function:** _executeHybridPlan (chatThreadService.ts:987-1020)

**First Failure:**
```typescript
if (!response.success) {
    // 1. Show error message
    this._addMessageToThread(threadId, {
        displayContent: `⚠️ Step failed on first attempt: ${errorDetail}\n\nRetrying with enhanced instructions...`
    });

    // 2. Get enhanced instructions from planner
    const enhancedInstructions = await this._hybridAgentService.enhanceStepInstructions(
        step,
        response.error!,
        response.output
    );

    // 3. Retry with enhanced context
    response = await this._hybridAgentService.executeStep(
        step,
        retryContextWithFindings,
        executeCallback,
        response.error,
        workspaceContext
    );
}
```

**Second Failure (Planner Takeover):**
```typescript
if (!response.success) {
    // 1. Show takeover message
    this._addMessageToThread(threadId, {
        displayContent: `⚠️ Step failed after retry. Error: ${response.error}\n\n🔄 Switching to planner model...`
    });

    // 2. Planner attempts execution
    try {
        const plannerResponse = await this._hybridAgentService.plannerTakeover(step, response.error!, executeCallback);
        response = plannerResponse;
    } catch (error) {
        // Planner also failed - show error
    }
}
```

---

## Code Locations

### Core Files

| File | Lines | Purpose |
|------|-------|---------|
| `hybridAgentService.ts` | 75-121 | decidePlanningNeeded |
| `hybridAgentService.ts` | 124-177 | createPlan |
| `hybridAgentService.ts` | 179-217 | enhanceStepInstructions |
| `hybridAgentService.ts` | 246-296 | executeStep |
| `hybridAgentService.ts` | 298-323 | plannerTakeover |
| `chatThreadService.ts` | 746-803 | _runHybridAgent |
| `chatThreadService.ts` | 805-1113 | _executeHybridPlan |
| `chatThreadService.ts` | 832-935 | executeCallback (temp thread) |
| `chatThreadService.ts` | 2295-2313 | executeAgentTask |
| `convertToLLMMessageService.ts` | 746-780 | prepareLLMChatMessages |
| `prompts.ts` | 1262-1363 | Hybrid agent prompts |

### Type Definitions

| File | Purpose |
|------|---------|
| `hybridAgentServiceTypes.ts` | IHybridAgentService interface |
| `hybridAgentTypes.ts` | HybridPlan, HybridPlanStep, CoderResponse |
| `hybridPlanServiceTypes.ts` | IHybridPlanService interface |

### Critical Constants

```typescript
// chatThreadService.ts:50
const STEP_EXECUTION_TIMEOUT = 180000; // 3 minutes per step

// hybridAgentService.ts:42-43
const PLANNER_RETRIES = 3;
const PLANNER_RETRY_DELAY = 2500; // 2.5 seconds
```

---

## Message Handling

### System Message Flow

```
hybridAgentService.executeStep()
  ↓ Creates: systemMessageOverride
  ↓
executeCallback()
  ↓ Passes: params.systemMessageOverride
  ↓
executeAgentTask()
  ↓ Passes: systemMessageOverride
  ↓
_runChatAgent()
  ↓ Passes: systemMessageOverride
  ↓
prepareLLMChatMessages()
  ↓ Uses: systemMessageOverride ?? defaultSystemMessage
  ↓
prepareMessages()
  ↓ Creates: LLM messages with system in correct role
  ↓
sendLLMMessage()
  ↓ Sends to API with proper structure
```

### Message Roles

**CRITICAL:** System instructions MUST go in system role:

```typescript
// ✅ CORRECT
messages: [
  { role: 'system', content: hybrid_coder_systemMessage(...) },
  { role: 'user', content: 'Execute step: ...' }
]

// ❌ WRONG (Original bug)
messages: [
  { role: 'user', content: `${hybrid_coder_systemMessage(...)}\n\nExecute step: ...` }
]
```

---

## Configuration

### Settings Required

```json
{
  "chatMode": "hybrid",
  "hybridPlannerModel": {
    "providerName": "openai",
    "modelName": "gpt-4o-mini"
  },
  "hybridCoderModel": {
    "providerName": "openai",
    "modelName": "gpt-4o-mini"
  }
}
```

### Model Requirements

**Planner Model:**
- Must support JSON output
- Good reasoning capabilities
- Examples: GPT-4, GPT-4o-mini, Claude 3.5, Grok-beta

**Coder Model:**
- Must support tool calling
- Good at following instructions
- Examples: GPT-4, GPT-4o-mini, Claude 3.5, Grok-beta

**Both models can be the same** (e.g., both gpt-4o-mini).

---

## Troubleshooting

### "Response from model was empty"

**Cause:** System messages in wrong role (fixed in this version)

**Check:**
1. Verify `systemMessageOverride` is passed through all layers
2. Verify `forceAgentMode: true` in executeAgentTask
3. Check convertToLLMMessageService uses override

### Plan Creation Fails

**Possible Causes:**
- Invalid JSON from planner model
- Model doesn't follow JSON schema
- Network/API error

**Debug:**
```typescript
// In hybridAgentService.ts createPlan:
console.log('Raw planner response:', fullResponse);
console.log('Cleaned response:', cleanedResponse);
```

### Step Execution Times Out

**Cause:** Step takes > 3 minutes

**Solutions:**
1. Increase timeout in chatThreadService.ts:50
2. Break step into smaller sub-steps
3. Use faster model

### Empty Plan Created

**Validation:** Lines 776-778 in chatThreadService.ts catch this:
```typescript
if (!plan.steps || plan.steps.length === 0) {
    throw new Error('Planner created an empty plan...');
}
```

### Tools Not Available

**Cause:** Agent mode not forced

**Check:** Line 861 in chatThreadService.ts:
```typescript
forceAgentMode: true  // ✅ Must be present!
```

---

## Performance Considerations

### Timeouts
- Planning decision: 3 retries × 2.5s = ~7.5s max
- Plan creation: 3 retries × 2.5s = ~7.5s max
- Step execution: 3 minutes per step
- Total for 3-step plan: ~10-15 minutes max

### Context Accumulation
- Each step receives findings from previous steps
- Can grow large for many-step plans
- Automatically included in system message

### Tool Results
- Key tool results included in fullOutput
- Abbreviated to 500 chars per tool
- Full results available in conversationMessages

---

## Best Practices

1. **Use Hybrid Mode for:**
   - Multi-file research tasks
   - Architecture analysis
   - Complex refactoring
   - Code reviews across multiple files

2. **Don't Use Hybrid Mode for:**
   - Single file edits
   - Simple questions
   - Quick bug fixes

3. **Model Selection:**
   - Use same model for both (simpler)
   - Or: Stronger model for planner, faster for coder

4. **Plan Structure:**
   - 2-5 steps ideal
   - Each step should be self-contained
   - Use dependencies field to specify order

5. **Error Handling:**
   - First failure → retry with enhanced instructions
   - Second failure → planner takeover
   - Third failure → report to user

---

## Version History

**v1.0 (2025-01-15):**
- ✅ Fixed critical bug: System messages now in correct role
- ✅ Added forceAgentMode to ensure tools available
- ✅ Added empty plan validation
- ✅ Improved tool-only response handling
- ✅ Increased timeout to 3 minutes
- ✅ Streamlined prompts
- ✅ Enhanced error messages

---

## References

- [Agent Mode Documentation](#) - Similar flow, different orchestration
- [Brain/Lesson System](#) - For storing best practices
- [Tool System](#) - Available tools for coder model
- [LLM Message Service](#) - Low-level message sending

---

**END OF TECHNICAL REFERENCE**

