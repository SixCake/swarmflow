// Comment management for task comments, thread replies, and mission discussions

import type { Comment, CreateCommentInput, CommentTargetType } from '../types/comment.types.js'

export class CommentBoard {
  private comments: Map<string, Comment> = new Map()
  private commentCounter = 0

  /**
   * Add a new comment.
   * Returns the created comment with generated ID and timestamp.
   */
  addComment(input: CreateCommentInput): Comment {
    const comment: Comment = {
      ...input,
      id: `comment-${++this.commentCounter}`,
      createdAt: new Date(),
    }
    this.comments.set(comment.id, comment)
    return comment
  }

  /**
   * Get a comment by ID.
   */
  getComment(commentId: string): Comment | undefined {
    return this.comments.get(commentId)
  }

  /**
   * Get all comments for a specific target (task, thread, or mission).
   * Returns comments sorted by creation time (oldest first).
   */
  getCommentsByTarget(targetType: CommentTargetType, targetId: string): Comment[] {
    return [...this.comments.values()]
      .filter(c => c.targetType === targetType && c.targetId === targetId)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
  }

  /**
   * Get a comment and all its nested replies (recursive thread).
   * Returns the root comment plus all descendants sorted by creation time.
   */
  getCommentThread(commentId: string): Comment[] {
    const root = this.comments.get(commentId)
    if (!root) return []

    const thread: Comment[] = [root]
    const collectReplies = (parentId: string) => {
      const replies = [...this.comments.values()]
        .filter(c => c.parentCommentId === parentId)
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      for (const reply of replies) {
        thread.push(reply)
        collectReplies(reply.id)
      }
    }
    collectReplies(commentId)
    return thread
  }

  /**
   * Get the number of comments for a specific target.
   */
  getCommentCount(targetType: CommentTargetType, targetId: string): number {
    return [...this.comments.values()]
      .filter(c => c.targetType === targetType && c.targetId === targetId)
      .length
  }

  /**
   * Get all comments (for admin/debug purposes).
   */
  getAllComments(): Comment[] {
    return [...this.comments.values()]
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
  }

  /**
   * Get total comment count.
   */
  getTotalCount(): number {
    return this.comments.size
  }
}
