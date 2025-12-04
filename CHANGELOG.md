# Changelog

All notable changes to Void will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [Unreleased]

### Enhanced - 2024-12-04

#### AI Prompt System Refinement

Comprehensive overhaul of the AI prompt system to improve reasoning, accuracy, and user experience across all three modes.

**Added:**
- Purpose-driven mode explanations (WHY Chat/Plan/Agent mode exists)
- Thinking Discipline framework for all modes
- Confidence Calibration system (HIGH/MEDIUM/LOW with risk percentages)
- Response Calibration (matches output to question type and user skill level)
- User Context Signals (detects beginner vs expert)
- 80/20 Rule for Chat mode (minimal investigation for maximum value)
- "Show Your Reasoning" pattern for Agent mode
- Graceful degradation when stuck (prevents spinning in circles)
- Unexpected results handling (PAUSE → STATE → REASON → DECIDE)
- Edit Precision Checklist with common failure patterns
- Scope Discipline guidance for Plan mode
- "My Understanding" and "Key Decisions" sections in plan structure
- "Risks & Mitigations" section in plans

**Improved:**
- All critical behaviors now include "WHY" explanations
- Agent mode "one action" rule clarified (logical action vs tool call)
- Plan mode structure with concrete specificity tests
- Chat mode follow-up handling and confidence signaling
- Error messages and recovery patterns
- Header descriptions for all modes (more actionable, less poetic)

**Documentation:**
- Created comprehensive prompt system documentation in `docs/prompts/`
- Organized color theming documentation in `docs/color-theming/`
- Updated main README with "What's New" section
- Added detailed analysis documents for each mode
- Created implementation reference guide

**Files Changed:**
- `src/vs/workbench/contrib/void/common/prompt/prompts.ts` - All prompt improvements implemented

**Impact:**
- AI now understands the purpose behind rules, leading to better compliance
- Explicit reasoning frameworks catch errors before they happen
- User-calibrated responses improve experience for all skill levels
- Graceful degradation prevents frustrating loops
- Enhanced edit precision reduces failed operations

For complete details, see [docs/prompts/PROMPT_DRAFT_REFINED.md](./docs/prompts/PROMPT_DRAFT_REFINED.md).

---

## Previous Changes

Historical changes were not systematically tracked. This changelog begins with the December 2024 prompt system refinement.

For historical context:
- See `docs/color-theming/` for color system improvements
- Check git history for code changes
- Review closed issues and PRs on GitHub

---

## Contributing

When making significant changes to Void:

1. Document the change in this CHANGELOG under `[Unreleased]`
2. Use categories: Added, Changed, Deprecated, Removed, Fixed, Security
3. Explain WHAT changed and WHY it matters
4. Link to relevant documentation or PRs
5. Update README if the change affects user-facing features

---

*Changelog maintained since December 2024*

