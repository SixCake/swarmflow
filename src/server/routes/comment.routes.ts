// Comment REST API routes — task comments, thread replies, mission discussions

import type { FastifyInstance } from 'fastify'
import type { CommentBoard } from '../../core/comment-board.js'
import type { CommentTargetType } from '../../types/comment.types.js'

export function registerCommentRoutes(
  app: FastifyInstance,
  commentBoard: CommentBoard,
): void {
  // POST /api/comments — Create a new comment
  app.post<{
    Body: {
      authorTerminalId: string
      authorRole: string
      content: string
      targetType: CommentTargetType
      targetId: string
      parentCommentId?: string
      metadata?: Record<string, unknown>
    }
  }>('/api/comments', async (request, reply) => {
    const { authorTerminalId, authorRole, content, targetType, targetId, parentCommentId, metadata } = request.body

    if (!authorTerminalId || !content || !targetType || !targetId) {
      reply.code(400).send({ error: 'Missing required fields: authorTerminalId, content, targetType, targetId' })
      return
    }

    const validTargetTypes: CommentTargetType[] = ['task', 'thread', 'mission']
    if (!validTargetTypes.includes(targetType)) {
      reply.code(400).send({ error: `Invalid targetType: ${targetType}. Must be one of: ${validTargetTypes.join(', ')}` })
      return
    }

    // Validate parentCommentId exists if provided
    if (parentCommentId && !commentBoard.getComment(parentCommentId)) {
      reply.code(404).send({ error: `Parent comment not found: ${parentCommentId}` })
      return
    }

    const comment = commentBoard.addComment({
      authorTerminalId,
      authorRole: authorRole ?? 'unknown',
      content,
      targetType,
      targetId,
      parentCommentId,
      metadata,
    })

    reply.code(201).send(comment)
  })

  // GET /api/tasks/:id/comments — Get comments for a task
  app.get<{ Params: { id: string } }>('/api/tasks/:id/comments', async (request, reply) => {
    const comments = commentBoard.getCommentsByTarget('task', request.params.id)
    reply.send(comments)
  })

  // GET /api/threads/:id/comments — Get comments for a thread
  app.get<{ Params: { id: string } }>('/api/threads/:id/comments', async (request, reply) => {
    const comments = commentBoard.getCommentsByTarget('thread', request.params.id)
    reply.send(comments)
  })

  // GET /api/missions/:id/comments — Get comments for a mission
  app.get<{ Params: { id: string } }>('/api/missions/:id/comments', async (request, reply) => {
    const comments = commentBoard.getCommentsByTarget('mission', request.params.id)
    reply.send(comments)
  })

  // POST /api/comments/:id/reply — Reply to a comment
  app.post<{
    Params: { id: string }
    Body: {
      authorTerminalId: string
      authorRole: string
      content: string
      metadata?: Record<string, unknown>
    }
  }>('/api/comments/:id/reply', async (request, reply) => {
    const parentComment = commentBoard.getComment(request.params.id)
    if (!parentComment) {
      reply.code(404).send({ error: 'Parent comment not found' })
      return
    }

    const { authorTerminalId, content, authorRole, metadata } = request.body
    if (!authorTerminalId || !content) {
      reply.code(400).send({ error: 'Missing required fields: authorTerminalId, content' })
      return
    }

    const comment = commentBoard.addComment({
      authorTerminalId,
      authorRole: authorRole ?? 'unknown',
      content,
      targetType: parentComment.targetType,
      targetId: parentComment.targetId,
      parentCommentId: parentComment.id,
      metadata,
    })

    reply.code(201).send(comment)
  })

  // GET /api/comments/:id — Get a comment and its reply thread
  app.get<{ Params: { id: string } }>('/api/comments/:id', async (request, reply) => {
    const thread = commentBoard.getCommentThread(request.params.id)
    if (thread.length === 0) {
      reply.code(404).send({ error: 'Comment not found' })
      return
    }
    reply.send(thread)
  })
}
