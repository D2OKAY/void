# Welcome to Void.

<div align="center">
	<img
		src="./src/vs/workbench/browser/parts/editor/media/slice_of_void.png"
	 	alt="Void Welcome"
		width="300"
	 	height="300"
	/>
</div>

Void is the open-source Cursor alternative.

Use AI agents on your codebase, checkpoint and visualize changes, and bring any model or host locally. Void sends messages directly to providers without retaining your data.

This repo contains the full sourcecode for Void. If you're new, welcome!

- 🧭 [Website](https://voideditor.com)

- 👋 [Discord](https://discord.gg/RSNjgaugJs)

- 🚙 [Project Board](https://github.com/orgs/voideditor/projects/2)


## What's New

**December 2024 - Enhanced AI Prompt System**

Void's AI prompts have been comprehensively refined to make the AI more logical, context-aware, and effective:

- **Purpose-driven design**: Each mode (Chat/Plan/Agent) now explains WHY it exists
- **Reasoning frameworks**: Explicit thinking patterns prevent errors before they happen
- **Confidence calibration**: Clear HIGH/MEDIUM/LOW risk assessments
- **User calibration**: Detects beginner vs expert and adjusts responses accordingly
- **Error prevention**: Enhanced checklist and graceful degradation when stuck

See [docs/prompts/](./docs/prompts/) for complete documentation.


## Contributing

1. To get started working on Void, check out our Project Board! You can also see [HOW_TO_CONTRIBUTE](https://github.com/voideditor/void/blob/main/HOW_TO_CONTRIBUTE.md).

2. Feel free to attend a casual weekly meeting in our Discord channel!


## Documentation

- **[Codebase Guide](./VOID_CODEBASE_GUIDE.md)** - Guide to the Void codebase structure
- **[Prompt System](./docs/prompts/)** - Documentation for the AI prompt system
- **[Color Theming](./docs/color-theming/)** - Historical docs on Void's color system
- **[How to Contribute](./HOW_TO_CONTRIBUTE.md)** - Contribution guidelines


## Reference

Void is a fork of the [vscode](https://github.com/microsoft/vscode) repository.

For implementation details:
- AI Prompts: `src/vs/workbench/contrib/void/common/prompt/prompts.ts`
- Core Void Features: `src/vs/workbench/contrib/void/`


## Note

Work is temporarily paused on the Void IDE (this repo) while we experiment with a few novel AI coding ideas for Void. Stay alerted with new releases in our Discord channel.


## Support

You can always reach us in our Discord server or contact us via email: hello@voideditor.com.
