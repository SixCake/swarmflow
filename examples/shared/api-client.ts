/**
 * SwarmFlow REST API Client
 *
 * Shared HTTP client for all example applications.
 * Wraps fetch calls to SwarmFlow REST API endpoints.
 */

import type { Mission } from '../../src/types/mission.types.js'
import type { Task } from '../../src/types/task.types.js'
import type { TaskResult } from '../../src/types/result.types.js'

export class SwarmFlowClient {
  private baseUrl: string
  private authToken?: string

  constructor(baseUrl: string, authToken?: string) {
    this.baseUrl = baseUrl.replace(/\/$/, '')
    this.authToken = authToken
  }

  private headers(hasBody: boolean): Record<string, string> {
    const h: Record<string, string> = {}
    if (hasBody) {
      h['Content-Type'] = 'application/json'
    }
    if (this.authToken) {
      h['Authorization'] = `Bearer ${this.authToken}`
    }
    return h
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const url = `${this.baseUrl}${path}`
    const res = await fetch(url, {
      method,
      headers: this.headers(body !== undefined),
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
    if (!res.ok) {
      const errorBody = await res.text()
      throw new Error(`${method} ${path} → ${res.status}: ${errorBody}`)
    }
    return res.json() as Promise<T>
  }

  // ─── Mission APIs ──────────────────────────────────────────

  async createMission(mission: Mission): Promise<{ mission: Mission; status: string }> {
    return this.request('POST', '/api/missions', mission)
  }

  async getMission(id: string): Promise<{ mission: Mission; status: string }> {
    return this.request('GET', `/api/missions/${id}`)
  }

  async listMissions(): Promise<{ mission: Mission; status: string }[]> {
    return this.request('GET', '/api/missions')
  }

  async updateMissionStatus(id: string, status: string): Promise<{ success: boolean }> {
    return this.request('PATCH', `/api/missions/${id}/status`, { status })
  }

  // ─── Task APIs ─────────────────────────────────────────────

  async publishTask(task: Task): Promise<{ success: boolean; taskId: string }> {
    return this.request('POST', '/api/tasks', task)
  }

  async getAvailableTasks(capabilities?: string[]): Promise<Task[]> {
    const query = capabilities ? `?capabilities=${capabilities.join(',')}` : ''
    return this.request('GET', `/api/tasks/available${query}`)
  }

  async claimTask(taskId: string, workerId: string): Promise<{ success: boolean; taskId: string }> {
    return this.request('POST', `/api/tasks/${taskId}/claim`, { workerId })
  }

  async submitTask(taskId: string, result: TaskResult): Promise<{ success: boolean; taskId: string }> {
    return this.request('POST', `/api/tasks/${taskId}/submit`, { result })
  }

  async verifyTask(taskId: string): Promise<{ success: boolean; taskId: string }> {
    return this.request('POST', `/api/tasks/${taskId}/verify`)
  }

  async getTask(taskId: string): Promise<Task> {
    return this.request('GET', `/api/tasks/${taskId}`)
  }

  // ─── Health ────────────────────────────────────────────────

  async health(): Promise<{ status: string; timestamp: string }> {
    return this.request('GET', '/health')
  }
}
