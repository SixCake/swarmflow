// Comment types for task comments, thread replies, and mission discussions

export type CommentTargetType = 'task' | 'thread' | 'mission'

export interface Comment {
  id: string
  /** Terminal ID of the comment author */
  authorTerminalId: string
  /** Role of the author (e.g. 'analyst', 'moderator') */
  authorRole: string
  /** Markdown content of the comment */
  content: string
  /** What this comment is attached to */
  targetType: CommentTargetType
  /** ID of the target (taskId, threadId, or missionId) */
  targetId: string
  /** Parent comment ID for nested replies */
  parentCommentId?: string
  /** When the comment was created */
  createdAt: Date
  /** Optional metadata */
  metadata?: Record<string, unknown>
}

export interface CreateCommentInput {
  authorTerminalId: string
  authorRole: string
  content: string
  targetType: CommentTargetType
  targetId: string
  parentCommentId?: string
  metadata?: Record<string, unknown>
}
