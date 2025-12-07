/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import React, { useState, useCallback, useRef, useEffect } from 'react'
import { useAccessor } from '../util/services.js'
import type { HybridPlan, PlanEditMessage, PlanEditToolCall } from '../../../../../common/hybridAgentTypes.js'
import { ChatMarkdownRender } from '../markdown/ChatMarkdownRender.js'

// Props for PlanEditChat component
interface PlanEditChatProps {
	plan: HybridPlan
	messages: PlanEditMessage[]
	isStreaming: boolean
	onMessagesUpdate: (messages: PlanEditMessage[]) => void
	onPlanUpdate: (updatedPlan: HybridPlan, section: string) => void
	onStreamingChange: (isStreaming: boolean) => void
	inputRef: React.RefObject<HTMLTextAreaElement>
}

// Sanitize user input to prevent XSS
const sanitizeInput = (input: string): string => {
	const MAX_MESSAGE_LENGTH = 10000
	return input
		.slice(0, MAX_MESSAGE_LENGTH)
		.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
		.trim()
}

// Rate limiter for message sending
class RateLimiter {
	private messageTimestamps: number[] = []
	private readonly maxMessagesPerMinute = 20

	canSendMessage(): boolean {
		const now = Date.now()
		const oneMinuteAgo = now - 60000

		// Clean old timestamps
		this.messageTimestamps = this.messageTimestamps.filter(t => t > oneMinuteAgo)

		return this.messageTimestamps.length < this.maxMessagesPerMinute
	}

	recordMessage(): void {
		this.messageTimestamps.push(Date.now())
	}
}

const rateLimiter = new RateLimiter()

export const PlanEditChat = ({
	plan,
	messages,
	isStreaming,
	onMessagesUpdate,
	onPlanUpdate,
	onStreamingChange,
	inputRef
}: PlanEditChatProps) => {
	const accessor = useAccessor()
	const hybridPlanService = accessor.get('IHybridPlanService')
	const notificationService = accessor.get('INotificationService')

	const [inputValue, setInputValue] = useState('')
	const [streamingContent, setStreamingContent] = useState('')
	const messagesEndRef = useRef<HTMLDivElement>(null)

	// Scroll to bottom when messages update
	useEffect(() => {
		messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
	}, [messages, streamingContent])

	// Handle sending a message
	const handleSendMessage = useCallback(async () => {
		const sanitizedInput = sanitizeInput(inputValue)
		if (!sanitizedInput || isStreaming) return

		// Rate limiting
		if (!rateLimiter.canSendMessage()) {
			notificationService.warn('Too many messages. Please wait a moment.')
			return
		}
		rateLimiter.recordMessage()

		// Add user message
		const userMessage: PlanEditMessage = {
			role: 'user',
			content: sanitizedInput,
			timestamp: new Date().toISOString()
		}

		const updatedMessages = [...messages, userMessage]
		onMessagesUpdate(updatedMessages)
		setInputValue('')

		// Start streaming
		onStreamingChange(true)
		setStreamingContent('')

		try {
			// Send to AI with plan context
			const scope = plan.projectPath ? 'project' : 'global'
			const response = await hybridPlanService.sendPlanEditMessage(
				plan.planId,
				sanitizedInput,
				messages,
				scope
			)

			if (response) {
				// Process the response
				const assistantMessage: PlanEditMessage = {
					role: 'assistant',
					content: response.content,
					timestamp: new Date().toISOString(),
					toolCalls: response.toolCalls
				}

				// Check if any tool calls updated the plan
				if (response.toolCalls && response.updatedPlan) {
					onPlanUpdate(response.updatedPlan, response.updatedSection || 'full')
				}

				onMessagesUpdate([...updatedMessages, assistantMessage])
			}
		} catch (error) {
			console.error('Failed to send message:', error)
			notificationService.error(`Failed to send message: ${error}`)

			// Add error message
			const errorMessage: PlanEditMessage = {
				role: 'assistant',
				content: 'Sorry, I encountered an error processing your request. Please try again.',
				timestamp: new Date().toISOString()
			}
			onMessagesUpdate([...updatedMessages, errorMessage])
		} finally {
			onStreamingChange(false)
			setStreamingContent('')
		}
	}, [inputValue, isStreaming, messages, plan, onMessagesUpdate, onStreamingChange, onPlanUpdate, hybridPlanService, notificationService])

	// Handle key down in input
	const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
		// Cmd/Ctrl + Enter to send
		if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
			e.preventDefault()
			handleSendMessage()
		}
	}, [handleSendMessage])

	return (
		<div className="flex flex-col h-full" style={{ backgroundColor: '#1A1B1F' }} role="region" aria-label="Plan editing chat">
			{/* Messages Area */}
			<div className="flex-1 overflow-auto p-4 space-y-4" role="log" aria-live="polite" aria-relevant="additions">
				{messages.length === 0 && (
					<div className="text-center py-8" style={{ color: '#7D8390' }} role="status">
						<p className="text-sm mb-2">Chat with AI to edit this plan</p>
						<p className="text-xs">Example: "Add more details to step 2" or "Change the title to X"</p>
					</div>
				)}

				{messages.map((msg, idx) => (
					<MessageBubble key={idx} message={msg} />
				))}

				{/* Streaming indicator */}
				{isStreaming && (
					<div className="flex items-center gap-2 px-4 py-2 rounded" style={{ backgroundColor: '#2A2B2F' }}>
						<div className="flex gap-1">
							<span className="w-2 h-2 rounded-full bg-primary animate-bounce" style={{ backgroundColor: '#00D9A0', animationDelay: '0ms' }} />
							<span className="w-2 h-2 rounded-full bg-primary animate-bounce" style={{ backgroundColor: '#00D9A0', animationDelay: '150ms' }} />
							<span className="w-2 h-2 rounded-full bg-primary animate-bounce" style={{ backgroundColor: '#00D9A0', animationDelay: '300ms' }} />
						</div>
						<span className="text-sm" style={{ color: '#A8ABB3' }}>AI is thinking...</span>
					</div>
				)}

				{streamingContent && (
					<div className="px-4 py-3 rounded" style={{ backgroundColor: '#2A2B2F' }}>
						<ChatMarkdownRender
							string={typeof streamingContent === 'string' ? streamingContent : String(streamingContent)}
							chatMessageLocation={undefined}
							isApplyEnabled={false}
							isLinkDetectionEnabled={false}
						/>
					</div>
				)}

				<div ref={messagesEndRef} />
			</div>

			{/* Input Area */}
			<div className="flex-shrink-0 p-4 border-t" style={{ borderColor: '#2A2B2F' }}>
				<div className="flex gap-2">
					<textarea
						ref={inputRef}
						value={inputValue}
						onChange={(e) => setInputValue(e.target.value)}
						onKeyDown={handleKeyDown}
						placeholder="Describe how you want to change the plan..."
						disabled={isStreaming}
						className="flex-1 p-3 rounded resize-none text-sm focus:outline-none focus:ring-1 focus:ring-ring"
						style={{
							backgroundColor: '#16171A',
							color: '#E8E9EC',
							border: '1px solid #2A2B2F',
							minHeight: '80px',
							maxHeight: '200px'
						}}
						aria-label="Edit plan message input"
					/>
					<button
						onClick={handleSendMessage}
						disabled={!inputValue.trim() || isStreaming}
						className="px-4 py-2 rounded font-medium transition-all duration-150 hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed"
						style={{
							backgroundColor: inputValue.trim() && !isStreaming ? '#00D9A0' : '#2A2B2F',
							color: inputValue.trim() && !isStreaming ? '#16171A' : '#7D8390',
							alignSelf: 'flex-end'
						}}
						aria-label="Send message"
					>
						Send
					</button>
				</div>
				<div className="text-xs mt-2" style={{ color: '#7D8390' }}>
					Press <kbd className="px-1 py-0.5 rounded" style={{ backgroundColor: '#2A2B2F' }}>⌘</kbd>+<kbd className="px-1 py-0.5 rounded" style={{ backgroundColor: '#2A2B2F' }}>Enter</kbd> to send • <kbd className="px-1 py-0.5 rounded" style={{ backgroundColor: '#2A2B2F' }}>Esc</kbd> to exit
				</div>
			</div>

			{/* Screen reader announcements */}
			<div aria-live="polite" className="sr-only">
				{isStreaming && "AI is responding..."}
			</div>
		</div>
	)
}

// Message bubble component
const MessageBubble = ({ message }: { message: PlanEditMessage }) => {
	const isUser = message.role === 'user'

	return (
		<div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
			<div
				className="max-w-[80%] px-4 py-3 rounded-lg"
				style={{
					backgroundColor: isUser ? '#FF3D6A' : '#2A2B2F',
					color: '#E8E9EC'
				}}
			>
				{isUser ? (
					<p className="text-sm whitespace-pre-wrap">{typeof message.content === 'string' ? message.content : JSON.stringify(message.content, null, 2)}</p>
				) : (
					<div className="text-sm">
						<ChatMarkdownRender
							string={typeof message.content === 'string' ? message.content : JSON.stringify(message.content, null, 2)}
							chatMessageLocation={undefined}
							isApplyEnabled={false}
							isLinkDetectionEnabled={false}
						/>
					</div>
				)}

				{/* Show tool calls if any */}
				{message.toolCalls && message.toolCalls.length > 0 && (
					<div className="mt-2 pt-2 border-t" style={{ borderColor: '#3A3B3F' }}>
						{message.toolCalls.map((tc, idx) => (
							<ToolCallIndicator key={idx} toolCall={tc} />
						))}
					</div>
				)}

				<div className="text-xs mt-1 opacity-60">
					{new Date(message.timestamp).toLocaleTimeString()}
				</div>
			</div>
		</div>
	)
}

// Tool call indicator component
const ToolCallIndicator = ({ toolCall }: { toolCall: PlanEditToolCall }) => {
	const isSuccess = toolCall.result?.success

	return (
		<div
			className="flex items-center gap-2 text-xs py-1 px-2 rounded"
			style={{ backgroundColor: isSuccess ? 'rgba(0, 217, 160, 0.2)' : 'rgba(255, 61, 106, 0.2)' }}
		>
			<span>{isSuccess ? '✓' : '✗'}</span>
			<span className="font-mono">{toolCall.toolName}</span>
			{toolCall.result?.message && (
				<span className="opacity-80">- {toolCall.result.message}</span>
			)}
		</div>
	)
}

