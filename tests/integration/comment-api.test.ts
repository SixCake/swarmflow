// Comment system API integration tests

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createApp } from '../../src/server/app.js'
import { MissionManager } from '../../src/core/mission-manager.js'
import { TaskBoard } from '../../src/core/task-board.js'
import { CommentBoard } from '../../src/core/comment-board.js'
import type { FastifyInstance } from 'fastify'

describe('Comment API Integration Tests', () => {
  let app: FastifyInstance
  let commentBoard: CommentBoard

  beforeEach(async () => {
    commentBoard = new CommentBoard()
    app = await createApp(
      { logger: false },
      {
        missionManager: new MissionManager(),
        taskBoard: new TaskBoard(),
        commentBoard,
      },
    )
  })

  afterEach(async () => {
    await app.close()
  })

  // --- POST /api/comments ---

  describe('POST /api/comments', () => {
    it('should create a task comment', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/comments',
        payload: {
          authorTerminalId: 'terminal-1',
          authorRole: 'analyst',
          content: 'This is a task comment',
          targetType: 'task',
          targetId: 'task-abc',
        },
      })
      expect(res.statusCode).toBe(201)
      const body = JSON.parse(res.body)
      expect(body.id).toBeDefined()
      expect(body.authorTerminalId).toBe('terminal-1')
      expect(body.content).toBe('This is a task comment')
      expect(body.targetType).toBe('task')
      expect(body.targetId).toBe('task-abc')
      expect(body.createdAt).toBeDefined()
    })

    it('should create a thread comment', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/comments',
        payload: {
          authorTerminalId: 'terminal-2',
          authorRole: 'moderator',
          content: 'Thread discussion point',
          targetType: 'thread',
          targetId: 'thread-xyz',
        },
      })
      expect(res.statusCode).toBe(201)
      expect(JSON.parse(res.body).targetType).toBe('thread')
    })

    it('should create a mission comment', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/comments',
        payload: {
          authorTerminalId: 'terminal-3',
          authorRole: 'coordinator',
          content: 'Mission-level discussion',
          targetType: 'mission',
          targetId: 'mission-001',
        },
      })
      expect(res.statusCode).toBe(201)
      expect(JSON.parse(res.body).targetType).toBe('mission')
    })

    it('should reject missing required fields', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/comments',
        payload: { content: 'No author' },
      })
      expect(res.statusCode).toBe(400)
    })

    it('should reject invalid targetType', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/comments',
        payload: {
          authorTerminalId: 'terminal-1',
          authorRole: 'analyst',
          content: 'Bad target',
          targetType: 'invalid',
          targetId: 'some-id',
        },
      })
      expect(res.statusCode).toBe(400)
    })

    it('should support optional metadata', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/comments',
        payload: {
          authorTerminalId: 'terminal-1',
          authorRole: 'analyst',
          content: 'With metadata',
          targetType: 'task',
          targetId: 'task-meta',
          metadata: { sentiment: 'positive', tags: ['important'] },
        },
      })
      expect(res.statusCode).toBe(201)
      const body = JSON.parse(res.body)
      expect(body.metadata).toEqual({ sentiment: 'positive', tags: ['important'] })
    })
  })

  // --- GET /api/tasks/:id/comments ---

  describe('GET /api/tasks/:id/comments', () => {
    it('should return comments for a task', async () => {
      // Create 2 comments for the same task
      await app.inject({
        method: 'POST',
        url: '/api/comments',
        payload: {
          authorTerminalId: 'terminal-1',
          authorRole: 'analyst',
          content: 'First comment',
          targetType: 'task',
          targetId: 'task-get',
        },
      })
      await app.inject({
        method: 'POST',
        url: '/api/comments',
        payload: {
          authorTerminalId: 'terminal-2',
          authorRole: 'reviewer',
          content: 'Second comment',
          targetType: 'task',
          targetId: 'task-get',
        },
      })

      const res = await app.inject({
        method: 'GET',
        url: '/api/tasks/task-get/comments',
      })
      expect(res.statusCode).toBe(200)
      const body = JSON.parse(res.body)
      expect(Array.isArray(body)).toBe(true)
      expect(body).toHaveLength(2)
      expect(body[0].content).toBe('First comment')
      expect(body[1].content).toBe('Second comment')
    })

    it('should return empty array for task with no comments', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/tasks/no-comments/comments',
      })
      expect(res.statusCode).toBe(200)
      expect(JSON.parse(res.body)).toEqual([])
    })
  })

  // --- GET /api/threads/:id/comments ---

  describe('GET /api/threads/:id/comments', () => {
    it('should return comments for a thread', async () => {
      await app.inject({
        method: 'POST',
        url: '/api/comments',
        payload: {
          authorTerminalId: 'terminal-1',
          authorRole: 'analyst',
          content: 'Thread comment',
          targetType: 'thread',
          targetId: 'thread-get',
        },
      })

      const res = await app.inject({
        method: 'GET',
        url: '/api/threads/thread-get/comments',
      })
      expect(res.statusCode).toBe(200)
      const body = JSON.parse(res.body)
      expect(body).toHaveLength(1)
      expect(body[0].targetType).toBe('thread')
    })
  })

  // --- GET /api/missions/:id/comments ---

  describe('GET /api/missions/:id/comments', () => {
    it('should return comments for a mission', async () => {
      await app.inject({
        method: 'POST',
        url: '/api/comments',
        payload: {
          authorTerminalId: 'terminal-1',
          authorRole: 'coordinator',
          content: 'Mission discussion',
          targetType: 'mission',
          targetId: 'mission-get',
        },
      })

      const res = await app.inject({
        method: 'GET',
        url: '/api/missions/mission-get/comments',
      })
      expect(res.statusCode).toBe(200)
      const body = JSON.parse(res.body)
      expect(body).toHaveLength(1)
      expect(body[0].targetType).toBe('mission')
    })
  })

  // --- POST /api/comments/:id/reply ---

  describe('POST /api/comments/:id/reply', () => {
    it('should reply to an existing comment', async () => {
      // Create parent comment
      const parentRes = await app.inject({
        method: 'POST',
        url: '/api/comments',
        payload: {
          authorTerminalId: 'terminal-1',
          authorRole: 'analyst',
          content: 'Parent comment',
          targetType: 'task',
          targetId: 'task-reply',
        },
      })
      const parentId = JSON.parse(parentRes.body).id

      // Reply to it
      const replyRes = await app.inject({
        method: 'POST',
        url: `/api/comments/${parentId}/reply`,
        payload: {
          authorTerminalId: 'terminal-2',
          authorRole: 'reviewer',
          content: 'This is a reply',
        },
      })
      expect(replyRes.statusCode).toBe(201)
      const reply = JSON.parse(replyRes.body)
      expect(reply.parentCommentId).toBe(parentId)
      expect(reply.content).toBe('This is a reply')
      expect(reply.targetType).toBe('task')
      expect(reply.targetId).toBe('task-reply')
    })

    it('should support nested replies', async () => {
      // Create parent
      const p1 = await app.inject({
        method: 'POST',
        url: '/api/comments',
        payload: {
          authorTerminalId: 'terminal-1',
          authorRole: 'analyst',
          content: 'Root',
          targetType: 'task',
          targetId: 'task-nested',
        },
      })
      const rootId = JSON.parse(p1.body).id

      // Reply to root
      const r1 = await app.inject({
        method: 'POST',
        url: `/api/comments/${rootId}/reply`,
        payload: {
          authorTerminalId: 'terminal-2',
          authorRole: 'reviewer',
          content: 'Reply 1',
        },
      })
      const reply1Id = JSON.parse(r1.body).id

      // Reply to reply
      const r2 = await app.inject({
        method: 'POST',
        url: `/api/comments/${reply1Id}/reply`,
        payload: {
          authorTerminalId: 'terminal-3',
          authorRole: 'analyst',
          content: 'Reply to reply',
        },
      })
      expect(r2.statusCode).toBe(201)
      expect(JSON.parse(r2.body).parentCommentId).toBe(reply1Id)

      // Verify thread structure via GET /api/comments/:id
      const threadRes = await app.inject({
        method: 'GET',
        url: `/api/comments/${rootId}`,
      })
      const thread = JSON.parse(threadRes.body)
      expect(thread).toHaveLength(3)
      expect(thread[0].content).toBe('Root')
      expect(thread[1].content).toBe('Reply 1')
      expect(thread[2].content).toBe('Reply to reply')
    })

    it('should return 404 for non-existent parent comment', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/comments/non-existent/reply',
        payload: {
          authorTerminalId: 'terminal-1',
          authorRole: 'analyst',
          content: 'Orphan reply',
        },
      })
      expect(res.statusCode).toBe(404)
    })

    it('should reject missing required fields in reply', async () => {
      // Create parent
      const parentRes = await app.inject({
        method: 'POST',
        url: '/api/comments',
        payload: {
          authorTerminalId: 'terminal-1',
          authorRole: 'analyst',
          content: 'Parent',
          targetType: 'task',
          targetId: 'task-bad-reply',
        },
      })
      const parentId = JSON.parse(parentRes.body).id

      const res = await app.inject({
        method: 'POST',
        url: `/api/comments/${parentId}/reply`,
        payload: { content: 'No author' },
      })
      expect(res.statusCode).toBe(400)
    })
  })

  // --- GET /api/comments/:id (thread) ---

  describe('GET /api/comments/:id', () => {
    it('should return comment thread', async () => {
      const parentRes = await app.inject({
        method: 'POST',
        url: '/api/comments',
        payload: {
          authorTerminalId: 'terminal-1',
          authorRole: 'analyst',
          content: 'Thread root',
          targetType: 'task',
          targetId: 'task-thread',
        },
      })
      const parentId = JSON.parse(parentRes.body).id

      const res = await app.inject({
        method: 'GET',
        url: `/api/comments/${parentId}`,
      })
      expect(res.statusCode).toBe(200)
      const body = JSON.parse(res.body)
      expect(body).toHaveLength(1)
      expect(body[0].id).toBe(parentId)
    })

    it('should return 404 for non-existent comment', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/comments/non-existent',
      })
      expect(res.statusCode).toBe(404)
    })
  })
})
