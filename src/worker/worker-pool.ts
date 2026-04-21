// Worker Pool management
// Spawns and manages Worker Threads

import { WorkerThread } from './worker-thread.js'
import type { WorkerConfig } from './worker-thread.js'

export class WorkerPool {
  private workers: WorkerThread[] = []
  private maxWorkers: number

  constructor(maxWorkers = 4) {
    this.maxWorkers = maxWorkers
  }

  async initialize(config: Omit<WorkerConfig, 'maxConcurrentTasks'>): Promise<void> {
    for (let i = 0; i < this.maxWorkers; i++) {
      const worker = new WorkerThread({
        ...config,
        maxConcurrentTasks: 1,
      })
      this.workers.push(worker)
    }
  }

  async startAll(): Promise<void> {
    await Promise.all(this.workers.map(w => w.start()))
  }

  stopAll(): void {
    this.workers.forEach(w => w.stop())
  }

  getPoolStats(): { total: number; available: number; busy: number } {
    const available = this.workers.filter(w => w.isAvailable()).length
    return {
      total: this.workers.length,
      available,
      busy: this.workers.length - available,
    }
  }
}
