# Void AI Prompt System Documentation

This folder contains documentation for Void's AI prompt system improvements completed in December 2024.

## Quick Overview

Void uses sophisticated prompts to guide AI behavior across three modes: **Chat**, **Plan**, and **Agent**. These prompts were recently fine-tuned to make the AI more logical, context-aware, and effective.

## Key Improvements

### 1. **Purpose-Driven Design**
Every mode now explains WHY the user chose it, helping the AI understand its role:
- **Chat Mode**: Understanding and advice (read-only)
- **Plan Mode**: Architecture and design before implementation
- **Agent Mode**: Autonomous execution with full tool access

### 2. **Reasoning Frameworks**
All modes now include explicit thinking patterns:
- **Thinking Discipline**: Forces the AI to clarify goals before acting
- **Confidence Calibration**: Concrete definitions (HIGH/MEDIUM/LOW with risk %)
- **80/20 Rule**: Minimal investigation for maximum value (Chat mode)

### 3. **Error Prevention**
- Enhanced edit precision checklist
- "Show your reasoning" before tool calls
- Graceful degradation when stuck (no spinning in circles)
- Unexpected results handling (PAUSE → STATE → REASON → DECIDE)

### 4. **User Calibration**
- Detect beginner vs expert signals
- Match response length to question complexity
- Response calibration by question type

### 5. **Explicit "WHY" Explanations**
Every rule now includes reasoning:
- "Read before editing: WHY: Assuming content is #1 cause of failed edits"
- "3-12 phases ONLY: WHY: Under 3 = too vague. Over 12 = too detailed"

## Files in This Folder

### Analysis Documents
- **`PROMPT_ANALYSIS_CHAT_MODE.md`** - Detailed Chat mode analysis with line-by-line improvements
- **`PROMPT_ANALYSIS_PLAN_MODE.md`** - Plan mode analysis and recommendations
- **`PROMPT_ANALYSIS_AGENT_MODE.md`** - Agent mode analysis with confidence calibration details

### Implementation Reference
- **`PROMPT_DRAFT_REFINED.md`** - Complete refined prompts ready for implementation (THIS IS THE MAIN REFERENCE)
  - Contains all refined code blocks
  - Line number references
  - Quick reference for key patterns
  - Testing recommendations

### Planning Documents
- **`prompt-fine-tuning-enhanced.plan.md`** - Initial planning document
- **`void-prompts-assessment-vision.plan.md`** - Assessment and vision
- **`prompt-test-cases.md`** - Test cases for validation

## Implementation

The refined prompts are implemented in:
```
src/vs/workbench/contrib/void/common/prompt/prompts.ts
```

Specifically in the `chat_systemMessage` function which generates system messages for all three modes.

## Key Patterns Reference

### Thinking Discipline (All Modes)
```
• "The user wants..." [goal]
• "The key challenge is..." [obstacle]
• "My approach is..." [strategy]
• "I'll know I succeeded when..." [outcome]
```

### Chat: 80/20 Rule
```
Before ANY tool call: "Will this likely change my answer?"
YES → Make call | MAYBE → Answer + offer more | NO → Answer directly
```

### Plan: State Your Thinking
```
"I understand you want [goal]. The core challenge is [X]. My approach addresses this by [Y]."
```

### Agent: Confidence Calibration
```
HIGH (<10% risk): Read code, understand pattern → Proceed
MEDIUM (10-40%): Understand goal, not all deps → Proceed carefully
LOW (>40%): Guessing from names → Gather more or flag it
```

### Agent: Ready Check
```
"I am about to edit [FILE] at [LOCATION] because [REASON]."
```

### Agent: When Stuck
```
1. SUMMARIZE what happened
2. HYPOTHESIZE why
3. OFFER 2-3 options
```

## Testing

After implementation, test each mode:

**Chat Mode:**
- Simple question → Concise answer
- Complex question → Structured response
- Request for changes → Suggests Agent mode

**Plan Mode:**
- Feature request → See "My Understanding" + "Key Decisions"
- Vague request → Asks clarifying question
- Complex request → Proper phase breakdown (3-12 phases)

**Agent Mode:**
- Simple edit → States reasoning, edits, verifies
- Complex task → Shows confidence assessment
- Unexpected result → Pauses and reasons about it

## Future Improvements

Potential areas for further refinement:
1. Model-specific prompt optimization (small vs large models)
2. Domain-specific prompt variants (web dev vs systems programming)
3. User preference learning (formal vs casual tone)
4. Context-aware prompt compression for token efficiency

## Contact

For questions about the prompt system:
- Review `PROMPT_DRAFT_REFINED.md` for complete implementation details
- Check individual analysis files for deep dives into each mode
- Refer to the source code with inline comments

---

*Last updated: December 2024*

