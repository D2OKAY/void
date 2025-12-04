# Lessons Learned: Complete Color Theming in Void/VSCode

## 🎯 Problem
Changing VSCode/Void theme colors is NOT as simple as modifying theme JSON files. There are **multiple layers** of hardcoded color defaults that override theme files.

## 📊 Color Definition Hierarchy (Highest to Lowest Priority)

1. **Platform Base Colors** (HIGHEST PRIORITY)
2. **Workbench Common Theme Colors**
3. **Initial/Splash Screen Colors**
4. **Theme JSON Files**
5. **Component-Level Inline Styles** (LOWEST PRIORITY)

## 🗺️ Complete Map of Color Locations

### ⭐ CRITICAL: Platform Base Color Defaults

**Location:** `src/vs/platform/theme/common/colors/baseColors.ts`

These are the HIGHEST priority color definitions and will override everything else!

**Key Colors to Update:**
```typescript
focusBorder              // Controls active tab borders, focus outlines
contrastBorder           // High contrast mode borders
activeContrastBorder     // Active element borders in HC mode
selectionBackground      // Text selection background
```

**Example:**
```typescript
export const focusBorder = registerColor('focusBorder',
    { dark: '#00FFC8', light: '#0090F1', ... },
    nls.localize('focusBorder', "Overall border color..."));
```

---

### ⭐ CRITICAL: Workbench Theme Colors

**Location:** `src/vs/workbench/common/theme.ts`

These define default colors for major workbench areas. Must be updated!

**Key Functions/Constants:**
```typescript
// Line ~14
WORKBENCH_BACKGROUND(theme)          // Overall workbench background

// Line ~35
TAB_INACTIVE_BACKGROUND              // Inactive tab backgrounds

// Line ~293
STATUS_BAR_BACKGROUND                // Status bar at bottom
STATUS_BAR_NO_FOLDER_BACKGROUND      // Status bar when no folder open

// Line ~390
ACTIVITY_BAR_BACKGROUND              // Left/right activity bar
ACTIVITY_BAR_FOREGROUND              // Activity bar icons
ACTIVITY_BAR_INACTIVE_FOREGROUND     // Inactive activity bar icons

// Line ~482
PANEL_BORDER                         // Border around panels
PANEL_BACKGROUND                     // Panel background (terminal, etc)

// Line ~604
SIDE_BAR_BACKGROUND                  // Sidebar background (CRITICAL for chat header!)
SIDE_BAR_FOREGROUND                  // Sidebar text color
SIDE_BAR_BORDER                      // Sidebar border
SIDE_BAR_SECTION_HEADER_BACKGROUND   // Section headers in sidebar
```

**Why This Matters:**
- `SIDE_BAR_BACKGROUND` is what makes the chat header background color!
- `PANEL_BORDER` controls the border under the Chat/Plans tabs!
- These override theme JSON files!

---

### ⭐ CRITICAL: Editor Base Colors

**Location:** `src/vs/platform/theme/common/colors/editorColors.ts`

**Key Colors:**
```typescript
// Line ~20
editorBackground           // Main editor background
editorForeground          // Main editor text color

// Line ~33
editorStickyScrollHoverBackground  // Hover state for sticky scroll

// Line ~45
editorWidgetBackground    // Background for find/replace, widgets
editorWidgetForeground    // Widget text color
```

---

### ⭐ CRITICAL: Initial/Splash Colors

**Location:** `src/vs/workbench/services/themes/common/workbenchThemeService.ts`

**Object to Update:** `COLOR_THEME_DARK_INITIAL_COLORS` (around line 54)

These are the colors shown during startup before the theme fully loads!

**All properties to update:**
```typescript
export const COLOR_THEME_DARK_INITIAL_COLORS = {
    'activityBar.activeBorder': '#00FFC8',
    'activityBar.background': '#101112',
    'activityBar.border': '#1C1D1F',
    'activityBar.foreground': '#E8E9EB',
    'activityBar.inactiveForeground': '#7D8390',
    'editorGroup.border': '#1C1D1F',
    'editorGroupHeader.tabsBackground': '#101112',
    'editorGroupHeader.tabsBorder': '#1C1D1F',
    'statusBar.background': '#101112',
    'statusBar.border': '#1C1D1F',
    'statusBar.foreground': '#E8E9EB',
    'statusBar.noFolderBackground': '#0A0B0C',
    'tab.activeBackground': '#0A0B0C',
    'tab.activeBorder': '#0A0B0C',
    'tab.activeBorderTop': '#00FFC8',
    'tab.activeForeground': '#E8E9EB',
    'tab.border': '#1C1D1F',
    'textLink.foreground': '#00D9A8',
    'titleBar.activeBackground': '#101112',
    'titleBar.activeForeground': '#E8E9EB',
    'titleBar.border': '#1C1D1F',
    'titleBar.inactiveBackground': '#0A0B0C',
    'titleBar.inactiveForeground': '#B8BCC4',
    'welcomePage.tileBackground': '#1A1B1E'
};
```

---

### ⭐ CRITICAL: Default Theme Background

**Location:** `src/vs/platform/theme/electron-main/themeMainService.ts`

**Constants to Update:** (around line 23)
```typescript
const DEFAULT_BG_LIGHT = '#FFFFFF';
const DEFAULT_BG_DARK = '#0A0B0C';      // UPDATE THIS!
const DEFAULT_BG_HC_BLACK = '#000000';
const DEFAULT_BG_HC_LIGHT = '#FFFFFF';
```

This controls the window background color during startup!

---

### 📁 Theme JSON Files (Lower Priority)

**Locations:**
- `extensions/theme-defaults/themes/dark_modern.json`
- `extensions/theme-defaults/themes/dark_vs.json`
- `extensions/theme-defaults/themes/dark_plus.json`

**All Colors to Update in dark_modern.json:**
```json
{
  "colors": {
    "activityBar.activeBorder": "#00FFC8",
    "activityBar.background": "#101112",
    "activityBar.border": "#1C1D1F",
    "activityBar.foreground": "#E8E9EB",
    "activityBar.inactiveForeground": "#7D8390",
    "activityBarBadge.background": "#00D9A8",
    "activityBarBadge.foreground": "#0A0B0C",

    "badge.background": "#1A1B1E",
    "badge.foreground": "#E8E9EB",

    "button.background": "#00D9A8",
    "button.border": "#00FFC820",
    "button.foreground": "#0A0B0C",
    "button.hoverBackground": "#00FFC8",
    "button.secondaryBackground": "#1A1B1E",
    "button.secondaryForeground": "#E8E9EB",
    "button.secondaryHoverBackground": "#212226",

    "checkbox.background": "#1A1B1E",
    "checkbox.border": "#1C1D1F",

    "dropdown.background": "#1A1B1E",
    "dropdown.border": "#1C1D1F",
    "dropdown.foreground": "#E8E9EB",
    "dropdown.listBackground": "#0A0B0C",

    "editor.background": "#0A0B0C",
    "editor.foreground": "#E8E9EB",

    "editorGroup.border": "#1C1D1F",
    "editorGroupHeader.tabsBackground": "#101112",
    "editorGroupHeader.tabsBorder": "#1C1D1F",

    "focusBorder": "#00FFC8",
    "foreground": "#E8E9EB",

    "input.background": "#1A1B1E",
    "input.border": "#1C1D1F",
    "input.foreground": "#E8E9EB",
    "input.placeholderForeground": "#7D8390",

    "menu.background": "#0A0B0C",
    "menu.selectionBackground": "#00D9A8",

    "panel.background": "#101112",
    "panel.border": "#1C1D1F",

    "progressBar.background": "#00FFC8",

    "sideBar.background": "#101112",
    "sideBar.border": "#1C1D1F",
    "sideBar.foreground": "#E8E9EB",
    "sideBarSectionHeader.background": "#101112",
    "sideBarSectionHeader.border": "#1C1D1F",

    "statusBar.background": "#101112",
    "statusBar.border": "#1C1D1F",
    "statusBar.foreground": "#E8E9EB",
    "statusBar.noFolderBackground": "#0A0B0C",

    "tab.activeBackground": "#0A0B0C",
    "tab.activeBorder": "#0A0B0C",
    "tab.activeBorderTop": "#00FFC8",
    "tab.activeForeground": "#E8E9EB",
    "tab.border": "#1C1D1F",
    "tab.inactiveBackground": "#101112",
    "tab.inactiveForeground": "#B8BCC4",

    "titleBar.activeBackground": "#101112",
    "titleBar.activeForeground": "#E8E9EB",
    "titleBar.border": "#1C1D1F",
    "titleBar.inactiveBackground": "#0A0B0C",

    "widget.border": "#1C1D1F"
  }
}
```

---

### 🎨 Void Custom Colors

**Location:** `src/vs/workbench/contrib/void/browser/react/src/styles.css`

**CSS Variables to Update:**
```css
& {
    /* Backgrounds (darkest to lightest) */
    --void-bg-3: #0A0B0C;        /* Darkest - editor background */
    --void-bg-2: #101112;        /* Dark - sidebar background */
    --void-bg-2-alt: #14151A;    /* Dark variant */
    --void-bg-2-hover: #1A1B1E;  /* Hover state */
    --void-bg-1: #1A1B1E;        /* Input backgrounds */
    --void-bg-1-alt: #212226;    /* Input variant */

    /* Text Colors (brightest to dimmest) */
    --void-fg-0: #E8E9EB;        /* Brightest text */
    --void-fg-1: #E8E9EB;        /* Primary text */
    --void-fg-2: #B8BCC4;        /* Secondary text */
    --void-fg-3: #7D8390;        /* Tertiary text */
    --void-fg-4: #4A505C;        /* Placeholder text */

    /* Warning */
    --void-warning: #FFB86C;     /* Warm orange */

    /* Borders (subtle to prominent) */
    --void-border-4: #1C1D1F;    /* Subtle border */
    --void-border-3: #1C1D1F;    /* Standard border */
    --void-border-2: #1C1D1F;    /* Medium border */
    --void-border-1: #00FFC8;    /* Active/focus border (teal) */

    /* Accent Colors */
    --void-ring-color: #00FFC8;  /* Focus ring - hologram teal */
    --void-link-color: #00FFC8;  /* Link color - hologram teal */
}
```

---

### 🎨 Void Registered Theme Colors

**Location:** `src/vs/workbench/contrib/void/common/helpers/colors.ts`

**Colors Registered with VSCode:**
```typescript
// Editor decoration colors
const sweepBG = new Color(new RGBA(120, 125, 130, .25));
const highlightBG = new Color(new RGBA(120, 125, 130, .15));
const sweepIdxBG = new Color(new RGBA(120, 125, 130, .6));

// Accept/reject colors
const acceptBG = new Color(new RGBA(0, 255, 200, .15));  // Teal
const rejectBG = new Color(new RGBA(255, 95, 135, .15)); // Pink-red

// Button colors
export const acceptAllBg = 'rgb(0, 217, 168)';
export const acceptBg = 'rgb(0, 184, 138)';
export const acceptBorder = '1px solid rgb(0, 150, 115)';

export const rejectAllBg = 'rgb(255, 95, 135)';
export const rejectBg = 'rgb(230, 80, 120)';
export const rejectBorder = '1px solid rgb(200, 60, 100)';
```

These get converted to CSS variables like `--vscode-void-greenBG`

---

### 🎨 Void Component-Level Hardcoded Colors

**Files with Direct Color References:**

1. **`src/vs/workbench/contrib/void/browser/media/void.css`**
   ```css
   .void-openfolder-button {
       background-color: #00D9A8;  /* Teal */
       color: #0A0B0C;
   }

   .void-openssh-button {
       background-color: #1C1D1F;  /* Dark charcoal */
       color: #E8E9EB;
   }

   .void-link {
       color: #00FFC8;  /* Teal */
   }
   ```

2. **`src/vs/workbench/contrib/void/browser/react/src/void-settings-tsx/Settings.tsx`**
   - Search for `#00D9A8`, `#0A0B0C`, `#00FFC8` in className strings
   - Update tab selection backgrounds
   - Update button backgrounds

3. **`src/vs/workbench/contrib/void/browser/react/src/void-onboarding/VoidOnboarding.tsx`**
   - Search for `#00D9A8`, `#0A0B0C` in className strings
   - Update tab selection backgrounds

4. **`src/vs/workbench/contrib/void/browser/react/src/sidebar-tsx/Sidebar.tsx`**
   - Uses VSCode CSS variables: `var(--vscode-panel-border)`, `var(--vscode-sideBar-background)`
   - These reference the platform colors we updated!

---

## 🔍 Common Issues and What They Affect

| Issue | Affected UI | File to Fix |
|-------|-------------|-------------|
| Chat header still grey/blue | Chat/Plans tab bar | `theme.ts` → `SIDE_BAR_BACKGROUND` |
| Active tab border not teal | Active Chat/Plans tab | `baseColors.ts` → `focusBorder` |
| Border under tabs wrong color | Tab separator | `theme.ts` → `PANEL_BORDER` |
| Status bar still blue | Bottom status bar | `theme.ts` → `STATUS_BAR_BACKGROUND` |
| Sidebar different from editor | Sidebar panel | `theme.ts` → `SIDE_BAR_BACKGROUND` |
| Startup flash wrong color | Window splash | `themeMainService.ts` → `DEFAULT_BG_DARK` |
| Initial load wrong colors | Startup screen | `workbenchThemeService.ts` → `COLOR_THEME_DARK_INITIAL_COLORS` |
| Activity bar (left) wrong color | Icon bar | `theme.ts` → `ACTIVITY_BAR_BACKGROUND` |

---

## ✅ Complete Checklist for Color Theme Changes

### Step 1: Platform Base Colors
- [ ] Update `src/vs/platform/theme/common/colors/baseColors.ts`
  - [ ] `focusBorder` (active borders, tab indicators)

### Step 2: Workbench Core Colors
- [ ] Update `src/vs/workbench/common/theme.ts`
  - [ ] `WORKBENCH_BACKGROUND()` function
  - [ ] `TAB_INACTIVE_BACKGROUND`
  - [ ] `STATUS_BAR_BACKGROUND`
  - [ ] `STATUS_BAR_NO_FOLDER_BACKGROUND`
  - [ ] `ACTIVITY_BAR_BACKGROUND`
  - [ ] `PANEL_BORDER`
  - [ ] `SIDE_BAR_BACKGROUND` ⭐ CRITICAL for chat header!

### Step 3: Editor Base Colors
- [ ] Update `src/vs/platform/theme/common/colors/editorColors.ts`
  - [ ] `editorBackground`
  - [ ] `editorForeground`
  - [ ] `editorStickyScrollHoverBackground`
  - [ ] `editorWidgetBackground`

### Step 4: Initial/Splash Colors
- [ ] Update `src/vs/workbench/services/themes/common/workbenchThemeService.ts`
  - [ ] Entire `COLOR_THEME_DARK_INITIAL_COLORS` object (25+ properties)

- [ ] Update `src/vs/platform/theme/electron-main/themeMainService.ts`
  - [ ] `DEFAULT_BG_DARK` constant

### Step 5: Theme JSON Files
- [ ] Update `extensions/theme-defaults/themes/dark_modern.json`
  - [ ] All ~50+ color properties

- [ ] Update `extensions/theme-defaults/themes/dark_vs.json`
  - [ ] All color properties

### Step 6: Void Custom Colors
- [ ] Update `src/vs/workbench/contrib/void/browser/react/src/styles.css`
  - [ ] All `--void-bg-*` variables (6 colors)
  - [ ] All `--void-fg-*` variables (5 colors)
  - [ ] All `--void-border-*` variables (4 colors)
  - [ ] `--void-ring-color` and `--void-link-color`

- [ ] Update `src/vs/workbench/contrib/void/common/helpers/colors.ts`
  - [ ] All RGBA color definitions
  - [ ] All exported `rgb()` button colors

- [ ] Update `src/vs/workbench/contrib/void/browser/media/void.css`
  - [ ] `.void-openfolder-button`
  - [ ] `.void-openssh-button`
  - [ ] `.void-link`

### Step 7: Component Hardcoded Colors
- [ ] Search and update in `Settings.tsx`
- [ ] Search and update in `VoidOnboarding.tsx`
- [ ] Verify `Sidebar.tsx` uses correct CSS variables

### Step 8: Rebuild and Test
- [ ] Run `npm run watch` or rebuild
- [ ] Test chat header background
- [ ] Test active tab borders
- [ ] Test all UI panels
- [ ] Test startup splash screen

---

## 🎨 Our Final Color Palette (for reference)

### Hex Values (VSCode Core - MUST use hex):
```typescript
// Pure Dark Charcoal (No Blue Tint)
{
  backgrounds: {
    deepest: '#09090B',      // Editor, deepest black (HSL 225 8% 4%)
    dark: '#0F0F11',         // Sidebar, panels, status bar (HSL 225 8% 6.5%)
    medium: '#191A1E',       // Inputs, hover states (HSL 225 8% 11%)
    light: '#1E1F23',        // Lighter variant (HSL 225 8% 13%)
  },

  text: {
    brightest: '#E8E9EC',   // Primary text, headings (HSL 220 10% 92%)
    medium: '#B8BCC4',      // Secondary text
    dim: '#7D8390',         // Tertiary, labels (HSL 220 7% 51%)
    placeholder: '#4A505C',  // Placeholder text
  },

  borders: {
    subtle: '#1C1D21',      // Standard borders (HSL 220 8% 12%)
    active: '#00FFC7',      // Active, focus (hologram teal HSL 167 100% 50%)
  },

  accent: {
    primary: '#FF3D6A',     // Pink-red accent (HSL 346 100% 62%)
  },

  semantic: {
    success: '#FF3D6A',     // Accept/success (pink-red HSL 346 100% 62%)
    error: '#C82850',       // Reject/error (darker red)
    warning: '#FFB86C',     // Warning (warm orange)
  }
}
```

### HSL Values (Void React - CAN use HSL):
- All Void React styles.css use HSL format: `225 8% 4%` (without `hsl()` wrapper)
- Tailwind config reads these and converts automatically
- This provides better compatibility with shadcn/ui system

---

## 🚨 **CRITICAL: Hardcoded Platform Colors**

VSCode has **hardcoded default colors** in platform files that OVERRIDE theme JSONs!

### **Must Update These Files:**

1. **`src/vs/platform/theme/common/colors/inputColors.ts`**
   - `inputBackground`: Default was `#3C3C3C` (light gray) → Changed to `#191A1E`
   - `selectBackground`: Default was `#3C3C3C` → Changed to `#191A1E`
   - `buttonBackground`: Default was `#0E639C` (blue) → Changed to `#FF3D6A` (pink-red)

2. **`src/vs/workbench/common/theme.ts`**
   - `TAB_BORDER`: Default was `#252526` → Changed to `#1C1D21`
   - `EDITOR_GROUP_HEADER_TABS_BACKGROUND`: Default was `#252526` → Changed to `#0F0F11`
   - `TITLE_BAR_ACTIVE_BACKGROUND`: Default was `#3C3C3C` → Changed to `#0F0F11`

**These hardcoded colors take precedence over theme JSON values!**

---

## 🔴 **Accent Color Change: Teal → Pink-Red**

**Originally:** Hologram teal (`#00FFC7` / HSL `167 100% 50%`)
**Now:** Pink-red accent (`#FF3D6A` / HSL `346 100% 62%`)

This color is used for:
- Focus borders and rings
- Active tab indicators
- Primary buttons
- Links
- Selected items
- Progress indicators

---

## 🚨 Critical Mistakes to Avoid

1. **DON'T only update theme JSON files** - They have the lowest priority!
2. **DON'T forget platform base colors** - They override everything!
3. **DON'T miss `SIDE_BAR_BACKGROUND`** - This controls the chat header!
4. **DON'T miss `focusBorder`** - This controls active tab indicators!
5. **DON'T forget initial colors** - Users will see a flash of wrong colors on startup!
6. **DON'T skip component-level hardcoded colors** - They won't update automatically!
7. **ALWAYS rebuild** - Changes won't apply without rebuilding!

---

## 📝 Notes

- VSCode's theming system has **at least 5 layers** of color definitions
- Platform-level colors (base) have **higher priority** than theme files
- Workbench colors have **higher priority** than theme files
- Initial colors prevent **color flash** on startup
- Void uses **both** VSCode's color system AND custom CSS variables
- Some components use **hardcoded** colors that must be updated manually

---

**Last Updated:** December 2, 2025
**Applies To:** Void (VSCode Fork)
**Tested On:** macOS, Void stable-base branch

