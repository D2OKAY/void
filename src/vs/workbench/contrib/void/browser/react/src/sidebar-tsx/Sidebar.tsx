/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import React, { useState } from 'react'
import { useIsDark } from '../util/services.js';
// import { SidebarThreadSelector } from './SidebarThreadSelector.js';
// import { SidebarChat } from './SidebarChat.js';

import '../styles.css'
import { SidebarChat } from './SidebarChat.js';
import { PlanViewer } from './PlanViewer.js';
import ErrorBoundary from './ErrorBoundary.js';

export const Sidebar = ({ className }: { className: string }) => {
	const [activeView, setActiveView] = useState<'chat' | 'plans'>('chat')
	const isDark = useIsDark()

	return <div
		className={`@@void-scope dark bg-background`}
		style={{ width: '100%', height: '100%', backgroundColor: '#16171A' }}
	>
		<div
			// default background + text styles for sidebar
			className={`
				w-full h-full flex flex-col
				bg-card
				text-foreground
			`}
			style={{ backgroundColor: '#1A1B1F' }}
		>
			{/* Tab Navigation */}
			<div className="flex border-b border-border bg-card" style={{ backgroundColor: '#1A1B1F', borderColor: '#2A2B2F' }}>
				<button
					onClick={() => setActiveView('chat')}
					className={`px-4 py-2 text-sm font-medium transition-all duration-150 focus:outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-inset ${
						activeView === 'chat'
							? 'border-b-2 border-ring text-foreground'
							: 'text-muted-foreground hover:text-foreground'
					}`}
					style={{ color: activeView === 'chat' ? '#E8E9EC' : '#7D8390' }}>
					Chat
				</button>
				<button
					onClick={() => setActiveView('plans')}
					className={`px-4 py-2 text-sm font-medium transition-all duration-150 focus:outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-inset ${
						activeView === 'plans'
							? 'border-b-2 border-ring text-foreground'
							: 'text-muted-foreground hover:text-foreground'
					}`}
					style={{ color: activeView === 'plans' ? '#E8E9EC' : '#7D8390' }}>
					Plans
				</button>
			</div>

			{/* Content */}
			<div className="flex-1 overflow-hidden">
				<ErrorBoundary>
					{activeView === 'chat' ? <SidebarChat /> : <PlanViewer />}
				</ErrorBoundary>
			</div>
		</div>
	</div>


}

