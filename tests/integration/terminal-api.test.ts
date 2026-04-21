// Terminal registration API integration tests

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createApp } from '../../src/server/app.js'
import { MissionManager } from '../../src/core/mission-manager.js'
import { TaskBoard } from '../../src/core/task-board.js'
import { TerminalRegistry } from '../../src/server/middleware/auth.js'
import type { FastifyInstance } from 'fastify'

describe('Terminal API Integration Tests', () => {
  let app: FastifyInstance
  let terminalRegistry: TerminalRegistry

  beforeEach(async () => {
    terminalRegistry = new TerminalRegistry(3) // low limit for testing
    app = await createApp(
      {
        logger: false,
        auth: { token: 'test-global-token' },
      },
      {
        missionManager: new MissionManager(),
        taskBoard: new TaskBoard(),
        terminalRegistry,
      },
    )
  })

  afterEach(async () => {
    await app.close()
  })

  const globalAuth = { authorization: 'Bearer test-global-token' }

  // --- POST /api/terminals/register ---

  describe('POST /api/terminals/register', () => {
    it('should register a new terminal', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/terminals/register',
        headers: globalAuth,
        payload: { identityId: 'identity-1', capabilities: ['analysis'] },
      })
      expect(res.statusCode).toBe(201)
      const body = JSON.parse(res.body)
      expect(body.terminalId).toBeDefined()
      expect(body.identityId).toBe('identity-1')
      expect(body.apiKey).toMatch(/^sf-/)
      expect(body.capabilities).toEqual(['analysis'])
      expect(body.registeredAt).toBeDefined()
    })

    it('should reject missing identityId', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/terminals/register',
        headers: globalAuth,
        payload: {},
      })
      expect(res.statusCode).toBe(400)
    })

    it('should enforce per-identity terminal limit', async () => {
      // Register 3 terminals (the limit)
      for (let i = 0; i < 3; i++) {
        const res = await app.inject({
          method: 'POST',
          url: '/api/terminals/register',
          headers: globalAuth,
          payload: { identityId: 'identity-limited' },
        })
        expect(res.statusCode).toBe(201)
      }

      // 4th should fail
      const res = await app.inject({
        method: 'POST',
        url: '/api/terminals/register',
        headers: globalAuth,
        payload: { identityId: 'identity-limited' },
      })
      expect(res.statusCode).toBe(429)
    })
  })

  // --- GET /api/terminals/me ---

  describe('GET /api/terminals/me', () => {
    it('should return terminal identity when authenticated via API key', async () => {
      // Register a terminal first
      const regRes = await app.inject({
        method: 'POST',
        url: '/api/terminals/register',
        headers: globalAuth,
        payload: { identityId: 'identity-me' },
      })
      const { apiKey, terminalId } = JSON.parse(regRes.body)

      // Use terminal API key to get identity
      const res = await app.inject({
        method: 'GET',
        url: '/api/terminals/me',
        headers: { authorization: `Bearer ${apiKey}` },
      })
      expect(res.statusCode).toBe(200)
      const body = JSON.parse(res.body)
      expect(body.terminalId).toBe(terminalId)
      expect(body.identityId).toBe('identity-me')
      expect(body.isActive).toBe(true)
    })

    it('should return 401 for invalid API key', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/terminals/me',
        headers: { authorization: 'Bearer invalid-key' },
      })
      expect(res.statusCode).toBe(401)
    })
  })

  // --- POST /api/terminals/:id/rotate-key ---

  describe('POST /api/terminals/:id/rotate-key', () => {
    it('should rotate API key for a terminal', async () => {
      const regRes = await app.inject({
        method: 'POST',
        url: '/api/terminals/register',
        headers: globalAuth,
        payload: { identityId: 'identity-rotate' },
      })
      const { terminalId, apiKey: oldKey } = JSON.parse(regRes.body)

      const rotateRes = await app.inject({
        method: 'POST',
        url: `/api/terminals/${terminalId}/rotate-key`,
        headers: globalAuth,
      })
      expect(rotateRes.statusCode).toBe(200)
      const { apiKey: newKey } = JSON.parse(rotateRes.body)
      expect(newKey).toMatch(/^sf-/)
      expect(newKey).not.toBe(oldKey)

      // Old key should no longer work
      const oldKeyRes = await app.inject({
        method: 'GET',
        url: '/api/terminals/me',
        headers: { authorization: `Bearer ${oldKey}` },
      })
      expect(oldKeyRes.statusCode).toBe(401)

      // New key should work
      const newKeyRes = await app.inject({
        method: 'GET',
        url: '/api/terminals/me',
        headers: { authorization: `Bearer ${newKey}` },
      })
      expect(newKeyRes.statusCode).toBe(200)
    })

    it('should return 404 for non-existent terminal', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/terminals/non-existent/rotate-key',
        headers: globalAuth,
      })
      expect(res.statusCode).toBe(404)
    })
  })

  // --- DELETE /api/terminals/:id ---

  describe('DELETE /api/terminals/:id', () => {
    it('should deactivate a terminal', async () => {
      const regRes = await app.inject({
        method: 'POST',
        url: '/api/terminals/register',
        headers: globalAuth,
        payload: { identityId: 'identity-delete' },
      })
      const { terminalId, apiKey } = JSON.parse(regRes.body)

      const delRes = await app.inject({
        method: 'DELETE',
        url: `/api/terminals/${terminalId}`,
        headers: globalAuth,
      })
      expect(delRes.statusCode).toBe(200)
      expect(JSON.parse(delRes.body).success).toBe(true)

      // API key should no longer work
      const meRes = await app.inject({
        method: 'GET',
        url: '/api/terminals/me',
        headers: { authorization: `Bearer ${apiKey}` },
      })
      expect(meRes.statusCode).toBe(401)
    })

    it('should return 404 for non-existent terminal', async () => {
      const res = await app.inject({
        method: 'DELETE',
        url: '/api/terminals/non-existent',
        headers: globalAuth,
      })
      expect(res.statusCode).toBe(404)
    })
  })

  // --- GET /api/terminals ---

  describe('GET /api/terminals', () => {
    it('should list terminals for an identity', async () => {
      // Register 2 terminals for same identity
      await app.inject({
        method: 'POST',
        url: '/api/terminals/register',
        headers: globalAuth,
        payload: { identityId: 'identity-list' },
      })
      await app.inject({
        method: 'POST',
        url: '/api/terminals/register',
        headers: globalAuth,
        payload: { identityId: 'identity-list' },
      })

      const res = await app.inject({
        method: 'GET',
        url: '/api/terminals?identityId=identity-list',
        headers: globalAuth,
      })
      expect(res.statusCode).toBe(200)
      const body = JSON.parse(res.body)
      expect(Array.isArray(body)).toBe(true)
      expect(body).toHaveLength(2)
    })

    it('should return empty array for unknown identity', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/terminals?identityId=unknown',
        headers: globalAuth,
      })
      expect(res.statusCode).toBe(200)
      expect(JSON.parse(res.body)).toEqual([])
    })

    it('should return 400 when identityId is missing', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/terminals',
        headers: globalAuth,
      })
      expect(res.statusCode).toBe(400)
    })
  })

  // --- Dual-mode authentication ---

  describe('Dual-mode authentication', () => {
    it('should accept global token for all endpoints', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/tasks/available',
        headers: globalAuth,
      })
      expect(res.statusCode).toBe(200)
    })

    it('should accept terminal API key for all endpoints', async () => {
      const regRes = await app.inject({
        method: 'POST',
        url: '/api/terminals/register',
        headers: globalAuth,
        payload: { identityId: 'identity-dual' },
      })
      const { apiKey } = JSON.parse(regRes.body)

      const res = await app.inject({
        method: 'GET',
        url: '/api/tasks/available',
        headers: { authorization: `Bearer ${apiKey}` },
      })
      expect(res.statusCode).toBe(200)
    })

    it('should reject requests with no auth header', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/tasks/available',
      })
      expect(res.statusCode).toBe(401)
    })

    it('should reject requests with invalid token', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/tasks/available',
        headers: { authorization: 'Bearer totally-wrong' },
      })
      expect(res.statusCode).toBe(401)
    })

    it('health endpoint should not require auth', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/health',
      })
      expect(res.statusCode).toBe(200)
    })
  })
})
