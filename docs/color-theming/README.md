# Void Color Theming Documentation

This folder contains historical documentation about Void's color theming system and lessons learned from debugging theming issues.

## Files

- **`LESSONS_LEARNED_COLOR_THEMING.md`** - Comprehensive guide to Void's color system and VSCode's layered color architecture
- **`CRITICAL_DARK_MODE_LESSON.md`** - Critical lesson about the `.dark` class requirement for Tailwind dark mode
- **`FINAL_COLOR_FIX.md`** - Documentation of the final dark mode fix
- **`WHITE_BACKGROUND_FINAL_FIX.md`** - Specific fix for white background issues
- **`COLOR_FIX_SUMMARY.md`** - Summary of color-related fixes

## Key Takeaways

### Critical Files for Color Changes

When changing colors in Void, you MUST update colors in multiple locations due to VSCode's layered color system:

1. **Highest Priority Files:**
   - `src/vs/platform/theme/common/colors/baseColors.ts`
   - `src/vs/workbench/common/theme.ts`
   - `src/vs/platform/theme/common/colors/editorColors.ts`
   - `src/vs/workbench/services/themes/common/workbenchThemeService.ts`
   - `src/vs/platform/theme/electron-main/themeMainService.ts`

2. **Void-Specific Files:**
   - Theme JSON files
   - `styles.css` (shadcn/ui style HSL variables)
   - `colors.ts`
   - `void.css`

### Dark Mode Requirement

**CRITICAL:** The `.dark` class must be applied to the parent container for Tailwind dark mode to work!

In Void, this is in `Sidebar.tsx`:
```tsx
className={`@@void-scope ${isDark ? 'dark' : ''}`}
```

Without the `.dark` class, all Tailwind classes resolve to LIGHT theme values from `:root` instead of `.dark {}` block.

### Color Variable System

Void uses shadcn/ui style HSL color variables:
- Format: `H S% L%` (without `hsl()` wrapper)
- Defined in `@layer base` in `styles.css`
- `:root` block for light theme
- `.dark` block for dark theme
- Semantic names: `--background`, `--foreground`, `--primary`, etc.

## Reference

For detailed implementation information, see `LESSONS_LEARNED_COLOR_THEMING.md`.

---

*Historical documentation preserved for reference*

