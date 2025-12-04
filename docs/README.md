# Void Documentation

This folder contains detailed documentation for various aspects of the Void editor.

## 📁 Documentation Structure

### [prompts/](./prompts/)
**AI Prompt System Documentation**

Comprehensive documentation of Void's AI prompt system improvements (December 2024). Includes:
- Analysis of Chat, Plan, and Agent modes
- Implementation reference with all refined prompts
- Key patterns and testing guidelines
- Reasoning frameworks and error prevention strategies

**Start here:** [`prompts/README.md`](./prompts/README.md)

**Main reference:** [`prompts/PROMPT_DRAFT_REFINED.md`](./prompts/PROMPT_DRAFT_REFINED.md)

---

### [color-theming/](./color-theming/)
**Color Theming System (Historical)**

Documentation about Void's color theming system and lessons learned from debugging theming issues. Includes:
- Guide to VSCode's layered color architecture
- Critical dark mode requirements
- HSL color variable system
- Common pitfalls and solutions

**Start here:** [`color-theming/README.md`](./color-theming/README.md)

---

## 🔍 Quick Links

### For Contributors
- [How to Contribute](../HOW_TO_CONTRIBUTE.md) - Contribution guidelines
- [Codebase Guide](../VOID_CODEBASE_GUIDE.md) - Understanding the Void codebase
- [Changelog](../CHANGELOG.md) - Recent changes and improvements

### For Understanding the AI System
- [Prompt System Overview](./prompts/README.md) - High-level overview
- [Chat Mode Analysis](./prompts/PROMPT_ANALYSIS_CHAT_MODE.md) - Read-only consultation mode
- [Plan Mode Analysis](./prompts/PROMPT_ANALYSIS_PLAN_MODE.md) - Architecture and design mode
- [Agent Mode Analysis](./prompts/PROMPT_ANALYSIS_AGENT_MODE.md) - Autonomous execution mode

### For Implementation
- [Complete Refined Prompts](./prompts/PROMPT_DRAFT_REFINED.md) - Ready-to-implement prompt text
- [Prompt Source Code](../src/vs/workbench/contrib/void/common/prompt/prompts.ts) - Actual implementation

### For Theming
- [Color System Lessons](./color-theming/LESSONS_LEARNED_COLOR_THEMING.md) - Comprehensive color guide
- [Dark Mode Critical Lesson](./color-theming/CRITICAL_DARK_MODE_LESSON.md) - Essential dark mode fix

---

## 📚 Documentation Standards

When adding new documentation:

1. **Create a folder** for major features or systems
2. **Include a README.md** in each folder explaining the contents
3. **Use clear headings** and structure for easy navigation
4. **Link between documents** to help readers find related info
5. **Update this index** to include your new documentation

### Markdown Style
- Use ATX-style headers (`#` not underlines)
- Include a table of contents for docs >200 lines
- Use code blocks with language identifiers
- Add "Last updated" date at the bottom of major docs

### File Naming
- Use lowercase with hyphens: `feature-name.md`
- README files should be uppercase: `README.md`
- Prefix analysis docs: `ANALYSIS_feature.md`
- Prefix lessons: `LESSONS_feature.md`

---

## 🆘 Getting Help

- **Discord**: Join our [Discord server](https://discord.gg/RSNjgaugJs) for real-time help
- **Issues**: Report bugs or request features on [GitHub Issues](https://github.com/voideditor/void/issues)
- **Email**: Contact us at hello@voideditor.com

---

*Documentation structure established December 2024*

