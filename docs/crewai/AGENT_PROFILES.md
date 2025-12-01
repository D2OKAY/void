# CrewAI Agent Profiles

## Overview

Void's CrewAI mode uses 5 specialized agents, each with distinct roles, capabilities, and tool access. These agents work together in a coordinated workflow to handle complex coding tasks.

All agents are defined in `src/vs/workbench/contrib/void/common/crewAIAgentProfiles.ts`.

---

## 🔍 Researcher
**Agent Type:** `researcher`
**Role:** Code Archaeologist
**Goal:** Understand project structure, locate relevant code, and gather contextual information

### Profile
- **Backstory:** "Experienced at navigating large codebases and finding exactly what's needed. Knows how to use directory listings, file searches, and grep to understand project structure."
- **Default Model:** User's selected "Chat" model
- **Approval Type:** `'never'` (autonomous execution)

### Tools
```typescript
tools: [
  'get_dir_tree',      // Get complete directory tree
  'search_for_files',  // Find files by name/pattern
  'grep_search',       // Search file contents
  'read_file',         // Read specific files
  'ls_dir'             // List directory contents
]
```

### Best Used For
- ✅ Analyzing codebase architecture
- ✅ Finding specific implementations
- ✅ Understanding project structure
- ✅ Locating related files
- ✅ Gathering context before development

### Example Tasks
- "What is this project about?"
- "Find all authentication-related files"
- "Where is the user service implemented?"
- "Analyze the API structure"

---

## 💻 Developer
**Agent Type:** `developer`
**Role:** Software Engineer
**Goal:** Implement features, fix bugs, and write high-quality code

### Profile
- **Backstory:** "Expert coder who carefully reads existing code, follows project conventions, and makes precise edits. Always ensures changes are well-integrated with existing patterns."
- **Default Model:** User's selected "Chat" model
- **Approval Type:** `'ifWriting'` (requires approval for file modifications)

### Tools
```typescript
tools: [
  'read_file',    // Read files to understand context
  'write_file',   // Create new files
  'edit_file',    // Modify existing files
  'ls_dir',       // List directory contents
  'grep_search'   // Search for patterns
]
```

### Best Used For
- ✅ Writing new features
- ✅ Modifying existing code
- ✅ Refactoring code
- ✅ Implementing bug fixes
- ✅ Creating new components

### Example Tasks
- "Add error handling to the auth service"
- "Implement user registration endpoint"
- "Refactor the database connection logic"
- "Create a new utility function for date formatting"

---

## ✅ Reviewer
**Agent Type:** `reviewer`
**Role:** Quality Assurance Specialist
**Goal:** Ensure code quality, identify issues, and suggest improvements

### Profile
- **Backstory:** "Meticulous code reviewer with an eye for bugs, security issues, and best practices. Provides constructive feedback to improve code quality."
- **Default Model:** User's selected "Chat" model
- **Approval Type:** `'never'` (autonomous execution)

### Tools
```typescript
tools: [
  'read_file',    // Read files to review
  'grep_search',  // Find patterns and issues
  'ls_dir'        // Understand file organization
]
```

### Best Used For
- ✅ Code reviews
- ✅ Finding potential bugs
- ✅ Identifying security issues
- ✅ Suggesting improvements
- ✅ Checking code quality

### Example Tasks
- "Review the authentication implementation"
- "Check for security issues in the API"
- "Suggest improvements for this function"
- "Identify potential bugs in the user service"

---

## 🧪 Tester
**Agent Type:** `tester`
**Role:** Testing Engineer
**Goal:** Validate functionality, suggest test cases, and ensure quality

### Profile
- **Backstory:** "Rigorous tester who thinks about edge cases, writes comprehensive tests, and ensures code reliability. Knows how to spot gaps in test coverage."
- **Default Model:** User's selected "Chat" model
- **Approval Type:** `'ifWriting'` (requires approval for creating test files)

### Tools
```typescript
tools: [
  'read_file',         // Read code and tests
  'write_file',        // Create test files
  'grep_search',       // Search for test patterns
  'search_for_files'   // Find test files
]
```

### Best Used For
- ✅ Creating test cases
- ✅ Analyzing test coverage
- ✅ Suggesting test scenarios
- ✅ Writing unit tests
- ✅ Identifying edge cases

### Example Tasks
- "Create tests for the user controller"
- "Suggest test cases for the payment service"
- "Check test coverage for authentication"
- "Write integration tests for the API"

---

## 📝 Documenter
**Agent Type:** `documenter`
**Role:** Technical Writer
**Goal:** Create clear, comprehensive documentation

### Profile
- **Backstory:** "Technical writer who creates clear, comprehensive documentation. Skilled at explaining complex systems in simple terms and organizing information effectively."
- **Default Model:** User's selected "Chat" model
- **Approval Type:** `'ifWriting'` (requires approval for creating docs)

### Tools
```typescript
tools: [
  'read_file',      // Read code and existing docs
  'write_file',     // Create documentation
  'grep_search',    // Search for patterns
  'get_dir_tree'    // Understand structure
]
```

### Best Used For
- ✅ Writing documentation
- ✅ Creating guides
- ✅ Explaining complex systems
- ✅ Generating API docs
- ✅ Creating README files

### Example Tasks
- "Document the authentication flow"
- "Create API documentation"
- "Write a setup guide for this project"
- "Explain how the user service works"

---

## Agent Collaboration Patterns

### Pattern 1: Analysis → Development
```
1. Researcher: "Find authentication code"
2. Developer: "Add error handling to auth"
```

### Pattern 2: Full Workflow
```
1. Researcher: "Locate user service"
2. Developer: "Implement new feature"
3. Reviewer: "Check code quality"
4. Tester: "Suggest test cases"
5. Documenter: "Create documentation"
```

### Pattern 3: Investigation
```
1. Researcher: "Analyze codebase structure"
2. Reviewer: "Identify potential issues"
3. Tester: "Suggest validation tests"
```

---

## Configuration

### Model Selection
All agents currently use the **user's selected "Chat" model** from Void settings. This ensures:
- ✅ Consistent behavior across agents
- ✅ User control over model choice
- ✅ No hardcoded expensive models
- ✅ Easy model switching

Future enhancement: Per-agent model selection for specialized tasks.

### Approval Types
Each agent has an approval type that determines when human approval is required:

| Agent | Approval Type | Requires Approval? |
|-------|---------------|-------------------|
| Researcher | `never` | ❌ No (read-only operations) |
| Developer | `ifWriting` | ✅ Yes (writes files) |
| Reviewer | `never` | ❌ No (read-only operations) |
| Tester | `ifWriting` | ✅ Yes (writes test files) |
| Documenter | `ifWriting` | ✅ Yes (writes docs) |

**Note:** Human-in-the-loop approval is designed but not yet implemented in Phase 1.

---

## Tool Access Summary

| Tool | Researcher | Developer | Reviewer | Tester | Documenter |
|------|:----------:|:---------:|:--------:|:------:|:----------:|
| `get_dir_tree` | ✅ | ❌ | ❌ | ❌ | ✅ |
| `search_for_files` | ✅ | ❌ | ❌ | ✅ | ❌ |
| `grep_search` | ✅ | ✅ | ✅ | ✅ | ✅ |
| `read_file` | ✅ | ✅ | ✅ | ✅ | ✅ |
| `ls_dir` | ✅ | ✅ | ✅ | ❌ | ❌ |
| `write_file` | ❌ | ✅ | ❌ | ✅ | ✅ |
| `edit_file` | ❌ | ✅ | ❌ | ❌ | ❌ |

---

## Agent Strengths

### 🔍 Researcher Strengths
- Comprehensive codebase analysis
- Efficient file location
- Pattern recognition
- Structural understanding

### 💻 Developer Strengths
- Clean code implementation
- Pattern following
- Careful integration
- Precise edits

### ✅ Reviewer Strengths
- Bug detection
- Quality assessment
- Best practice enforcement
- Constructive feedback

### 🧪 Tester Strengths
- Edge case identification
- Test coverage analysis
- Comprehensive test creation
- Quality validation

### 📝 Documenter Strengths
- Clear explanations
- Organized information
- Beginner-friendly content
- Technical accuracy

---

## Extending Agents (Future)

Phase 2 may include:
- 🔮 Custom agent creation via UI
- 🔮 Per-agent model selection
- 🔮 Dynamic tool assignment
- 🔮 Agent performance metrics
- 🔮 Learning from user feedback

---

## References

- **Service Implementation**: `src/vs/workbench/contrib/void/browser/crewAICodingService.ts`
- **Agent Profiles**: `src/vs/workbench/contrib/void/common/crewAIAgentProfiles.ts`
- **Type Definitions**: `src/vs/workbench/contrib/void/common/crewAIAgentTypes.ts`
- **Implementation Status**: [IMPLEMENTATION_COMPLETE.md](IMPLEMENTATION_COMPLETE.md)


