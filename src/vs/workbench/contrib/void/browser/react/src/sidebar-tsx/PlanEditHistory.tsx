/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import React, { useState, useEffect, useCallback } from 'react'
import { useAccessor } from '../util/services.js'
import type { HybridPlan, PlanEditSession, PlanEditMessage } from '../../../../../common/hybridAgentTypes.js'
import { ChatMarkdownRender } from '../markdown/ChatMarkdownRender.js'

// Props for PlanEditHistory component
interface PlanEditHistoryProps {
	planId: string
	scope: 'project' | 'global'
	onClose: () => void
	onRestore: (plan: HybridPlan) => void
}

export const PlanEditHistory = ({
	planId,
	scope,
	onClose,
	onRestore
}: PlanEditHistoryProps) => {
	const accessor = useAccessor()
	const hybridPlanService = accessor.get('IHybridPlanService')
	const notificationService = accessor.get('INotificationService')

	const [sessions, setSessions] = useState<PlanEditSession[]>([])
	const [selectedSession, setSelectedSession] = useState<PlanEditSession | null>(null)
	const [filter, setFilter] = useState<'all' | 'week' | 'month'>('all')
	const [isLoading, setIsLoading] = useState(true)

	// Load edit sessions
	useEffect(() => {
		const loadSessions = async () => {
			setIsLoading(true)
			try {
				const allSessions = await hybridPlanService.getEditSessions(planId, scope)

				// Apply time filter
				const now = Date.now()
				const weekAgo = now - (7 * 24 * 60 * 60 * 1000)
				const monthAgo = now - (30 * 24 * 60 * 60 * 1000)

				let filteredSessions = allSessions
				if (filter === 'week') {
					filteredSessions = allSessions.filter(s => new Date(s.timestamp).getTime() > weekAgo)
				} else if (filter === 'month') {
					filteredSessions = allSessions.filter(s => new Date(s.timestamp).getTime() > monthAgo)
				}

				// Sort by timestamp descending (newest first)
				filteredSessions.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())

				setSessions(filteredSessions)
			} catch (error) {
				console.error('Failed to load edit sessions:', error)
				setSessions([])
			} finally {
				setIsLoading(false)
			}
		}

		loadSessions()
	}, [planId, scope, filter, hybridPlanService])

	// Handle restore from session
	const handleRestore = useCallback(async () => {
		if (!selectedSession) return

		try {
			// Get the snapshot associated with this session (if any)
			const snapshot = await hybridPlanService.getLastPlanSnapshot(planId, scope)
			if (snapshot) {
				await hybridPlanService.savePlan(snapshot, scope)
				notificationService.info('Plan restored from snapshot')
				onRestore(snapshot)
			} else {
				notificationService.warn('No snapshot available to restore')
			}
		} catch (error) {
			notificationService.error(`Failed to restore: ${error}`)
		}
	}, [selectedSession, planId, scope, hybridPlanService, notificationService, onRestore])

	// Handle delete session
	const handleDeleteSession = useCallback(async (sessionId: string) => {
		if (!window.confirm('Delete this edit session from history?')) return

		try {
			await hybridPlanService.deleteEditSession(sessionId, scope)
			setSessions(prev => prev.filter(s => s.sessionId !== sessionId))
			if (selectedSession?.sessionId === sessionId) {
				setSelectedSession(null)
			}
			notificationService.info('Session deleted')
		} catch (error) {
			notificationService.error(`Failed to delete: ${error}`)
		}
	}, [selectedSession, scope, hybridPlanService, notificationService])

	// Format date
	const formatDate = (timestamp: string) => {
		const date = new Date(timestamp)
		return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
	}

	const formatTime = (timestamp: string) => {
		return new Date(timestamp).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
	}

	return (
		<div
			className="fixed inset-0 flex items-center justify-center z-50"
			style={{ backgroundColor: 'rgba(0, 0, 0, 0.7)' }}
			onClick={(e) => e.target === e.currentTarget && onClose()}
			role="dialog"
			aria-modal="true"
			aria-labelledby="history-modal-title"
		>
			<div
				className="rounded-lg shadow-xl overflow-hidden"
				style={{ backgroundColor: '#1A1B1F', width: '800px', maxHeight: '80vh' }}
			>
				{/* Header */}
				<div className="flex justify-between items-center p-4 border-b" style={{ borderColor: '#2A2B2F' }}>
					<h2 id="history-modal-title" className="text-lg font-bold" style={{ color: '#E8E9EC' }}>
						Edit History
					</h2>
					<button
						onClick={onClose}
						className="p-2 rounded hover:bg-accent transition-colors"
						style={{ color: '#7D8390' }}
						aria-label="Close history"
					>
						✕
					</button>
				</div>

				{/* Content */}
				<div className="flex" style={{ height: '500px' }}>
					{/* Left: Session List */}
					<div className="w-1/3 border-r overflow-auto" style={{ borderColor: '#2A2B2F' }}>
						{/* Filter Tabs */}
						<div className="flex border-b" style={{ borderColor: '#2A2B2F' }}>
							{(['all', 'week', 'month'] as const).map(f => (
								<button
									key={f}
									onClick={() => setFilter(f)}
									className="flex-1 py-2 text-xs font-medium transition-colors"
									style={{
										backgroundColor: filter === f ? '#2A2B2F' : 'transparent',
										color: filter === f ? '#E8E9EC' : '#7D8390'
									}}
								>
									{f === 'all' ? 'All' : f === 'week' ? 'Past Week' : 'Past Month'}
								</button>
							))}
						</div>

						{/* Session List */}
						{isLoading ? (
							<div className="p-4 text-center" style={{ color: '#7D8390' }}>
								Loading...
							</div>
						) : sessions.length === 0 ? (
							<div className="p-4 text-center" style={{ color: '#7D8390' }}>
								No edit history
							</div>
						) : (
							sessions.map(session => (
								<HistorySessionItem
									key={session.sessionId}
									session={session}
									isSelected={selectedSession?.sessionId === session.sessionId}
									onClick={() => setSelectedSession(session)}
									formatDate={formatDate}
									formatTime={formatTime}
								/>
							))
						)}
					</div>

					{/* Right: Session Details */}
					<div className="w-2/3 p-4 overflow-auto">
						{selectedSession ? (
							<>
								{/* Session Header */}
								<div className="mb-4">
									<div className="text-sm font-medium" style={{ color: '#E8E9EC' }}>
										{formatDate(selectedSession.timestamp)} at {formatTime(selectedSession.timestamp)}
									</div>
									<div className="text-xs mt-1" style={{ color: '#7D8390' }}>
										{selectedSession.messages.length} messages
									</div>
									{selectedSession.changesSummary && (
										<div className="text-xs mt-2 p-2 rounded" style={{ backgroundColor: '#2A2B2F', color: '#A8ABB3' }}>
											{selectedSession.changesSummary}
										</div>
									)}
								</div>

								{/* Session Messages */}
								<div className="space-y-3 mb-4">
									{selectedSession.messages.map((msg, idx) => (
										<SessionMessage key={idx} message={msg} />
									))}
								</div>

								{/* Session Actions */}
								<div className="flex gap-2 pt-4 border-t" style={{ borderColor: '#2A2B2F' }}>
									<button
										onClick={handleRestore}
										className="px-4 py-2 text-sm font-medium rounded transition-all hover:brightness-110"
										style={{ backgroundColor: '#00D9A0', color: '#16171A' }}
									>
										Restore to Before This Session
									</button>
									<button
										onClick={() => handleDeleteSession(selectedSession.sessionId)}
										className="px-4 py-2 text-sm font-medium rounded transition-all hover:brightness-110"
										style={{ backgroundColor: '#FF3D6A', color: '#E8E9EC' }}
									>
										Delete Session
									</button>
								</div>
							</>
						) : (
							<div className="h-full flex items-center justify-center" style={{ color: '#7D8390' }}>
								Select a session to view details
							</div>
						)}
					</div>
				</div>
			</div>
		</div>
	)
}

// Session item in the list
const HistorySessionItem = ({
	session,
	isSelected,
	onClick,
	formatDate,
	formatTime
}: {
	session: PlanEditSession
	isSelected: boolean
	onClick: () => void
	formatDate: (ts: string) => string
	formatTime: (ts: string) => string
}) => (
	<div
		className="p-3 cursor-pointer border-b transition-colors"
		style={{
			backgroundColor: isSelected ? 'rgba(0, 217, 160, 0.1)' : 'transparent',
			borderColor: '#2A2B2F'
		}}
		onClick={onClick}
	>
		<div className="font-medium text-sm" style={{ color: '#E8E9EC' }}>
			{formatDate(session.timestamp)}
		</div>
		<div className="text-xs" style={{ color: '#7D8390' }}>
			{formatTime(session.timestamp)}
		</div>
		<div className="text-xs mt-1 truncate" style={{ color: '#7D8390' }}>
			{session.changesSummary || `${session.messages.length} messages`}
		</div>
	</div>
)

// Message in session details
const SessionMessage = ({ message }: { message: PlanEditMessage }) => {
	const isUser = message.role === 'user'

	return (
		<div
			className="p-3 rounded text-sm"
			style={{
				backgroundColor: isUser ? 'rgba(255, 61, 106, 0.1)' : '#2A2B2F',
				borderLeft: `3px solid ${isUser ? '#FF3D6A' : '#00D9A0'}`
			}}
		>
			<div className="text-xs font-medium mb-1" style={{ color: isUser ? '#FF3D6A' : '#00D9A0' }}>
				{isUser ? 'You' : 'AI'}
			</div>
			{isUser ? (
				<p style={{ color: '#E8E9EC' }}>{message.content}</p>
			) : (
				<div style={{ color: '#E8E9EC' }}>
					<ChatMarkdownRender
						string={message.content}
						chatMessageLocation={undefined}
						isApplyEnabled={false}
						isLinkDetectionEnabled={false}
					/>
				</div>
			)}
		</div>
	)
}


