/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import React, { useState, useEffect, useCallback, useRef } from 'react'
import { useAccessor } from '../util/services.js'
import type { HybridPlan, PlanEditMessage } from '../../../../../common/hybridAgentTypes.js'
import { ChatMarkdownRender } from '../markdown/ChatMarkdownRender.js'
import { PlanEditChat } from './PlanEditChat.js'
import { PlanEditHistory } from './PlanEditHistory.js'

// Edit mode state interface
interface EditModeState {
	isEditMode: boolean
	isAIStreaming: boolean
	previousSnapshot: HybridPlan | null
	editSessionId: string
	pendingToolCalls: string[]
	isDirty: boolean
	messages: PlanEditMessage[]
	lastUpdatedSection: string | null
}

// Generate unique session ID
const generateSessionId = () => `edit-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`

export const PlanViewer = () => {
	const accessor = useAccessor()
	const hybridPlanService = accessor.get('IHybridPlanService')
	const notificationService = accessor.get('INotificationService')
	const [plans, setPlans] = useState<HybridPlan[]>([])
	const [selectedPlan, setSelectedPlan] = useState<HybridPlan | null>(null)
	const [filter, setFilter] = useState<'all' | 'project' | 'global'>('all')

	// Edit mode state
	const [editMode, setEditMode] = useState<EditModeState>({
		isEditMode: false,
		isAIStreaming: false,
		previousSnapshot: null,
		editSessionId: '',
		pendingToolCalls: [],
		isDirty: false,
		messages: [],
		lastUpdatedSection: null
	})

	// History modal state
	const [showHistory, setShowHistory] = useState(false)

	// Notification state for undo
	const [undoNotification, setUndoNotification] = useState<{
		show: boolean
		section: string
		timeoutId: NodeJS.Timeout | null
	}>({ show: false, section: '', timeoutId: null })

	// Resizable panel state - load from localStorage or default to 20%
	const [leftWidth, setLeftWidth] = useState(() => {
		const saved = localStorage.getItem('void.plans.leftWidth')
		return saved ? parseFloat(saved) : 20
	})
	const [isDragging, setIsDragging] = useState(false)
	const containerRef = useRef<HTMLDivElement>(null)
	const chatInputRef = useRef<HTMLTextAreaElement>(null)
	const previousFocusRef = useRef<Element | null>(null)

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

	const handleDelete = useCallback(async (planId: string, scope: 'project' | 'global' | 'both') => {
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

	// Auto-save draft to localStorage
	useEffect(() => {
		if (!editMode.isEditMode || !selectedPlan || editMode.messages.length === 0) return

		const draftKey = `void.planEdit.draft.${selectedPlan.planId}`
		const draft = {
			planId: selectedPlan.planId,
			messages: editMode.messages,
			sessionId: editMode.editSessionId,
			timestamp: Date.now()
		}
		localStorage.setItem(draftKey, JSON.stringify(draft))
	}, [editMode.isEditMode, editMode.messages, selectedPlan])

	// Check for recovery draft on mount
	useEffect(() => {
		if (!selectedPlan || editMode.isEditMode) return

		const draftKey = `void.planEdit.draft.${selectedPlan.planId}`
		const draftStr = localStorage.getItem(draftKey)
		if (draftStr) {
			try {
				const draft = JSON.parse(draftStr)
				// Check if draft is recent (within 24 hours)
				const hoursSinceDraft = (Date.now() - draft.timestamp) / (1000 * 60 * 60)
				if (hoursSinceDraft < 24 && draft.messages?.length > 0) {
					// Optionally prompt user to restore - for now just log
					console.log('Found unsaved edit session for plan:', selectedPlan.planId)
				} else {
					// Clean up old draft
					localStorage.removeItem(draftKey)
				}
			} catch {
				localStorage.removeItem(draftKey)
			}
		}
	}, [selectedPlan, editMode.isEditMode])

	// Release lock on unmount or when leaving edit mode unexpectedly
	useEffect(() => {
		// Cleanup function runs when component unmounts or dependencies change
		return () => {
			if (editMode.isEditMode && selectedPlan) {
				const scope = selectedPlan.projectPath ? 'project' : 'global'
				hybridPlanService.releaseEditLock(selectedPlan.planId, scope).catch(err => {
					console.error('Failed to release lock on cleanup:', err)
				})
			}
		}
	}, [editMode.isEditMode, selectedPlan, hybridPlanService])

	// Enter edit mode
	const enterEditMode = useCallback(async () => {
		if (!selectedPlan) return

		const scope = selectedPlan.projectPath ? 'project' : 'global'

		// Try to acquire lock
		const lockResult = await hybridPlanService.acquireEditLock(selectedPlan.planId, scope)
		if (!lockResult.success) {
			notificationService.warn(lockResult.error || 'Plan is currently being edited')
			return
		}

		// Store current focus for restoration later
		previousFocusRef.current = document.activeElement

		// Save current plan as snapshot for undo
		const snapshot = JSON.parse(JSON.stringify(selectedPlan))

		// Check for existing draft
		const draftKey = `void.planEdit.draft.${selectedPlan.planId}`
		const draftStr = localStorage.getItem(draftKey)
		let restoredMessages: PlanEditMessage[] = []

		if (draftStr) {
			try {
				const draft = JSON.parse(draftStr)
				const hoursSinceDraft = (Date.now() - draft.timestamp) / (1000 * 60 * 60)
				if (hoursSinceDraft < 24 && draft.messages?.length > 0) {
					const shouldRestore = window.confirm('Found unsaved edit session. Restore it?')
					if (shouldRestore) {
						restoredMessages = draft.messages
						notificationService.info('Previous session restored')
					} else {
						localStorage.removeItem(draftKey)
					}
				}
			} catch {
				localStorage.removeItem(draftKey)
			}
		}

		setEditMode({
			isEditMode: true,
			isAIStreaming: false,
			previousSnapshot: snapshot,
			editSessionId: generateSessionId(),
			pendingToolCalls: [],
			isDirty: restoredMessages.length > 0,
			messages: restoredMessages,
			lastUpdatedSection: null
		})

		// Focus chat input after entering edit mode
		setTimeout(() => chatInputRef.current?.focus(), 100)
	}, [selectedPlan, notificationService, hybridPlanService])

	// Exit edit mode
	const exitEditMode = useCallback(async (saveSession: boolean = true) => {
		if (editMode.isDirty && saveSession && selectedPlan) {
			// Save the edit session for history
			const scope = selectedPlan.projectPath ? 'project' : 'global'
			try {
				await hybridPlanService.saveEditSession({
					sessionId: editMode.editSessionId,
					planId: selectedPlan.planId,
					timestamp: new Date().toISOString(),
					messages: editMode.messages,
					changesSummary: `Edit session with ${editMode.messages.length} messages`,
					scope
				}, scope)
				notificationService.info('Edit session saved to history')
			} catch (error) {
				console.error('Failed to save edit session:', error)
			}
		}

		// Release the edit lock
		if (selectedPlan) {
			const scope = selectedPlan.projectPath ? 'project' : 'global'
			try {
				await hybridPlanService.releaseEditLock(selectedPlan.planId, scope)
			} catch (error) {
				console.error('Failed to release lock:', error)
			}
		}

		// Clean up draft from localStorage
		if (selectedPlan) {
			const draftKey = `void.planEdit.draft.${selectedPlan.planId}`
			localStorage.removeItem(draftKey)
		}

		// Clear undo notification if showing
		if (undoNotification.timeoutId) {
			clearTimeout(undoNotification.timeoutId)
			setUndoNotification({ show: false, section: '', timeoutId: null })
		}

		setEditMode({
			isEditMode: false,
			isAIStreaming: false,
			previousSnapshot: null,
			editSessionId: '',
			pendingToolCalls: [],
			isDirty: false,
			messages: [],
			lastUpdatedSection: null
		})

		// Restore previous focus
		if (previousFocusRef.current && previousFocusRef.current instanceof HTMLElement) {
			previousFocusRef.current.focus()
		}
	}, [editMode, selectedPlan, hybridPlanService, notificationService, undoNotification.timeoutId])

	// Undo last change
	const handleUndo = useCallback(async () => {
		if (!editMode.previousSnapshot || !selectedPlan) {
			notificationService.warn('Nothing to undo')
			return
		}

		const scope = selectedPlan.projectPath ? 'project' : 'global'
		try {
			await hybridPlanService.savePlan(editMode.previousSnapshot, scope)
			setSelectedPlan(editMode.previousSnapshot)
			setEditMode(prev => ({
				...prev,
				previousSnapshot: null,
				isDirty: false
			}))
			notificationService.info('Change reverted')
			await loadPlans()
		} catch (error) {
			notificationService.error(`Failed to undo: ${error}`)
		}
	}, [editMode.previousSnapshot, selectedPlan, hybridPlanService, notificationService, loadPlans])

	// Handle plan update from AI
	const handlePlanUpdate = useCallback((updatedPlan: HybridPlan, section: string) => {
		// Save current as snapshot before applying new changes
		if (selectedPlan) {
			setEditMode(prev => ({
				...prev,
				previousSnapshot: JSON.parse(JSON.stringify(selectedPlan)),
				isDirty: true,
				lastUpdatedSection: section
			}))

			// Clear any existing notification timeout
			if (undoNotification.timeoutId) {
				clearTimeout(undoNotification.timeoutId)
			}

			// Show undo notification
			const timeoutId = setTimeout(() => {
				setUndoNotification({ show: false, section: '', timeoutId: null })
			}, 10000) // Auto-hide after 10 seconds

			setUndoNotification({
				show: true,
				section,
				timeoutId
			})
		}
		setSelectedPlan(updatedPlan)

		// Clear lastUpdatedSection after animation
		setTimeout(() => {
			setEditMode(prev => ({ ...prev, lastUpdatedSection: null }))
		}, 2000)
	}, [selectedPlan])

	// Handle messages update from chat
	const handleMessagesUpdate = useCallback((messages: PlanEditMessage[]) => {
		setEditMode(prev => ({ ...prev, messages }))
	}, [])

	// Handle streaming state
	const handleStreamingChange = useCallback((isStreaming: boolean) => {
		setEditMode(prev => ({ ...prev, isAIStreaming: isStreaming }))
	}, [])

	// Handle switching plans while in edit mode
	const handlePlanSelect = useCallback(async (plan: HybridPlan) => {
		if (editMode.isEditMode && editMode.isDirty) {
			// Prompt user to save changes
			const shouldSave = window.confirm('You have unsaved changes. Save before switching?')
			if (shouldSave) {
				await exitEditMode(true)
			} else {
				await exitEditMode(false)
			}
		} else if (editMode.isEditMode) {
			await exitEditMode(false)
		}
		setSelectedPlan(plan)
	}, [editMode.isEditMode, editMode.isDirty, exitEditMode])

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

	// Keyboard shortcuts
	useEffect(() => {
		if (!editMode.isEditMode) return

		const handleKeyDown = (e: KeyboardEvent) => {
			// Escape to exit edit mode
			if (e.key === 'Escape') {
				if (editMode.isDirty) {
					const shouldSave = window.confirm('Save changes before exiting?')
					exitEditMode(shouldSave)
				} else {
					exitEditMode(false)
				}
			}
			// Cmd/Ctrl + Z to undo
			if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey) {
				e.preventDefault()
				handleUndo()
			}
		}

		document.addEventListener('keydown', handleKeyDown)
		return () => document.removeEventListener('keydown', handleKeyDown)
	}, [editMode.isEditMode, editMode.isDirty, exitEditMode, handleUndo])

	return (
		<div
			ref={containerRef}
			className="flex h-full relative bg-background"
			style={{
				userSelect: isDragging ? 'none' : 'auto',
				backgroundColor: '#16171A'
			}}
		>
			{/* Left Panel - Plan List */}
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
							<div key={plan.planId} onClick={() => handlePlanSelect(plan)}
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

			{/* Right Panel - Plan View / Edit Mode */}
			<div
				style={{
					width: `${100 - leftWidth}%`,
					willChange: isDragging ? 'width' : 'auto',
					backgroundColor: '#16171A'
				}}
				className="overflow-hidden bg-background transition-[width] duration-75 flex flex-col">
				{selectedPlan ? (
					editMode.isEditMode ? (
						// Edit Mode Layout - Split panel
						<div className="flex flex-col h-full">
							{/* Header with Edit Mode Controls */}
							<div className="flex-shrink-0 p-4 border-b" style={{ borderColor: '#2A2B2F' }}>
								<div className="flex justify-between items-center">
									<div className="flex items-center gap-2">
										<h2 className="text-xl font-bold" style={{ color: '#E8E9EC' }}>
											{selectedPlan.title}
										</h2>
										<span className="px-2 py-0.5 text-xs rounded-full" style={{ backgroundColor: '#FF3D6A', color: '#E8E9EC' }}>
											Editing
										</span>
										{editMode.isDirty && (
											<span className="px-2 py-0.5 text-xs rounded-full" style={{ backgroundColor: '#FFB84D', color: '#16171A' }}>
												Unsaved
											</span>
										)}
									</div>
									<div className="flex gap-2">
										{editMode.previousSnapshot && (
											<button
												onClick={handleUndo}
												className="px-3 py-1.5 text-sm font-medium rounded transition-all duration-150 hover:brightness-110 hover:scale-[1.02] active:scale-[0.98]"
												style={{ backgroundColor: '#2A2B2F', color: '#E8E9EC' }}
												aria-label="Undo last change"
											>
												Undo
											</button>
										)}
										<button
											onClick={() => exitEditMode(true)}
											className="px-3 py-1.5 text-sm font-medium rounded transition-all duration-150 hover:brightness-110 hover:scale-[1.02] active:scale-[0.98]"
											style={{ backgroundColor: '#00D9A0', color: '#16171A' }}
											aria-label="Done editing"
										>
											Done Editing
										</button>
									</div>
								</div>
							</div>

							{/* Split Panel - Top: Preview, Bottom: Chat */}
							<div className="flex-1 flex flex-col overflow-hidden">
								{/* Top Half - Plan Preview */}
								<div
									className="flex-1 overflow-auto p-4"
									style={{ borderBottom: '1px solid #2A2B2F', minHeight: '40%', maxHeight: '50%' }}
									role="article"
									aria-label="Plan content preview"
									aria-busy={editMode.isAIStreaming}
								>
									<PlanPreview
										plan={selectedPlan}
										lastUpdatedSection={editMode.lastUpdatedSection}
									/>
								</div>

								{/* Bottom Half - Chat Interface */}
								<div
									className="flex-1 overflow-hidden"
									style={{ minHeight: '50%' }}
									role="log"
									aria-label="Plan editing conversation"
									aria-live="polite"
								>
									<PlanEditChat
										plan={selectedPlan}
										messages={editMode.messages}
										isStreaming={editMode.isAIStreaming}
										onMessagesUpdate={handleMessagesUpdate}
										onPlanUpdate={handlePlanUpdate}
										onStreamingChange={handleStreamingChange}
										inputRef={chatInputRef}
									/>
								</div>
							</div>
						</div>
					) : (
						// Normal View Mode
						<div className="overflow-auto p-4 h-full">
							<div className="mb-4 flex justify-between">
								<div>
									<h2 className="text-xl font-bold text-foreground" style={{ color: '#E8E9EC' }}>{selectedPlan.title}</h2>
									<div className="text-sm text-muted-foreground" style={{ color: '#7D8390' }}>
										{new Date(selectedPlan.createdAt).toLocaleString()}
									</div>
								</div>
								<div className="flex gap-2">
									<button
										onClick={enterEditMode}
										className="px-3 py-1.5 text-sm font-medium rounded transition-all duration-150 hover:brightness-110 hover:scale-[1.02] active:scale-[0.98]"
										style={{ backgroundColor: '#00D9A0', color: '#16171A' }}
										aria-label="Edit plan"
									>
										Edit
									</button>
									<button
										onClick={() => setShowHistory(true)}
										className="px-3 py-1.5 text-sm font-medium rounded transition-all duration-150 hover:brightness-110 hover:scale-[1.02] active:scale-[0.98]"
										style={{ backgroundColor: '#2A2B2F', color: '#E8E9EC' }}
										aria-label="View edit history"
									>
										History
									</button>
									<button onClick={() => handleArchive(selectedPlan.planId,
										selectedPlan.projectPath ? 'project' : 'global')}
										className="px-3 py-1.5 text-sm font-medium rounded bg-primary text-primary-foreground transition-all duration-150 hover:brightness-110 hover:scale-[1.02] active:scale-[0.98]"
										style={{ backgroundColor: '#FF3D6A', color: '#E8E9EC' }}>
										Archive
									</button>
									<button onClick={() => handleDelete(selectedPlan.planId, 'both')}
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

							{/* Steps Section in Normal View */}
							{selectedPlan.steps && selectedPlan.steps.length > 0 && (
								<div className="mt-6">
									<h3 className="text-lg font-semibold mb-3" style={{ color: '#E8E9EC' }}>Steps</h3>
									<ol style={{ color: '#A8ABB3', paddingLeft: '1.5rem' }}>
										{selectedPlan.steps.map((step, idx) => {
											const s = step as any
											const stepKey = s.stepId || s.id || s.phase || `step-${idx}`

											// Safely convert any value to string
											const safeToString = (val: any): string => {
												if (val === null || val === undefined) return ''
												if (typeof val === 'string') return val
												if (typeof val === 'number' || typeof val === 'boolean') return String(val)
												if (Array.isArray(val)) return val.map(safeToString).join(', ')
												if (typeof val === 'object') return JSON.stringify(val)
												return String(val)
											}

											let title = ''
											let description = ''

											if (typeof s === 'string') {
												description = s
											} else if (typeof s === 'object' && s !== null) {
												// Get title from various possible fields
												title = safeToString(s.title || s.phase || '')

												// Get description - handle both string and object formats
												if (s.description) {
													description = safeToString(s.description)
												} else if (s.objective) {
													description = safeToString(s.objective)
												} else if (s.content) {
													description = safeToString(s.content)
												} else {
													// No specific description field - show key info
													const parts: string[] = []
													if (s.tasks) parts.push(`Tasks: ${safeToString(s.tasks)}`)
													if (s.estimatedTime) parts.push(`Time: ${safeToString(s.estimatedTime)}`)
													if (s.deliverables) parts.push(`Deliverables: ${safeToString(s.deliverables)}`)
													description = parts.length > 0 ? parts.join(' | ') : safeToString(s)
												}
											}

											// Final safety check - ensure description is always a string
											if (typeof description !== 'string') {
												description = safeToString(description)
											}

											return (
												<li key={stepKey} style={{ marginBottom: '0.75rem' }}>
													{title && <strong style={{ color: '#E8E9EC' }}>{title}</strong>}
													{title && description && ': '}
													<span style={{ color: '#A8ABB3' }}>{description}</span>
												</li>
											)
										})}
									</ol>
								</div>
							)}

							{/* Tags Section in Normal View */}
							{selectedPlan.tags && selectedPlan.tags.length > 0 && (
								<div className="flex gap-1 flex-wrap mt-4">
									{selectedPlan.tags.map(tag => (
										<span
											key={tag}
											className="px-2 py-0.5 text-xs rounded"
											style={{ backgroundColor: '#2A2B2F', color: '#A8ABB3' }}
										>
											{tag}
										</span>
									))}
								</div>
							)}
						</div>
					)
				) : (
					<div className="text-center text-muted-foreground mt-8 p-4" style={{ color: '#7D8390' }}>
						Select a plan
					</div>
				)}
			</div>

			{/* History Modal */}
			{showHistory && selectedPlan && (
				<PlanEditHistory
					planId={selectedPlan.planId}
					scope={selectedPlan.projectPath ? 'project' : 'global'}
					onClose={() => setShowHistory(false)}
					onRestore={(restoredPlan) => {
						setSelectedPlan(restoredPlan)
						setShowHistory(false)
						loadPlans()
					}}
				/>
			)}

			{/* Undo Notification Toast */}
			{undoNotification.show && editMode.isEditMode && (
				<UndoNotification
					section={undoNotification.section}
					onUndo={() => {
						handleUndo()
						if (undoNotification.timeoutId) {
							clearTimeout(undoNotification.timeoutId)
						}
						setUndoNotification({ show: false, section: '', timeoutId: null })
					}}
					onDismiss={() => {
						if (undoNotification.timeoutId) {
							clearTimeout(undoNotification.timeoutId)
						}
						setUndoNotification({ show: false, section: '', timeoutId: null })
					}}
				/>
			)}
		</div>
	)
}

// Undo notification toast component
const UndoNotification = ({
	section,
	onUndo,
	onDismiss
}: {
	section: string
	onUndo: () => void
	onDismiss: () => void
}) => (
	<div
		className="fixed bottom-4 right-4 flex items-center gap-3 px-4 py-3 rounded-lg shadow-lg z-50 animate-slide-up"
		style={{ backgroundColor: '#2A2B2F', border: '1px solid #3A3B3F' }}
		role="alert"
		aria-live="polite"
	>
		<span className="text-sm" style={{ color: '#E8E9EC' }}>
			Plan {section} updated
		</span>
		<button
			onClick={onUndo}
			className="px-3 py-1 text-sm font-medium rounded transition-all hover:brightness-110"
			style={{ backgroundColor: '#00D9A0', color: '#16171A' }}
		>
			Undo
		</button>
		<button
			onClick={onDismiss}
			className="p-1 rounded hover:bg-opacity-80 transition-colors"
			style={{ color: '#7D8390' }}
			aria-label="Dismiss"
		>
			✕
		</button>

		<style>{`
			@keyframes slide-up {
				from {
					transform: translateY(20px);
					opacity: 0;
				}
				to {
					transform: translateY(0);
					opacity: 1;
				}
			}
			.animate-slide-up {
				animation: slide-up 0.3s ease-out;
			}
		`}</style>
	</div>
)

// Plan Preview Component with update animation
const PlanPreview = ({ plan, lastUpdatedSection }: { plan: HybridPlan; lastUpdatedSection: string | null }) => {
	const sectionRef = useRef<HTMLDivElement>(null)

	useEffect(() => {
		if (lastUpdatedSection && sectionRef.current) {
			const element = sectionRef.current.querySelector(`#plan-section-${lastUpdatedSection}`)
			element?.scrollIntoView({ behavior: 'smooth', block: 'center' })
		}
	}, [lastUpdatedSection])

	return (
		<div ref={sectionRef} className="prose prose-invert max-w-none" style={{ color: '#E8E9EC' }}>
			{/* Title Section */}
			<div
				id="plan-section-title"
				className={lastUpdatedSection === 'title' ? 'plan-section-updated' : ''}
			>
				<h3 style={{ color: '#E8E9EC', margin: 0 }}>{plan.title}</h3>
			</div>

			{/* Summary Section */}
			<div
				id="plan-section-summary"
				className={lastUpdatedSection === 'summary' ? 'plan-section-updated' : ''}
			>
				<ChatMarkdownRender
					string={plan.summary || ''}
					chatMessageLocation={undefined}
					isApplyEnabled={false}
					isLinkDetectionEnabled={false}
				/>
			</div>

			{/* Steps Section (if any) */}
			{plan.steps && plan.steps.length > 0 && (
				<div
					id="plan-section-steps"
					className={lastUpdatedSection === 'steps' ? 'plan-section-updated' : ''}
				>
					<h4 style={{ color: '#E8E9EC' }}>Steps</h4>
					<ol style={{ color: '#A8ABB3', paddingLeft: '1.5rem' }}>
						{plan.steps.map((step, idx) => {
							// Handle various step formats from AI
							const s = step as any
							const stepKey = s.stepId || s.id || s.phase || `step-${idx}`

							// Safely convert any value to string
							const safeToString = (val: any): string => {
								if (val === null || val === undefined) return ''
								if (typeof val === 'string') return val
								if (typeof val === 'number' || typeof val === 'boolean') return String(val)
								if (Array.isArray(val)) return val.map(safeToString).join(', ')
								if (typeof val === 'object') return JSON.stringify(val)
								return String(val)
							}

							// Try to get a meaningful title/description
							let title = ''
							let description = ''

							if (typeof s === 'string') {
								description = s
							} else if (typeof s === 'object' && s !== null) {
								// Get title from various possible fields
								title = safeToString(s.title || s.phase || '')

								// Get description - handle both string and object formats
								if (s.description) {
									description = safeToString(s.description)
								} else if (s.objective) {
									description = safeToString(s.objective)
								} else if (s.content) {
									description = safeToString(s.content)
								} else {
									// No specific description field - show key info
									const parts: string[] = []
									if (s.tasks) parts.push(`Tasks: ${safeToString(s.tasks)}`)
									if (s.estimatedTime) parts.push(`Time: ${safeToString(s.estimatedTime)}`)
									if (s.deliverables) parts.push(`Deliverables: ${safeToString(s.deliverables)}`)
									description = parts.length > 0 ? parts.join(' | ') : safeToString(s)
								}
							}

							// Final safety check - ensure description is always a string
							if (typeof description !== 'string') {
								description = safeToString(description)
							}

							return (
								<li key={stepKey} style={{ marginBottom: '0.5rem' }}>
									{title && <strong style={{ color: '#E8E9EC' }}>{title}</strong>}
									{title && description && ': '}
									<span style={{ color: '#A8ABB3' }}>{description || ''}</span>
								</li>
							)
						})}
					</ol>
				</div>
			)}

			{/* Tags Section */}
			{plan.tags && plan.tags.length > 0 && (
				<div
					id="plan-section-tags"
					className={lastUpdatedSection === 'tags' ? 'plan-section-updated' : ''}
				>
					<div className="flex gap-1 flex-wrap mt-4">
						{plan.tags.map(tag => (
							<span
								key={tag}
								className="px-2 py-0.5 text-xs rounded"
								style={{ backgroundColor: '#2A2B2F', color: '#A8ABB3' }}
							>
								{tag}
							</span>
						))}
					</div>
				</div>
			)}

			{/* CSS for update animation */}
			<style>{`
				@keyframes highlightUpdate {
					0% { background-color: rgba(0, 217, 160, 0.3); }
					100% { background-color: transparent; }
				}
				.plan-section-updated {
					animation: highlightUpdate 2s ease-out;
				}
			`}</style>
		</div>
	)
}
