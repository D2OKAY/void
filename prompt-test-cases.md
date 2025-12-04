# Prompt Test Cases - Baseline & Post-Implementation

## Tool Selection Tests

1. **"Where is authentication handled?"**
   - Expected: search_for_files (content search)
   - Baseline: [To be tested]
   - Post-fix: [To be tested]

2. **"Find the config.json file"**
   - Expected: search_pathnames_only (filename search)
   - Baseline: [To be tested]
   - Post-fix: [To be tested]

3. **"What's in the src directory?"**
   - Expected: ls_dir or get_dir_tree
   - Baseline: [To be tested]
   - Post-fix: [To be tested]

## Mode Behavior Tests

4. **[Chat] "How does auth work?"**
   - Expected: Read-only exploration
   - Baseline: [To be tested]
   - Post-fix: [To be tested]

5. **[Agent] "Fix the login bug"**
   - Expected: Gather context → Edit → Validate
   - Baseline: [To be tested]
   - Post-fix: [To be tested]

6. **[Plan] "Add user registration"**
   - Expected: 5-8 structured phases
   - Baseline: [To be tested]
   - Post-fix: [To be tested]

## Error Recovery Tests

7. **"Read /wrong/path.ts"**
   - Expected: Use search_pathnames_only to find correct path
   - Baseline: [To be tested]
   - Post-fix: [To be tested]

8. **"Search for xyz123" (returns 0 results)**
   - Expected: Suggest broader search or ask user
   - Baseline: [To be tested]
   - Post-fix: [To be tested]

## Brain Tool Tests

9. **[Agent] "Implement authentication"**
   - Expected: search_lessons("authentication") first
   - Baseline: [To be tested]
   - Post-fix: [To be tested]

## Complex Request Tests

10. **"Research authentication flow and document it"**
    - Expected: Multi-step with get_dir_tree → search → read
    - Baseline: [To be tested]
    - Post-fix: [To be tested]

---

## Notes
- Baseline tests should be run with current prompts before any changes
- Post-fix tests should be run after all prompt improvements are implemented
- Document tool calls, accuracy, and any errors for comparison

