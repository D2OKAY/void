/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/


// register inline diffs
import './editCodeService.js'

// register Sidebar pane, state, actions (keybinds, menus) (Ctrl+L)
import './sidebarActions.js'
import './sidebarPane.js'

// register quick edit (Ctrl+K)
import './quickEditActions.js'


// register Autocomplete
import './autocompleteService.js'

// register Context services
// import './contextGatheringService.js'
// import './contextUserChangesService.js'

// settings pane
import './voidSettingsPane.js'

// register css
import './media/void.css'

// update (frontend part, also see platform/)
import './voidUpdateActions.js'

import './convertToLLMMessageWorkbenchContrib.js'

// brain
import './voidBrainWorkbenchContrib.js'

// hybrid agent
import './hybridPlanService.js'
import './hybridAgentService.js'
import './hybridPlanWorkbenchContrib.js'

// tools
import './toolsService.js'
import './terminalToolService.js'

// register Thread History
import './chatThreadService.js'

// ping
import './metricsPollService.js'

// helper services
import './helperServices/consistentItemService.js'

// register selection helper
import './voidSelectionHelperWidget.js'

// register tooltip service
import './tooltipService.js'

// register onboarding service
import './voidOnboardingService.js'

// register misc service
import './miscWokrbenchContrib.js'

// register file service (for explorer context menu)
import './fileService.js'

// register source control management
import './voidSCMService.js'

// ---------- common (unclear if these actually need to be imported, because they're already imported wherever they're used) ----------

// llmMessage
import '../common/sendLLMMessageService.js'

// voidSettings
import '../common/voidSettingsService.js'

// refreshModel
import '../common/refreshModelService.js'

// metrics
import '../common/metricsService.js'

// updates
import '../common/voidUpdateService.js'

// model service
import '../common/voidModelService.js'

// Register plan mode commands
import { registerAction2, Action2 } from '../../../../platform/actions/common/actions.js'
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js'
import { ICommandService } from '../../../../platform/commands/common/commands.js'
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js'
import { URI } from '../../../../base/common/uri.js'

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'void.openPlansFolder',
			title: 'Open Plans Folder',
			category: 'Void'
		})
	}
	async run(accessor: ServicesAccessor) {
		const workspaceContextService = accessor.get(IWorkspaceContextService)
		const commandService = accessor.get(ICommandService)
		const folders = workspaceContextService.getWorkspace().folders
		if (folders.length === 0) return
		const plansFolder = URI.joinPath(folders[0].uri, '.void', 'plans')
		await commandService.executeCommand('revealFileInOS', plansFolder)
	}
})
