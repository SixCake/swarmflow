import { describe, it, expect, beforeEach } from 'vitest'
import { WorkerPool } from '../../src/worker/worker-pool.js'

describe('WorkerPool', () => {
  describe('constructor', () => {
    it('should create a pool with default max workers', () => {
      const pool = new WorkerPool()
      const stats = pool.getPoolStats()
      expect(stats.total).toBe(0) // workers not initialized yet
    })

    it('should accept custom max workers', () => {
      const pool = new WorkerPool(8)
      const stats = pool.getPoolStats()
      expect(stats.total).toBe(0) // workers not initialized yet
    })
  })

  describe('initialize', () => {
    it('should create workers up to maxWorkers', async () => {
      const pool = new WorkerPool(3)
      await pool.initialize({
        apiUrl: 'http://localhost:3000',
        agentToken: 'test-token',
        capabilities: ['analysis'],
        pollIntervalMs: 1000,
      })
      const stats = pool.getPoolStats()
      expect(stats.total).toBe(3)
    })
  })

  describe('startAll / stopAll', () => {
    it('should start all workers', async () => {
      const pool = new WorkerPool(2)
      await pool.initialize({
        apiUrl: 'http://localhost:3000',
        agentToken: 'test-token',
        capabilities: [],
        pollIntervalMs: 1000,
      })
      await pool.startAll()
      const stats = pool.getPoolStats()
      expect(stats.available).toBe(2)
    })

    it('should stop all workers', async () => {
      const pool = new WorkerPool(2)
      await pool.initialize({
        apiUrl: 'http://localhost:3000',
        agentToken: 'test-token',
        capabilities: [],
        pollIntervalMs: 1000,
      })
      await pool.startAll()
      pool.stopAll()
      const stats = pool.getPoolStats()
      expect(stats.available).toBe(0)
    })
  })

  describe('getPoolStats', () => {
    it('should return correct stats after initialization and start', async () => {
      const pool = new WorkerPool(4)
      await pool.initialize({
        apiUrl: 'http://localhost:3000',
        agentToken: 'test-token',
        capabilities: ['review'],
        pollIntervalMs: 500,
      })
      await pool.startAll()
      const stats = pool.getPoolStats()
      expect(stats.total).toBe(4)
      expect(stats.available).toBe(4)
      expect(stats.busy).toBe(0)
    })

    it('should reflect stopped workers', async () => {
      const pool = new WorkerPool(3)
      await pool.initialize({
        apiUrl: 'http://localhost:3000',
        agentToken: 'test-token',
        capabilities: [],
        pollIntervalMs: 1000,
      })
      await pool.startAll()
      pool.stopAll()
      const stats = pool.getPoolStats()
      expect(stats.total).toBe(3)
      expect(stats.available).toBe(0)
      expect(stats.busy).toBe(3)
    })
  })
})
