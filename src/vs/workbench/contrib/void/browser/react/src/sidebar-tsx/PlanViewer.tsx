/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import React, { useState, useEffect, useCallback, useRef } from 'react'
import { useAccessor } from '../util/services.js'
import type { HybridPlan } from '../../../../../common/hybridAgentTypes.js'
import { ChatMarkdownRender } from '../markdown/ChatMarkdownRender.js'

export const PlanViewer = () => {
	const accessor = useAccessor()
	const hybridPlanService = accessor.get('IHybridPlanService')
	const notificationService = accessor.get('INotificationService')
	const [plans, setPlans] = useState<HybridPlan[]>([])
	const [selectedPlan, setSelectedPlan] = useState<HybridPlan | null>(null)
	const [filter, setFilter] = useState<'all' | 'project' | 'global'>('all')

	// Resizable panel state - load from localStorage or default to 20%
	const [leftWidth, setLeftWidth] = useState(() => {
		const saved = localStorage.getItem('void.plans.leftWidth')
		return saved ? parseFloat(saved) : 20
	})
	const [isDragging, setIsDragging] = useState(false)
	const containerRef = useRef<HTMLDivElement>(null)

	const loadPlans = useCallback(async () => {
		try {
			const scope = filter === 'all' ? 'both' : filter
			const allPlans = await hybridPlanService.listPlans(scope)
			const planModePlans = allPlans.filter((p: HybridPlan) =>
				(p.planType || 'hybrid-execution') === 'plan-mode' ||
				(p.planType || 'hybrid-execution') === 'user-saved'
			)
			setPlans(planModePlans)
		} catch (error) {
			console.error('Failed to load plans:', error)
			setPlans([])
		}
	}, [filter, hybridPlanService])

	useEffect(() => {
		loadPlans()
	}, [loadPlans])

	const handleArchive = useCallback(async (planId: string, scope: 'project' | 'global') => {
		try {
			await hybridPlanService.archivePlan(planId, scope)
			await loadPlans()
			notificationService.info('Plan archived')
		} catch (error) {
			notificationService.error(`Failed to archive: ${error}`)
		}
	}, [hybridPlanService, loadPlans, notificationService])

	const handleDelete = useCallback(async (planId: string, scope: 'project' | 'global') => {
		try {
			await hybridPlanService.deletePlan(planId, scope)
			await loadPlans()
			if (selectedPlan?.planId === planId) {
				setSelectedPlan(null)
			}
			notificationService.info('Plan deleted')
		} catch (error) {
			notificationService.error(`Failed to delete: ${error}`)
		}
	}, [hybridPlanService, loadPlans, selectedPlan, notificationService])

	// Handle divider drag
	const handleMouseDown = useCallback((e: React.MouseEvent) => {
		e.preventDefault()
		e.stopPropagation()
		setIsDragging(true)
	}, [])

	// Store the current width in a ref to avoid closure issues
	const currentWidthRef = useRef(leftWidth)
	useEffect(() => {
		currentWidthRef.current = leftWidth
	}, [leftWidth])

	useEffect(() => {
		if (!isDragging) return

		// Change cursor globally while dragging
		document.body.style.cursor = 'col-resize'

		const handleMouseMove = (e: MouseEvent) => {
			e.preventDefault()
			if (!containerRef.current) return

			const containerRect = containerRef.current.getBoundingClientRect()
			const newWidth = ((e.clientX - containerRect.left) / containerRect.width) * 100

			// Clamp between 15% and 85%
			const clampedWidth = Math.min(Math.max(newWidth, 15), 85)
			setLeftWidth(clampedWidth)
		}

		const handleMouseUp = () => {
			setIsDragging(false)
			document.body.style.cursor = ''
			// Save to localStorage when drag ends - use ref to get current value
			localStorage.setItem('void.plans.leftWidth', currentWidthRef.current.toString())
		}

		document.addEventListener('mousemove', handleMouseMove)
		document.addEventListener('mouseup', handleMouseUp)

		return () => {
			document.removeEventListener('mousemove', handleMouseMove)
			document.removeEventListener('mouseup', handleMouseUp)
			document.body.style.cursor = ''
		}
	}, [isDragging])

	return (
		<div
			ref={containerRef}
			className="flex h-full relative bg-background"
			style={{
				userSelect: isDragging ? 'none' : 'auto',
				backgroundColor: '#16171A'
			}}
		>
		<div
			style={{
				width: `${leftWidth}%`,
				willChange: isDragging ? 'width' : 'auto',
				backgroundColor: '#1A1B1F'
			}}
			className="border-r border-border overflow-auto bg-card transition-[width] duration-75">
			<div className="p-2 border-b border-border" style={{ borderColor: '#2A2B2F' }}>
				<select value={filter} onChange={(e) => setFilter(e.target.value as any)}
					className="w-full p-1 bg-input text-foreground rounded transition-colors duration-150 focus:ring-1 focus:ring-ring"
					style={{ backgroundColor: '#191A1E', color: '#E8E9EC', borderColor: '#2A2B2F' }}>
					<option value="all">All Plans</option>
					<option value="project">Project</option>
					<option value="global">Global</option>
				</select>
			</div>
				<div className="divide-y divide-border" style={{ borderColor: '#2A2B2F' }}>
			{plans.map(plan => {
				const isSelected = selectedPlan?.planId === plan.planId;
				return (
				<div key={plan.planId} onClick={() => setSelectedPlan(plan)}
					className={`p-3 cursor-pointer transition-colors duration-150
						${isSelected
							? 'bg-primary text-primary-foreground'
							: 'hover:bg-accent'}`}
					style={{
						backgroundColor: isSelected ? '#FF3D6A' : 'transparent'
					}}>
						<div className="font-semibold text-sm" style={{ color: isSelected ? '#E8E9EC' : '#E8E9EC' }}>{plan.title}</div>
						<div className="text-xs mt-1"
							style={{ color: isSelected ? 'rgba(232, 233, 236, 0.8)' : '#7D8390' }}>
							{new Date(plan.createdAt).toLocaleDateString()}
						</div>
						{plan.tags?.includes('archived') && (
							<span className="text-xs" style={{ color: isSelected ? 'rgba(232, 233, 236, 0.8)' : '#7D8390' }}>📦 Archived</span>
						)}
					</div>
				);
			})}
				</div>
			</div>

		{/* Draggable divider */}
		<div
			onMouseDown={handleMouseDown}
			className={`group relative flex items-center justify-center cursor-col-resize select-none transition-colors duration-150 ${isDragging ? 'bg-ring' : 'hover:bg-accent'}`}
			style={{
				width: '8px',
				zIndex: 10,
				userSelect: 'none'
			}}
		>
			{/* Visual indicator - three vertical dots */}
			<div
				className={`flex flex-col items-center gap-[2px] pointer-events-none transition-opacity duration-150 ${isDragging ? 'opacity-100' : 'opacity-40 group-hover:opacity-70'}`}
			>
				<div className="w-[3px] h-[3px] rounded-full bg-foreground" />
				<div className="w-[3px] h-[3px] rounded-full bg-foreground" />
				<div className="w-[3px] h-[3px] rounded-full bg-foreground" />
			</div>
		</div>

		<div
			style={{
				width: `${100 - leftWidth}%`,
				willChange: isDragging ? 'width' : 'auto',
				backgroundColor: '#16171A'
			}}
			className="overflow-auto p-4 bg-background transition-[width] duration-75">
			{selectedPlan ? (
					<>
						<div className="mb-4 flex justify-between">
							<div>
								<h2 className="text-xl font-bold text-foreground" style={{ color: '#E8E9EC' }}>{selectedPlan.title}</h2>
								<div className="text-sm text-muted-foreground" style={{ color: '#7D8390' }}>
									{new Date(selectedPlan.createdAt).toLocaleString()}
								</div>
							</div>
						<div className="flex gap-2">
							<button onClick={() => handleArchive(selectedPlan.planId,
								selectedPlan.projectPath ? 'project' : 'global')}
								className="px-3 py-1.5 text-sm font-medium rounded bg-primary text-primary-foreground transition-all duration-150 hover:brightness-110 hover:scale-[1.02] active:scale-[0.98]"
								style={{ backgroundColor: '#FF3D6A', color: '#E8E9EC' }}>
								Archive
							</button>
							<button onClick={() => handleDelete(selectedPlan.planId,
								selectedPlan.projectPath ? 'project' : 'global')}
								className="px-3 py-1.5 text-sm font-medium rounded bg-primary text-primary-foreground transition-all duration-150 hover:brightness-110 hover:scale-[1.02] active:scale-[0.98]"
								style={{ backgroundColor: '#FF3D6A', color: '#E8E9EC' }}>
								Delete
							</button>
						</div>
						</div>
						<div className="prose prose-invert max-w-none" style={{ color: '#E8E9EC' }}>
							<ChatMarkdownRender
								string={selectedPlan.summary || ''}
								chatMessageLocation={undefined}
								isApplyEnabled={false}
								isLinkDetectionEnabled={false}
							/>
						</div>
					</>
				) : (
					<div className="text-center text-muted-foreground mt-8" style={{ color: '#7D8390' }}>
						Select a plan
					</div>
				)}
			</div>
		</div>
	)
}


