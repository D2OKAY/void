/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import { Color, RGBA } from '../../../../../base/common/color.js';
import { registerColor } from '../../../../../platform/theme/common/colorUtils.js';

/*
 * Color System Alignment
 * ----------------------
 * These colors correspond to CSS variables defined in styles.css:
 * - Primary accent: #FF3D6A (HSL 346 100% 62%) = --primary
 * - Primary darker: #C82850 = destructive variant
 * - Border color: #1C1D21 (HSL 220 8% 12%) = --border
 * - Text color: #E8E9EC (HSL 220 10% 92%) = --foreground
 *
 * When updating colors, ensure consistency with both files.
 */

// Semantic color constants (keep in sync with styles.css)
const PRIMARY_HEX = '#FF3D6A'; // --primary: 346 100% 62%
const PRIMARY_DARKER_HEX = '#C82850'; // Darker variant for reject actions
const MUTED_GRAY = { r: 120, g: 125, b: 130 }; // Neutral gray for highlights

// editCodeService colors - Warm charcoal tones for dark background
const sweepBG = new Color(new RGBA(MUTED_GRAY.r, MUTED_GRAY.g, MUTED_GRAY.b, .25));
const highlightBG = new Color(new RGBA(MUTED_GRAY.r, MUTED_GRAY.g, MUTED_GRAY.b, .15));
const sweepIdxBG = new Color(new RGBA(MUTED_GRAY.r, MUTED_GRAY.g, MUTED_GRAY.b, .6));

// Accept/reject editor decoration backgrounds (with transparency)
const acceptBG = new Color(new RGBA(255, 61, 106, .15)); // Primary color with transparency
const rejectBG = new Color(new RGBA(200, 40, 80, .15)); // Darker red with transparency

// Widget colors - Uses primary accent for accept, darker variant for reject
// These match --primary (#FF3D6A) from the CSS design system
export const acceptAllBg = PRIMARY_HEX;
export const acceptBg = PRIMARY_HEX;
export const acceptBorder = `1px solid ${PRIMARY_HEX}`;

export const rejectAllBg = PRIMARY_DARKER_HEX;
export const rejectBg = PRIMARY_DARKER_HEX;
export const rejectBorder = `1px solid ${PRIMARY_DARKER_HEX}`;

export const buttonFontSize = '11px';
export const buttonTextColor = '#E8E9EC'; // --foreground



const configOfBG = (color: Color) => {
	return { dark: color, light: color, hcDark: color, hcLight: color, }
}

// gets converted to --vscode-void-greenBG, see void.css, asCssVariable
registerColor('void.greenBG', configOfBG(acceptBG), '', true);
registerColor('void.redBG', configOfBG(rejectBG), '', true);
registerColor('void.sweepBG', configOfBG(sweepBG), '', true);
registerColor('void.highlightBG', configOfBG(highlightBG), '', true);
registerColor('void.sweepIdxBG', configOfBG(sweepIdxBG), '', true);
