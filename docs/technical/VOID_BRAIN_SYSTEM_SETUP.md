# Void Brain System - Documentation Complete ✅

## What Was Created

I've documented the hybrid agent system and stored critical lessons in void's project-specific brain located in the `.void` folder.

---

## Files Created

### 📁 `.void/` Folder Structure

```
.void/
├── README.md                              # Guide to brain system and contents
├── brain.json                             # 10 critical lessons (auto-loaded by void)
├── HYBRID_AGENT_TECHNICAL_REFERENCE.md   # Complete technical documentation
└── ADD_LESSONS_SCRIPT.md                 # Reference for lesson parameters
```

### 📄 File Details

#### 1. **brain.json** (Most Important)
- **Purpose:** Project-specific lessons that void automatically loads
- **Contains:** 10 high-priority lessons about hybrid agent system
- **Auto-Loading:** Void reads this file when working in this workspace
- **Categories:** 8 different lesson categories covering all aspects

**Lessons Stored:**
1. Never put system instructions in user message role (HIGH)
2. Explicitly enable agent mode when tools are required (HIGH)
3. Validate tool results as valid output even without text (HIGH)
4. Always validate plans have at least one step (MEDIUM)
5. Retry failed steps with enhanced instructions (HIGH)
6. Pass previous step findings to subsequent steps (MEDIUM)
7. Execute hybrid steps in isolated temporary threads (MEDIUM)
8. Use longer timeouts for research tasks (MEDIUM)
9. Strip markdown from LLM JSON responses (HIGH)
10. Keep system prompts concise and action-oriented (MEDIUM)

#### 2. **HYBRID_AGENT_TECHNICAL_REFERENCE.md**
- **Purpose:** Complete technical reference manual
- **Length:** ~800 lines of detailed documentation
- **Sections:**
  - System architecture diagram
  - Critical bug analysis (the root cause)
  - Complete execution flow with code locations
  - Message handling patterns (the fix)
  - Configuration requirements
  - Troubleshooting guide
  - Performance considerations
  - Best practices

#### 3. **README.md**
- **Purpose:** Guide to the brain system and folder contents
- **Explains:**
  - How void's brain system works
  - Project vs global lessons
  - Automatic injection into prompts
  - How to use brain tools (add_lesson, search_lessons, etc.)
  - When to add new lessons
  - Maintenance tasks

#### 4. **ADD_LESSONS_SCRIPT.md**
- **Purpose:** Reference document showing exact parameters used
- **Contains:** All 10 lessons with full details for manual addition if needed
- **Note:** Lessons already in brain.json, this is just reference

---

## How It Works

### Automatic Lesson Loading

When you work on void's codebase in **Agent** or **Gather** mode:

```
1. You open a file in void workspace
   ↓
2. Void's brain service reads .void/brain.json
   ↓
3. Filters lessons by:
   - File language/extension
   - Lesson priority
   - Lesson category
   ↓
4. Injects relevant lessons into system prompt
   ↓
5. AI model sees lessons as part of instructions
   ↓
6. Model follows best practices automatically
```

### Example Injection

When editing `hybridAgentService.ts`:

```
LEARNING FROM EXPERIENCE:
You have access to a "brain" system that stores lessons learned...

PROJECT-SPECIFIC LESSONS:
- [hybrid-agent-architecture] Never put system instructions in user message role.
  System instructions MUST be sent in the system message role, not concatenated
  into user messages. Always use systemMessageOverride parameter...

- [hybrid-agent-architecture] Explicitly enable agent mode when tools are required.
  Always set forceAgentMode: true in executeAgentTask call...
```

---

## Verifying Setup

### Check brain.json exists:
```bash
ls -la .void/brain.json
```

Should show: `brain.json` with ~10KB size

### Check lessons loaded:

1. Open void in this workspace
2. Switch to **Agent** or **Gather** mode
3. Ask: "Search for hybrid agent lessons"
4. Or use the tool:
```xml
<search_lessons>
<query>hybrid agent</query>
<scope>project</scope>
</search_lessons>
```

Should return 10 lessons.

### Check documentation:
```bash
ls -la .void/
```

Should show 4 files:
- README.md
- brain.json
- HYBRID_AGENT_TECHNICAL_REFERENCE.md
- ADD_LESSONS_SCRIPT.md

---

## Using the Brain System

### Reading Lessons

**As a Developer:**
- Open `.void/brain.json` in any text editor
- Each lesson has `title`, `description`, `context`
- High priority lessons are most critical

**In Void:**
- Lessons automatically appear when relevant
- Search with: `<search_lessons><query>topic</query><scope>project</scope></search_lessons>`

### Adding New Lessons

**Method 1: Agent Mode (Recommended)**
```xml
<add_lesson>
<title>Lesson title</title>
<description>Detailed lesson content</description>
<category>category-name</category>
<priority>high</priority>
<is_global_candidate>false</is_global_candidate>
<context>Optional context</context>
</add_lesson>
```

**Method 2: Manual Edit**
1. Open `.void/brain.json`
2. Add to `lessons` array
3. Update `metadata.totalLessons`
4. Update `metadata.lastUpdated`

### Promoting to Global

For lessons that apply to ALL projects (not just void):

```xml
<promote_to_global>
<lesson_ids>["lesson-1737000000001-hybrid001"]</lesson_ids>
</promote_to_global>
```

---

## Benefits

### For Current Development
- ✅ AI assistant knows hybrid agent architecture
- ✅ Automatically follows best practices
- ✅ Avoids repeating fixed bugs
- ✅ Maintains consistency across changes

### For Future Development
- ✅ New developers learn from past mistakes
- ✅ Lessons persist across sessions
- ✅ Documentation always up-to-date
- ✅ Institutional knowledge captured

### For Debugging
- ✅ Quick reference for architecture
- ✅ Code locations documented
- ✅ Known issues and solutions
- ✅ Troubleshooting guide available

---

## Maintenance

### Weekly Tasks
1. Review `.void/brain.json` for accuracy
2. Update outdated lessons
3. Add lessons from recent bug fixes
4. Remove duplicate or obsolete lessons

### After Major Changes
1. Update HYBRID_AGENT_TECHNICAL_REFERENCE.md
2. Add new lessons to brain.json
3. Commit both files to git
4. Promote valuable lessons to global

### Cleanup Command
```xml
<cleanup_brain>
<scope>project</scope>
</cleanup_brain>
```

Detects:
- Duplicate lessons
- Contradicting guidance
- Similar titles suggesting consolidation

---

## Integration with Git

### What to Commit
✅ **Do commit:**
- `.void/brain.json` - Project lessons
- `.void/HYBRID_AGENT_TECHNICAL_REFERENCE.md` - Technical docs
- `.void/README.md` - Guide to system

❌ **Don't commit:**
- Temporary experimental lessons
- Personal preferences
- Frequently changing notes

### Git Status
```bash
git status .void/
```

Should show all 4 files as new/modified.

### Commit Message Example
```bash
git add .void/
git commit -m "docs: Add hybrid agent documentation and project brain

- 10 critical lessons about hybrid agent system
- Complete technical reference with architecture
- Project brain setup for automatic lesson injection
- Fixes system message role bug documentation"
```

---

## Categories Explained

| Category | Purpose | Example Lessons |
|----------|---------|-----------------|
| `hybrid-agent-architecture` | Core system design | System message roles, agent mode forcing |
| `hybrid-agent-response-handling` | Processing model output | Tool-only responses, empty response handling |
| `hybrid-agent-validation` | Input/output checks | Empty plan validation, step validation |
| `hybrid-agent-error-handling` | Failure recovery | Retry logic, planner takeover |
| `hybrid-agent-context-management` | Context accumulation | Step findings, workspace context |
| `hybrid-agent-configuration` | Settings and timeouts | Timeout values, model selection |
| `hybrid-agent-json-parsing` | Robust JSON extraction | extractJSON function, error messages |
| `prompt-engineering` | Effective prompts | Prompt length, action-oriented directives |

---

## Global Candidates

These 6 lessons are marked as **global candidates** (useful across all projects):

1. Never put system instructions in user message role
2. Explicitly enable agent mode when tools are required
3. Validate tool results as valid output even without text
4. Always validate plans have at least one step
5. Use longer timeouts for research and analysis tasks
6. Strip markdown and find JSON objects in LLM responses
7. Keep system prompts concise and action-oriented

To promote:
```xml
<promote_to_global>
<lesson_ids>[]</lesson_ids>
</promote_to_global>
```

Empty array promotes all candidates.

---

## Examples

### Example 1: Finding Relevant Lessons

**Question:** "What should I know before modifying hybrid agent code?"

**Answer:**
1. Read `.void/HYBRID_AGENT_TECHNICAL_REFERENCE.md`
2. Review high-priority lessons in brain.json
3. Search for specific topics:
   ```xml
   <search_lessons>
   <query>system message</query>
   <scope>project</scope>
   </search_lessons>
   ```

### Example 2: Adding a New Lesson

**Scenario:** You fix a bug with plan step dependencies

**Action:**
```xml
<add_lesson>
<title>Check step dependencies before execution</title>
<description>Before executing each step in a plan, verify all dependencies in step.dependencies array have completed successfully. If any dependency failed, skip the step and show warning message to user.</description>
<category>hybrid-agent-validation</category>
<priority>medium</priority>
<is_global_candidate>false</is_global_candidate>
<context>Added dependency checking in chatThreadService.ts _executeHybridPlan loop to prevent execution of steps that depend on failed prerequisites.</context>
</add_lesson>
```

### Example 3: Updating Documentation

**Scenario:** You change timeout from 180s to 300s

**Actions:**
1. Update brain.json lesson #8
2. Update HYBRID_AGENT_TECHNICAL_REFERENCE.md line 50
3. Commit both files with descriptive message

---

## Troubleshooting

### Lessons not loading?
1. Check `.void/brain.json` exists and is valid JSON
2. Verify you're in Agent or Gather mode (not Normal mode)
3. Try: `<search_lessons><query></query><scope>project</scope></search_lessons>`

### Can't find brain.json?
```bash
find . -name "brain.json"
```

Should show: `./.void/brain.json`

### Want to see what's injected?
- System prompts include lessons automatically
- Use search_lessons to see what would be loaded
- High priority lessons always included

---

## Summary

✅ **Created:** Complete documentation system in `.void/` folder
✅ **Stored:** 10 critical lessons in project brain
✅ **Documented:** Full technical reference with code locations
✅ **Automated:** Lessons auto-inject into AI prompts
✅ **Maintainable:** Clear guide for future updates

**The brain system is now active and will help avoid repeating the system message bug and other hybrid agent issues!**

---

## Next Steps

1. **Commit the .void folder:**
   ```bash
   git add .void/
   git commit -m "docs: Add hybrid agent brain and technical reference"
   ```

2. **Test lesson loading:**
   - Open void in agent mode
   - Search for hybrid agent lessons
   - Verify all 10 lessons appear

3. **Start using:**
   - Reference TECHNICAL_REFERENCE.md when coding
   - Add lessons when fixing bugs
   - Promote valuable lessons to global

4. **Share with team:**
   - Show .void/README.md to other developers
   - Explain automatic lesson injection
   - Encourage adding lessons for future benefit

---

**Documentation complete! The void project now has a comprehensive brain system for hybrid agent knowledge. 🧠✨**




