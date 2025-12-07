# Plan: Fix Missing Brain Tool UI Components

## Problem

Brain tools are defined in the backend but have no UI rendering components in `SidebarChat.tsx`. This causes:
- No approve buttons to appear when auto-approve is OFF
- Tool results never display after execution
- AI asks verbally for approval instead of showing proper UI buttons

## Root Cause

The `builtinToolNameToComponent` object in [`src/vs/workbench/contrib/void/browser/react/src/sidebar-tsx/SidebarChat.tsx`](src/vs/workbench/contrib/void/browser/react/src/sidebar-tsx/SidebarChat.tsx) (line 2012) is missing definitions for brain tools. When a brain tool is called:

1. Code looks up `builtinToolNameToComponent[toolName]` → returns `undefined`
2. `ToolResultWrapper` is undefined
3. Line 2642: `if (ToolResultWrapper)` returns FALSE
4. Returns `null` without rendering approve buttons (lines 2651-2654)

## Solution

Add 6 brain tool definitions to `builtinToolNameToComponent` object around line 2543, right after the `kill_persistent_terminal` definition.

### Tools to Add

Each tool needs:
- A `resultWrapper` function that returns a React component
- Handling for `tool_request` and `running_now` types (return null to hide)
- Display logic for `success` type (show result)
- Error handling for `tool_error` type (show error in expandable section)
- Support for `rejected` type (show as cancelled)

### Implementation Details

**Location:** [`src/vs/workbench/contrib/void/browser/react/src/sidebar-tsx/SidebarChat.tsx`](src/vs/workbench/contrib/void/browser/react/src/sidebar-tsx/SidebarChat.tsx) line ~2543

Add after the `'kill_persistent_terminal'` entry:

```typescript
'add_lesson': {
    resultWrapper: ({ toolMessage }) => {
        const accessor = useAccessor();
        const title = getTitle(toolMessage);
        const { desc1, desc1Info } = toolNameToDesc(toolMessage.name, toolMessage.params, accessor);

        if (toolMessage.type === 'tool_request') return null;
        if (toolMessage.type === 'running_now') return null;

        const isRejected = toolMessage.type === 'rejected';
        const componentParams: ToolHeaderParams = { title, desc1, desc1Info, isRejected };

        if (toolMessage.type === 'success') {
            componentParams.children = <ToolChildrenWrapper>
                <div className="text-void-fg-3 text-sm">
                    Lesson added to project brain
                </div>
            </ToolChildrenWrapper>;
        } else if (toolMessage.type === 'tool_error') {
            componentParams.bottomChildren = <BottomChildren title='Error'>
                <CodeChildren>{toolMessage.result}</CodeChildren>
            </BottomChildren>;
        }

        return <ToolHeaderWrapper {...componentParams} />;
    }
},

'search_lessons': {
    resultWrapper: ({ toolMessage }) => {
        const accessor = useAccessor();
        const title = getTitle(toolMessage);
        const { desc1, desc1Info } = toolNameToDesc(toolMessage.name, toolMessage.params, accessor);

        if (toolMessage.type === 'tool_request') return null;
        if (toolMessage.type === 'running_now') return null;

        const isRejected = toolMessage.type === 'rejected';
        const componentParams: ToolHeaderParams = { title, desc1, desc1Info, isRejected };

        if (toolMessage.type === 'success') {
            const lessons = toolMessage.result?.lessons || [];
            componentParams.numResults = lessons.length;
            componentParams.children = <ToolChildrenWrapper>
                <div className="text-void-fg-3 text-sm">
                    Found {lessons.length} relevant lesson{lessons.length !== 1 ? 's' : ''}
                </div>
            </ToolChildrenWrapper>;
        } else if (toolMessage.type === 'tool_error') {
            componentParams.bottomChildren = <BottomChildren title='Error'>
                <CodeChildren>{toolMessage.result}</CodeChildren>
            </BottomChildren>;
        }

        return <ToolHeaderWrapper {...componentParams} />;
    }
},

'update_lesson': {
    resultWrapper: ({ toolMessage }) => {
        const accessor = useAccessor();
        const title = getTitle(toolMessage);
        const { desc1, desc1Info } = toolNameToDesc(toolMessage.name, toolMessage.params, accessor);

        if (toolMessage.type === 'tool_request') return null;
        if (toolMessage.type === 'running_now') return null;

        const isRejected = toolMessage.type === 'rejected';
        const componentParams: ToolHeaderParams = { title, desc1, desc1Info, isRejected };

        if (toolMessage.type === 'success') {
            componentParams.children = <ToolChildrenWrapper>
                <div className="text-void-fg-3 text-sm">
                    Lesson updated successfully
                </div>
            </ToolChildrenWrapper>;
        } else if (toolMessage.type === 'tool_error') {
            componentParams.bottomChildren = <BottomChildren title='Error'>
                <CodeChildren>{toolMessage.result}</CodeChildren>
            </BottomChildren>;
        }

        return <ToolHeaderWrapper {...componentParams} />;
    }
},

'delete_lesson': {
    resultWrapper: ({ toolMessage }) => {
        const accessor = useAccessor();
        const title = getTitle(toolMessage);
        const { desc1, desc1Info } = toolNameToDesc(toolMessage.name, toolMessage.params, accessor);

        if (toolMessage.type === 'tool_request') return null;
        if (toolMessage.type === 'running_now') return null;

        const isRejected = toolMessage.type === 'rejected';
        const componentParams: ToolHeaderParams = { title, desc1, desc1Info, isRejected };

        if (toolMessage.type === 'success') {
            componentParams.children = <ToolChildrenWrapper>
                <div className="text-void-fg-3 text-sm">
                    Lesson deleted from brain
                </div>
            </ToolChildrenWrapper>;
        } else if (toolMessage.type === 'tool_error') {
            componentParams.bottomChildren = <BottomChildren title='Error'>
                <CodeChildren>{toolMessage.result}</CodeChildren>
            </BottomChildren>;
        }

        return <ToolHeaderWrapper {...componentParams} />;
    }
},

'promote_to_global': {
    resultWrapper: ({ toolMessage }) => {
        const accessor = useAccessor();
        const title = getTitle(toolMessage);
        const { desc1, desc1Info } = toolNameToDesc(toolMessage.name, toolMessage.params, accessor);

        if (toolMessage.type === 'tool_request') return null;
        if (toolMessage.type === 'running_now') return null;

        const isRejected = toolMessage.type === 'rejected';
        const componentParams: ToolHeaderParams = { title, desc1, desc1Info, isRejected };

        if (toolMessage.type === 'success') {
            componentParams.children = <ToolChildrenWrapper>
                <div className="text-void-fg-3 text-sm">
                    Lesson promoted to global brain
                </div>
            </ToolChildrenWrapper>;
        } else if (toolMessage.type === 'tool_error') {
            componentParams.bottomChildren = <BottomChildren title='Error'>
                <CodeChildren>{toolMessage.result}</CodeChildren>
            </BottomChildren>;
        }

        return <ToolHeaderWrapper {...componentParams} />;
    }
},

'cleanup_brain': {
    resultWrapper: ({ toolMessage }) => {
        const accessor = useAccessor();
        const title = getTitle(toolMessage);
        const { desc1, desc1Info } = toolNameToDesc(toolMessage.name, toolMessage.params, accessor);

        if (toolMessage.type === 'tool_request') return null;
        if (toolMessage.type === 'running_now') return null;

        const isRejected = toolMessage.type === 'rejected';
        const componentParams: ToolHeaderParams = { title, desc1, desc1Info, isRejected };

        if (toolMessage.type === 'success') {
            const removed = toolMessage.result?.removedCount || 0;
            componentParams.children = <ToolChildrenWrapper>
                <div className="text-void-fg-3 text-sm">
                    Brain cleanup complete. Removed {removed} duplicate{removed !== 1 ? 's' : ''}
                </div>
            </ToolChildrenWrapper>;
        } else if (toolMessage.type === 'tool_error') {
            componentParams.bottomChildren = <BottomChildren title='Error'>
                <CodeChildren>{toolMessage.result}</CodeChildren>
            </BottomChildren>;
        }

        return <ToolHeaderWrapper {...componentParams} />;
    }
},
```

Add this code block right after the `'kill_persistent_terminal'` definition ends (after line 2542) and before the closing brace of `builtinToolNameToComponent`.

## Expected Results After Fix

- Approve buttons will appear for brain tools when auto-approve is OFF
- Tool results will display in collapsed boxes after execution
- AI will no longer ask verbally for approval
- Tool call history will be visible in the chat interface
- "Files with changes" counter will work correctly (though brain tools don't modify files)

## Testing

After implementing:
1. Turn auto-approve OFF in settings
2. In Agent mode, ask AI to use a brain tool (e.g., "search for lessons about authentication")
3. Verify approve buttons appear
4. Click approve
5. Verify tool result displays in a collapsible box




