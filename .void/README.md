# .void Folder - Project Brain & Documentation

This folder contains project-specific lessons, documentation, and configuration for the void project.

---

## Contents

### 📚 Documentation

**[HYBRID_AGENT_TECHNICAL_REFERENCE.md](./HYBRID_AGENT_TECHNICAL_REFERENCE.md)**
- **Purpose:** Complete technical reference for the hybrid agent system
- **Audience:** Developers working on or debugging hybrid agent code
- **Contents:**
  - System architecture diagram
  - Critical bug analysis (system message role issue)
  - Complete execution flow with code locations
  - Message handling patterns
  - Configuration requirements
  - Troubleshooting guide
  - Performance considerations
- **When to Use:** Reference this when modifying hybrid agent code, debugging issues, or understanding the architecture

**[ADD_LESSONS_SCRIPT.md](./ADD_LESSONS_SCRIPT.md)**
- **Purpose:** Instructions for adding lessons to the project brain
- **Contents:** 10 critical lessons about hybrid agent system with exact parameters for add_lesson tool
- **Note:** Lessons are already in brain.json, this is reference documentation

### 🧠 Project Brain

**[brain.json](./brain.json)**
- **Purpose:** Project-specific lessons learned about void's hybrid agent system
- **Format:** JSON file following void's brain schema
- **Automatic Loading:** Void automatically loads lessons from this file when working in this project
- **Contains:**
  - 10 critical lessons about hybrid agent architecture
  - High-priority lessons about system message handling
  - Error handling patterns
  - Configuration best practices
  - Response validation logic

**Lesson Categories:**
- `hybrid-agent-architecture` - Core architectural patterns
- `hybrid-agent-response-handling` - How to process model responses
- `hybrid-agent-validation` - Input/output validation
- `hybrid-agent-error-handling` - Retry and recovery patterns
- `hybrid-agent-context-management` - Context accumulation
- `hybrid-agent-configuration` - Settings and timeouts
- `hybrid-agent-json-parsing` - Robust JSON extraction
- `prompt-engineering` - Effective prompt strategies

---

## How Void's Brain System Works

### Project vs Global Lessons

**Project Lessons** (this file):
- Stored in `.void/brain.json`
- Specific to this project only
- Automatically loaded when working in this workspace
- Can be promoted to global if marked as global candidate

**Global Lessons**:
- Stored in user's global void settings
- Apply to all projects
- Shared best practices across codebases

### Automatic Injection

When you use void in **Agent** or **Gather** mode:
1. Void reads `.void/brain.json` from current project
2. Extracts relevant lessons based on:
   - Current file language/extension
   - Lesson priority (high always included)
   - Lesson category matching context
3. Injects lessons into system prompt
4. Model sees lessons as part of its instructions

Example injection:
```
GLOBAL LESSONS (apply to all projects):
- [typescript] Never use any type without explicit reason

PROJECT-SPECIFIC LESSONS:
- [hybrid-agent-architecture] Never put system instructions in user message role
- [hybrid-agent-architecture] Explicitly enable agent mode when tools are required
```

### Using Brain Tools

**Search for lessons:**
```xml
<search_lessons>
<query>hybrid agent</query>
<scope>project</scope>
</search_lessons>
```

**Add new lesson:**
```xml
<add_lesson>
<title>Short lesson title</title>
<description>Detailed lesson content</description>
<category>category-name</category>
<priority>high</priority>
<is_global_candidate>false</is_global_candidate>
<context>Optional context or example</context>
</add_lesson>
```

**Update existing lesson:**
```xml
<update_lesson>
<lesson_id>lesson-1737000000001-hybrid001</lesson_id>
<updates>{"priority": "high", "description": "Updated description"}</updates>
<scope>project</scope>
</update_lesson>
```

**Promote to global:**
```xml
<promote_to_global>
<lesson_ids>["lesson-1737000000001-hybrid001"]</lesson_ids>
</promote_to_global>
```

---

## Current Lessons Summary

### High Priority (Always Applied)

1. **Never put system instructions in user message role**
   - System vs user roles must be separate
   - Critical for LLM behavior

2. **Explicitly enable agent mode when tools are required**
   - Set forceAgentMode: true
   - Ensures tool availability

3. **Validate tool results as valid output even without text**
   - Tool-only responses are valid
   - Check conversationMessages length

4. **Retry failed steps with enhanced instructions from planner**
   - Three-tier retry: coder → enhanced → planner takeover
   - Maximizes success rate

5. **Strip markdown and find JSON objects in LLM responses**
   - Use extractJSON() for robustness
   - Show partial response in errors

### Medium Priority (Context-Dependent)

6. **Always validate plans have at least one step**
   - Prevent empty plan execution
   - Early error detection

7. **Pass previous step findings to subsequent steps**
   - Maintain stepFindings array
   - Build coherent multi-step workflows

8. **Execute hybrid steps in isolated temporary threads**
   - Clean result extraction
   - Prevent thread pollution

9. **Use longer timeouts for research and analysis tasks**
   - 180 seconds for complex steps
   - Prevent premature failures

10. **Keep system prompts concise and action-oriented**
    - <15 lines for clarity
    - Remove verbose explanations

---

## When to Add New Lessons

Add lessons to this brain when:

1. **You fix a bug**
   - What was wrong?
   - How to prevent it?
   - Code locations affected

2. **You discover a pattern**
   - What works well?
   - What to avoid?
   - Best practices learned

3. **User corrects you**
   - What was the correction?
   - Why was original approach wrong?
   - How to do it right

4. **You make architectural decisions**
   - Why this approach?
   - What alternatives considered?
   - When to use/not use

### Lesson Quality Guidelines

**Good Lessons:**
- ✅ Specific and actionable
- ✅ Include code locations or examples
- ✅ Explain "why" not just "what"
- ✅ Clear priority based on impact
- ✅ Appropriate category

**Bad Lessons:**
- ❌ Vague generalizations
- ❌ "Remember to write good code"
- ❌ No context or examples
- ❌ Duplicate existing lessons
- ❌ Too long (>300 chars)

---

## Maintenance

### Weekly Tasks
- Review lessons for accuracy
- Check for duplicates
- Update outdated information
- Promote valuable lessons to global

### Cleanup
```xml
<cleanup_brain>
<scope>project</scope>
</cleanup_brain>
```

This detects:
- Similar/duplicate lessons
- Contradicting guidance
- Consolidation opportunities

### Version Control

**Commit brain.json when:**
- Adding critical lessons
- After major bug fixes
- When documenting architectural decisions

**Don't commit:**
- Temporary experiments
- Personal preferences
- Frequently changing notes

---

## Integration with Development

### Before Making Changes
1. Review relevant lessons in brain.json
2. Check HYBRID_AGENT_TECHNICAL_REFERENCE.md for architecture
3. Understand current patterns and constraints

### After Making Changes
1. Document lessons learned
2. Update brain.json if pattern changes
3. Update technical reference if architecture changes
4. Mark global candidates for promotion

### Code Review Checklist
- [ ] Does this follow lessons in brain.json?
- [ ] Are new patterns documented?
- [ ] Should this be added as a lesson?
- [ ] Are conflicting lessons updated?

---

## Exporting Lessons

To export lessons for documentation:
```xml
<search_lessons>
<query></query>
<scope>project</scope>
</search_lessons>
```

Returns all lessons in searchable format.

---

## References

- **Void Brain Service:** `src/vs/workbench/contrib/void/common/voidBrainService.ts`
- **Brain Types:** `src/vs/workbench/contrib/void/common/voidBrainTypes.ts`
- **Tool Definitions:** `src/vs/workbench/contrib/void/common/prompt/prompts.ts` (lines 343-398)
- **Storage Location:** `.void/brain.json` (project) or global storage (application)

---

## Questions?

If you're working on void and have questions about:
- How to add lessons → See ADD_LESSONS_SCRIPT.md
- Hybrid agent architecture → See HYBRID_AGENT_TECHNICAL_REFERENCE.md
- Brain system itself → See voidBrainService.ts

**Remember:** The brain system helps future you (and other developers) avoid repeating mistakes and remember best practices!

---

**Last Updated:** 2025-01-15
**Brain Version:** 1.0
**Total Lessons:** 10

