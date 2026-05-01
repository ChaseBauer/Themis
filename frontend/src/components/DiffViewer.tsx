import { useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  MessageSquare,
  Reply,
  Trash2,
  X,
} from 'lucide-react'
import type { ChangeComment, User } from '../types'

interface Props {
  diff: string
  title?: string
  comments?: ChangeComment[]
  users?: User[]
  currentUserId?: string
  canComment?: boolean
  onAddComment?: (data: {
    content: string
    parent_comment_id?: string
    line_start?: number
    line_end?: number
    line_snapshot?: string
  }) => void
  onResolveComment?: (commentId: string) => void
  onDeleteComment?: (commentId: string) => void
}

function classifyLine(line: string) {
  const removedHeader = '-'.repeat(3)
  if (line.startsWith('+++') || line.startsWith(removedHeader)) return 'meta'
  if (line.startsWith('@@')) return 'hunk'
  if (line.startsWith('+')) return 'add'
  if (line.startsWith('-')) return 'remove'
  return 'context'
}

const lineBg: Record<string, string> = {
  meta: 'bg-gray-100 dark:bg-gray-700/50',
  hunk: 'bg-blue-50 dark:bg-blue-900/20',
  add: 'bg-green-50 dark:bg-green-900/20',
  remove: 'bg-red-50 dark:bg-red-900/20',
  context: '',
}

const lineText: Record<string, string> = {
  meta: 'text-gray-500 dark:text-gray-400',
  hunk: 'text-blue-600 dark:text-blue-400 font-medium',
  add: 'text-green-800 dark:text-green-300',
  remove: 'text-red-800 dark:text-red-300',
  context: 'text-gray-700 dark:text-gray-300',
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function snapshotOutdated(comment: ChangeComment, lines: string[]): boolean {
  if (!comment.line_snapshot || !comment.line_start) return false
  const start = comment.line_start - 1
  const end = (comment.line_end ?? comment.line_start) - 1
  return lines.slice(start, end + 1).join('\n') !== comment.line_snapshot
}

function renderMentions(text: string) {
  const parts = text.split(/(@[A-Za-z0-9_-]+)/g)
  return parts.map((part, index) =>
    part.startsWith('@') ? (
      <span key={index} className="font-medium text-blue-600 dark:text-blue-400">
        {part}
      </span>
    ) : (
      <span key={index}>{part}</span>
    ),
  )
}

function CommentComposer({
  users = [],
  placeholder,
  buttonLabel,
  autoFocus,
  onSubmit,
  onCancel,
}: {
  users?: User[]
  placeholder: string
  buttonLabel: string
  autoFocus?: boolean
  onSubmit: (content: string) => void
  onCancel?: () => void
}) {
  const [text, setText] = useState('')

  const mentionMatch = text.match(/(?:^|\s)@([A-Za-z0-9_-]*)$/)
  const mentionQuery = mentionMatch?.[1]?.toLowerCase()
  const suggestions =
    mentionQuery === undefined
      ? []
      : users
          .filter((user) => user.username.toLowerCase().includes(mentionQuery))
          .slice(0, 5)

  const insertMention = (username: string) => {
    setText((current) => current.replace(/(^|\s)@[A-Za-z0-9_-]*$/, `$1@${username} `))
  }

  const submit = () => {
    if (!text.trim()) return
    onSubmit(text.trim())
    setText('')
  }

  return (
    <div className="rounded-lg border border-blue-200 dark:border-blue-800 bg-white dark:bg-gray-800 shadow-sm">
      <textarea
        autoFocus={autoFocus}
        rows={3}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit()
          if (e.key === 'Escape' && onCancel) onCancel()
        }}
        placeholder={placeholder}
        className="w-full px-3 py-2 text-xs text-gray-800 dark:text-gray-200 bg-transparent resize-none focus:outline-none"
      />
      {suggestions.length > 0 && (
        <div className="mx-3 mb-2 flex flex-wrap gap-1">
          {suggestions.map((user) => (
            <button
              key={user.id}
              type="button"
              onClick={() => insertMention(user.username)}
              className="rounded-md bg-blue-50 dark:bg-blue-900/30 px-2 py-1 text-xs font-medium text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/50"
            >
              @{user.username}
            </button>
          ))}
        </div>
      )}
      <div className="flex justify-end gap-2 border-t border-gray-100 dark:border-gray-700 px-3 py-2">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="px-3 py-1 text-xs text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 rounded"
          >
            Cancel
          </button>
        )}
        <button
          type="button"
          onClick={submit}
          disabled={!text.trim()}
          className="px-3 py-1 text-xs font-medium bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
        >
          {buttonLabel}
        </button>
      </div>
    </div>
  )
}

function CommentThread({
  comment,
  replies,
  users,
  currentUserId,
  diffLines,
  canComment,
  onReply,
  onResolve,
  onDelete,
}: {
  comment: ChangeComment
  replies: ChangeComment[]
  users?: User[]
  currentUserId?: string
  diffLines: string[]
  canComment?: boolean
  onReply?: (parentId: string, content: string) => void
  onResolve?: (id: string) => void
  onDelete?: (id: string) => void
}) {
  const [expanded, setExpanded] = useState(!comment.resolved)
  const [replying, setReplying] = useState(false)
  const outdated = snapshotOutdated(comment, diffLines)
  const canDelete = currentUserId === comment.user_id

  useEffect(() => {
    if (comment.resolved) {
      setExpanded(false)
      setReplying(false)
    } else {
      setExpanded(true)
    }
  }, [comment.resolved])

  return (
    <div
      className={`border-l-4 rounded-r-lg text-sm ${
        comment.resolved
          ? 'border-green-400 bg-green-50 dark:bg-green-900/10'
          : 'border-blue-400 bg-blue-50/70 dark:bg-blue-950/20'
      }`}
    >
      <div className="flex items-center justify-between px-3 py-2 gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-medium text-gray-800 dark:text-gray-200 text-xs">
            {comment.username}
          </span>
          <span className="text-gray-400 dark:text-gray-500 text-xs">
            {formatDate(comment.created_at)}
          </span>
          {outdated && !comment.resolved && (
            <span className="flex items-center gap-1 text-[10px] font-medium text-indigo-700 dark:text-indigo-300 bg-indigo-100 dark:bg-indigo-950/40 px-1.5 py-0.5 rounded">
              <AlertTriangle className="w-3 h-3" /> outdated
            </span>
          )}
          {comment.resolved && (
            <span className="text-[10px] font-medium text-green-700 dark:text-green-400 bg-green-100 dark:bg-green-900/30 px-1.5 py-0.5 rounded">
              resolved by {comment.resolved_by_username}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          {canComment && onReply && (
            <button
              onClick={() => {
                setExpanded(true)
                setReplying((value) => !value)
              }}
              title="Reply"
              className="p-1 rounded text-gray-400 hover:text-blue-600 transition-colors"
            >
              <Reply className="w-3.5 h-3.5" />
            </button>
          )}
          {canComment && onResolve && (
            <button
              onClick={() => onResolve(comment.id)}
              title={comment.resolved ? 'Re-open' : 'Resolve'}
              className={`p-1 rounded transition-colors ${
                comment.resolved
                  ? 'text-gray-400 hover:text-gray-600'
                  : 'text-green-600 hover:text-green-800 dark:hover:text-green-400'
              }`}
            >
              <CheckCircle className="w-3.5 h-3.5" />
            </button>
          )}
          {canComment && canDelete && onDelete && (
            <button
              onClick={() => onDelete(comment.id)}
              title="Delete thread"
              className="p-1 rounded text-gray-400 hover:text-red-500 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            onClick={() => setExpanded((value) => !value)}
            className="p-1 rounded text-gray-400 hover:text-gray-600"
          >
            {expanded ? (
              <ChevronUp className="w-3.5 h-3.5" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5" />
            )}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="px-3 pb-3 space-y-3">
          {comment.line_snapshot && comment.line_start && !outdated && (
            <div className="rounded border border-gray-200 dark:border-gray-700 overflow-hidden text-xs font-mono">
              <div className="bg-gray-100 dark:bg-gray-900/50 px-2 py-0.5 text-gray-500 dark:text-gray-400 text-[10px] font-sans">
                {comment.line_start === (comment.line_end ?? comment.line_start)
                  ? `Line ${comment.line_start}`
                  : `Lines ${comment.line_start}-${comment.line_end}`}
              </div>
              {comment.line_snapshot.split('\n').map((line, index) => {
                const type = classifyLine(line)
                return (
                  <div
                    key={`snippet-${index}`}
                    className={`px-2 py-px whitespace-pre ${lineBg[type]} ${lineText[type]}`}
                  >
                    {line || ' '}
                  </div>
                )
              })}
            </div>
          )}

          {outdated && comment.line_snapshot && comment.line_start && (
            <div className="rounded-lg border border-indigo-200/80 dark:border-indigo-900/70 bg-indigo-50/60 dark:bg-indigo-950/20 p-2">
              <div className="mb-2 flex items-center gap-1.5 text-[11px] font-medium text-indigo-700 dark:text-indigo-300">
                <AlertTriangle className="w-3 h-3" />
                Commented lines have changed
              </div>
              <div className="grid gap-2 lg:grid-cols-2">
                <div className="overflow-hidden rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900/40">
                  <div className="border-b border-gray-100 dark:border-gray-800 px-2 py-1 text-[10px] font-medium uppercase tracking-wide text-gray-400">
                    Commented on
                  </div>
                  <pre className="border-l-2 border-gray-300 dark:border-gray-600 px-2 py-1 text-xs text-gray-600 dark:text-gray-300 overflow-x-auto whitespace-pre-wrap">
                    {comment.line_snapshot}
                  </pre>
                </div>
                <div className="overflow-hidden rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900/40">
                  <div className="border-b border-gray-100 dark:border-gray-800 px-2 py-1 text-[10px] font-medium uppercase tracking-wide text-gray-400">
                    Current lines
                  </div>
                  <pre className="border-l-2 border-indigo-400 px-2 py-1 text-xs text-gray-700 dark:text-gray-200 overflow-x-auto whitespace-pre-wrap">
                    {diffLines
                      .slice(comment.line_start - 1, comment.line_end ?? comment.line_start)
                      .join('\n')}
                  </pre>
                </div>
              </div>
            </div>
          )}

          <p className="text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
            {renderMentions(comment.content)}
          </p>

          {replies.length > 0 && (
            <div className="space-y-2 border-l border-blue-200 dark:border-blue-900 pl-3">
              {replies.map((reply) => (
                <div key={reply.id} className="rounded-md bg-white/70 dark:bg-gray-900/30 px-3 py-2">
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-gray-800 dark:text-gray-200">
                        {reply.username}
                      </span>
                      <span className="text-xs text-gray-400">{formatDate(reply.created_at)}</span>
                    </div>
                    {canComment && currentUserId === reply.user_id && onDelete && (
                      <button
                        onClick={() => onDelete(reply.id)}
                        title="Delete reply"
                        className="p-1 rounded text-gray-400 hover:text-red-500"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                  <p className="text-xs text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                    {renderMentions(reply.content)}
                  </p>
                </div>
              ))}
            </div>
          )}

          {replying && onReply && (
            <CommentComposer
              users={users}
              autoFocus
              placeholder="Reply with @username to mention someone..."
              buttonLabel="Reply"
              onCancel={() => setReplying(false)}
              onSubmit={(content) => {
                onReply(comment.id, content)
                setReplying(false)
              }}
            />
          )}
        </div>
      )}
    </div>
  )
}

export default function DiffViewer({
  diff,
  title,
  comments = [],
  users = [],
  currentUserId,
  canComment = false,
  onAddComment,
  onResolveComment,
  onDeleteComment,
}: Props) {
  const lines = diff.split('\n')
  const [selStart, setSelStart] = useState<number | null>(null)
  const [selEnd, setSelEnd] = useState<number | null>(null)
  const [showLineForm, setShowLineForm] = useState(false)
  const [showGeneralForm, setShowGeneralForm] = useState(false)
  const isDragging = useRef(false)

  const selLow = selStart !== null && selEnd !== null ? Math.min(selStart, selEnd) : null
  const selHigh = selStart !== null && selEnd !== null ? Math.max(selStart, selEnd) : null

  const rootComments = comments.filter((comment) => !comment.parent_comment_id)
  const repliesByParent = useMemo(() => {
    const map = new Map<string, ChangeComment[]>()
    for (const comment of comments) {
      if (!comment.parent_comment_id) continue
      const replies = map.get(comment.parent_comment_id) ?? []
      replies.push(comment)
      map.set(comment.parent_comment_id, replies)
    }
    return map
  }, [comments])

  const unresolvedCount = rootComments.filter((comment) => !comment.resolved).length
  const showCommentsSection = canComment || rootComments.length > 0 || showGeneralForm

  const submitLineComment = (content: string) => {
    if (!onAddComment || selLow === null || selHigh === null) return
    onAddComment({
      content,
      line_start: selLow,
      line_end: selHigh,
      line_snapshot: lines.slice(selLow - 1, selHigh).join('\n'),
    })
    clearSelection()
  }

  const submitGeneralComment = (content: string) => {
    onAddComment?.({ content })
    setShowGeneralForm(false)
  }

  const submitReply = (parentCommentId: string, content: string) => {
    onAddComment?.({ content, parent_comment_id: parentCommentId })
  }

  function handleGutterMouseDown(lineNum: number) {
    if (!canComment) return
    isDragging.current = true
    setSelStart(lineNum)
    setSelEnd(lineNum)
    setShowLineForm(false)
  }

  function handleGutterMouseEnter(lineNum: number) {
    if (!isDragging.current || !canComment) return
    setSelEnd(lineNum)
  }

  function handleGutterMouseUp(lineNum: number) {
    if (!canComment) return
    isDragging.current = false
    setSelEnd(lineNum)
    setShowLineForm(true)
  }

  function clearSelection() {
    setSelStart(null)
    setSelEnd(null)
    setShowLineForm(false)
  }

  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
      {(title || canComment || unresolvedCount > 0) && (
        <div className="bg-gray-50 dark:bg-gray-700/50 border-b border-gray-200 dark:border-gray-700 px-4 py-2 flex items-center justify-between gap-3">
          {title && (
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{title}</span>
          )}
          <div className="ml-auto flex items-center gap-2">
            {unresolvedCount > 0 && (
              <span className="flex items-center gap-1.5 text-xs font-medium text-blue-700 dark:text-blue-300 bg-blue-100 dark:bg-blue-950/40 px-2 py-0.5 rounded-full">
                <MessageSquare className="w-3 h-3" />
                {unresolvedCount} unresolved
              </span>
            )}
          </div>
        </div>
      )}

      <div className="overflow-x-auto" onMouseLeave={() => (isDragging.current = false)}>
        <table
          className="w-full text-xs font-mono"
          style={{ userSelect: canComment ? 'none' : undefined }}
        >
          <tbody>
            {lines.flatMap((line, index) => {
              const lineNum = index + 1
              const type = classifyLine(line)
              const isSelected =
                selLow !== null && selHigh !== null && lineNum >= selLow && lineNum <= selHigh
              const gutterHighlight = isSelected
                ? '!bg-blue-100 dark:!bg-blue-900/30'
                : ''
              const contentHighlight = isSelected
                ? '!bg-blue-100 dark:!bg-blue-900/30'
                : ''
              const rows: React.ReactNode[] = []

              rows.push(
                <tr
                  key={`line-${index}`}
                  className={`group ${lineBg[type]} hover:brightness-95`}
                >
                  <td
                    className={`select-none text-right pr-2 pl-3 py-0.5 w-10 min-w-[2.5rem] border-r border-gray-200 dark:border-gray-700 cursor-pointer relative ${gutterHighlight}`}
                    onMouseDown={() => handleGutterMouseDown(lineNum)}
                    onMouseEnter={() => handleGutterMouseEnter(lineNum)}
                    onMouseUp={() => handleGutterMouseUp(lineNum)}
                  >
                    <span className="text-gray-400 dark:text-gray-500">{lineNum}</span>
                  </td>
                  <td
                    className={`px-4 py-0.5 whitespace-pre ${lineText[type]} ${contentHighlight}`}
                  >
                    {line || ' '}
                  </td>
                </tr>,
              )

              if (showLineForm && selHigh === lineNum && selLow !== null) {
                rows.push(
                  <tr key={`form-${index}`}>
                    <td className="border-r border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/30" />
                    <td className="p-0 bg-gray-50 dark:bg-gray-800/30">
                      <div className="mx-4 my-1.5 rounded-lg border border-blue-300 dark:border-blue-700 bg-white dark:bg-gray-800 shadow-sm">
                        <div className="flex items-center justify-between px-3 py-1.5 border-b border-gray-100 dark:border-gray-700 text-xs text-gray-500">
                          <span>
                            Comment on{' '}
                            {selLow === selHigh ? `line ${selLow}` : `lines ${selLow}-${selHigh}`}
                          </span>
                          <button
                            onClick={clearSelection}
                            className="text-gray-400 hover:text-gray-600"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        <div className="p-2">
                          <CommentComposer
                            users={users}
                            autoFocus
                            placeholder="Leave a comment. Type @username to mention someone..."
                            buttonLabel="Comment"
                            onCancel={clearSelection}
                            onSubmit={submitLineComment}
                          />
                        </div>
                      </div>
                    </td>
                  </tr>,
                )
              }

              return rows
            })}
          </tbody>
        </table>
      </div>

      {showCommentsSection && (
        <div className="border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/30">
          <div className="px-4 py-3 flex items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Comments</h3>
              {canComment && rootComments.length === 0 && (
                <p className="text-xs text-gray-400 mt-0.5">No comments yet</p>
              )}
            </div>
            {canComment && onAddComment && (
              <button
                onClick={() => setShowGeneralForm((value) => !value)}
                className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 px-2.5 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                <MessageSquare className="w-3.5 h-3.5" />
                Comment
              </button>
            )}
          </div>

          {showGeneralForm && onAddComment && (
            <div className="px-4 pb-3">
              <CommentComposer
                users={users}
                autoFocus
                placeholder="Comment on this change. Type @username to mention someone..."
                buttonLabel="Comment"
                onCancel={() => setShowGeneralForm(false)}
                onSubmit={submitGeneralComment}
              />
            </div>
          )}

          {rootComments.length > 0 && (
            <div className="px-4 pb-4 space-y-2">
              {rootComments.map((comment) => (
                <CommentThread
                  key={comment.id}
                  comment={comment}
                  replies={repliesByParent.get(comment.id) ?? []}
                  users={users}
                  currentUserId={currentUserId}
                  diffLines={lines}
                  canComment={canComment}
                  onReply={submitReply}
                  onResolve={onResolveComment}
                  onDelete={onDeleteComment}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
