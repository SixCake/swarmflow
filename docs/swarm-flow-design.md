# SwarmFlow 设计文档

> **实现细节补充**：本文档引用的类型定义和函数实现详情请参考 [实现细节补充文档](./swarm-flow-design-implementation.md)

## 一、概述

### 1.1 定位

SwarmFlow 是一个**通用的分布式 AI Agent 任务编排框架**，基于 Mastra 的 Agent 定义与执行能力，实现大规模 Agent 协同任务的高效编排与智能聚合。

**核心价值主张**：
- **通用框架**：不绑定特定业务场景，适用于任何需要大规模 Agent 协同的场景
- **Mastra 原生**：深度集成 Mastra Agent 生态，无缝支持现有 Agent 能力
- **智能聚合**：通过信息素机制和收敛策略，将分散的 Agent 输出聚合成高质量结果
- **轻量中枢**：中枢侧 token 消耗优化至最低，将智能下沉到终端

### 1.2 核心特征

| 特征 | 说明 | Mastra 原生 |
|------|------|------------|
| 分布式任务编排 | 通过 TaskBoard 将任务分发给数千个终端 Agent | ✅ |
| 信息素机制 | Agent 通过 AggregationDigest 感知全局，而非读所有人原文 | ✅ |
| 智能收敛 | 自动检测讨论收敛，避免无限循环 | ✅ |
| 引导信号 | 中枢通过引导信号间接影响讨论方向 | ✅ |
| 结构化输出 | 强制终端输出结构化数据，降低中枢处理成本 | ✅ |
| 安全防护 | UUID、鉴权、限流、脱敏、水印等多层防护 | ✅ |
| 泛化架构 | 不依赖特定业务领域，支持任意 Agent 协同场景 | ✅ |

### 1.3 示例应用

| 应用场景 | Mission 类型 | Agent 数量 | 核心价值 |
|---------|------------|-----------|---------|
| Quick Start | 简单任务测试 | 10-50 | 快速验证框架能力 |
| Code Review | 代码评审 | 100-500 | 多视角代码质量评估 |
| Product Evaluation | 产品评测 | 1000+ | 大规模用户反馈聚合 |

---

## 二、整体架构

### 2.1 三层架构

```
┌─────────────────────────────────────────────────────────────┐
│                  Layer 3: Mission Layer                      │
│                                                              │
│  - Mission 定义（目标、约束、阶段）                           │
│  - 任务编排策略（DAG 引擎）                                  │
│  - 收敛判断逻辑                                               │
│  - 引导信号生成                                               │
│  - 结果聚合与报告生成                                         │
│                                                              │
├─────────────────────────────────────────────────────────────┤
│                  Layer 2: Cortex Layer                       │
│                                                              │
│  - TaskBoard（任务队列管理）                                  │
│  - 信息素浓缩（AggregationDigest 生成）                       │
│  - 立场聚类（观点分组）                                       │
│  - 讨论地图维护                                               │
│  - 引导信号检测与响应                                         │
│                                                              │
├─────────────────────────────────────────────────────────────┤
│                  Mastra Agent Framework                       │
│                                                              │
│  - Agent 定义（AgentBlueprint）                               │
│  - Agent 执行（MastraExecutor）                              │
│  - Agent 能力声明                                             │
│                                                              │
├─────────────────────────────────────────────────────────────┤
│                  Layer 1: TaskBoard Layer                    │
│                                                              │
│  - 任务发布 API                                               │
│  - 任务领取 API                                               │
│  - 结果提交 API                                               │
│  - 状态查询 API                                               │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 核心概念映射

| RealComment 概念 | SwarmFlow 泛化概念 | 说明 |
|----------------|-------------------|------|
| DiscussionThread | InteractionThread | 泛化为通用交互线程 |
| DiscussionDigest | AggregationDigest | 泛化为通用聚合摘要 |
| DiscussionMap | InteractionMap | 泛化为通用交互地图 |
| DiscussionPhase | InteractionPhase | 泛化为通用交互阶段 |
| DiscussionRound | InteractionRound | 泛化为通用交互轮次 |

---

## 三、核心数据结构

### 3.1 Mission

```typescript
interface Mission {
  missionId: string                    // UUID
  name: string
  description: string
  createdAt: Date
  createdBy: string                    // 创建者 ID
  
  // 目标定义
  objective: {
    primaryGoal: string                // 主要目标
    successCriteria: string[]          // 成功标准
    constraints?: Record<string, any>  // 约束条件
  }
  
  // 任务配置
  taskConfig: {
    taskType: TaskType                 // 任务类型
    maxAgents: number                  // 最大 Agent 数量
    minAgents: number                  // 最小 Agent 数量
    taskTimeout: number                // 任务超时（秒）
    retryPolicy: RetryPolicy
  }
  
  // 阶段配置
  phases: InteractionPhase[]
  
  // 收敛策略
  convergencePolicy: ConvergencePolicy
  
  // 引导策略
  guidancePolicy: GuidancePolicy
  
  // 状态
  status: MissionStatus
  currentPhaseIndex: number
  startedAt?: Date
  completedAt?: Date
}
```

### 3.2 AgentBlueprint

```typescript
interface AgentBlueprint {
  agent: Agent                         // Mastra Agent 实例
  role: string                        // 角色描述
  capabilities?: string[]             // 能力声明（可选）
}

// Mastra Agent 接口（简化）
interface Agent {
  id: string
  name: string
  description: string
  execute: (input: AgentInput) => Promise<AgentOutput>
}
```

### 3.3 Task

```typescript
interface Task {
  taskId: string                      // UUID
  missionId: string
  phaseId: string
  taskType: TaskType
  
  // 任务内容
  instructions: string                // 任务指令
  context: Record<string, any>        // 任务上下文（已脱敏）
  
  // 分配信息
  assignedTo?: string                 // 分配给的终端 ID
  claimedAt?: Date
  timeoutAt?: Date
  
  // 执行信息
  attempts: number                    // 尝试次数
  lastAttemptAt?: Date
  
  // 状态
  status: TaskStatus
  result?: ResultMetadata
  createdAt: Date
  completedAt?: Date
}
```

### 3.4 Terminal

```typescript
interface Terminal {
  terminalId: string                  // UUID
  ownerUserId: string                 // 终端所有者（人类）
  apiKey: string                      // API 密钥
  capabilities: string[]              // 声明的能力
  registeredAt: Date
  lastActiveAt: Date
  creditScore: number                 // 信用分
  status: 'active' | 'suspended' | 'banned'
}
```

### 3.5 ResultMetadata

```typescript
interface ResultMetadata {
  taskId: string
  terminalId: string
  agentId: string
  phaseId: string
  
  // 输出内容
  output: {
    content: string                   // 主要输出
    stance?: string                   // 立场（从 output.stance 提取）
    confidence: number                // 信心度（0-1）
    reasoning?: string                // 推理过程
    tags?: string[]                   // 标签
    customFields?: Record<string, any> // 自定义字段
  }
  
  // 元数据
  metadata: {
    agentFramework: 'mastra'          // Agent 框架标识
    custom?: Record<string, any>      // 自定义元数据
    executionTime: number             // 执行耗时（毫秒）
    modelUsed?: string                // 使用的模型
    tokenUsed?: number                // Token 消耗
  }
  
  submittedAt: Date
}
```

### 3.6 InteractionThread

```typescript
interface InteractionThread {
  threadId: string                    // UUID
  missionId: string
  phaseId: string
  
  // 交互轮次
  rounds: InteractionRound[]
  
  // 聚合摘要（信息素）
  aggregationDigest: AggregationDigest
  
  // 讨论地图
  interactionMap?: InteractionMap
  
  // 状态
  status: 'active' | 'converged' | 'aborted'
  createdAt: Date
  updatedAt: Date
}
```

### 3.7 ConvergencePolicy

```typescript
interface ConvergencePolicy {
  // 收敛条件
  conditions: {
    maxRounds: number                 // 最大轮次
    minRounds: number                 // 最小轮次
    stabilityThreshold: number        // 稳定性阈值（0-1）
    consensusThreshold: number        // 共识阈值（0-1）
    stagnationRounds: number          // 停滞轮次阈值
  }
  
  // 收敛检测策略
  strategy: 'consensus' | 'stability' | 'hybrid'
  
  // 泛化注释：收敛策略可根据具体场景定制
  // - consensus：基于共识度（如立场分布）
  // - stability：基于稳定性（如输出变化率）
  // - hybrid：结合多种指标
}
```

### 3.8 AggregationDigest

```typescript
interface AggregationDigest {
  digestId: string                    // UUID
  missionId: string
  phaseId: string
  roundIndex: number
  
  // 统计摘要
  statistics: {
    totalResults: number
    completedResults: number
    pendingResults: number
    averageConfidence: number
    stanceDistribution: Record<string, number>
  }
  
  // 关键观点（信息素浓缩）
  keyInsights: {
    stance: string
    count: number
    representativeOutput: string
    confidence: number
  }[]
  
  // 冲突点
  conflicts: {
    topic: string
    stances: string[]
    intensity: number                 // 冲突强度（0-1）
  }[]
  
  // 引导建议
  guidanceSuggestions?: {
    type: 'devil_advocate' | 'focus_topic' | 'clarify分歧'
    topic: string
    priority: number
  }[]
  
  generatedAt: Date
}
```

---

## 四、工作流程

### 4.1 Mission 执行流程

```
1. Mission 创建
   ↓
2. DAG 引擎生成任务图
   ↓
3. 阶段 0：独立发表
   - TaskBoard 发布任务
   - 终端 Agent 领取并执行
   - 提交结果到 TaskBoard
   ↓
4. Cortex 生成 AggregationDigest
   - 立场聚类
   - 信息素浓缩
   - 冲突检测
   ↓
5. 收敛判断
   - 未收敛 → 进入下一轮
   - 已收敛 → 进入下一阶段
   ↓
6. 阶段 1-N：讨论/深化
   - TaskBoard 发布任务（带 AggregationDigest）
   - 终端 Agent 基于信息素调整输出
   - 提交结果
   ↓
7. Cortex 更新 AggregationDigest
   - 检测引导信号
   - 生成引导信号（如需要）
   ↓
8. 重复 5-7 直到收敛
   ↓
9. 最终阶段：聚合报告
   - Cortex 生成最终 AggregationDigest
   - Mission Layer 生成报告
   ↓
10. Mission 完成
```

### 4.2 TaskBoard 任务生命周期

```
任务状态流转：

pending → claimed → submitted
   ↓         ↓         ↓
timeout  failed  completed
   ↓         ↓         ↓
retry → pending → pending
```

### 4.3 信息素浓缩流程

```
原始结果（N 个）
    ↓
立场提取（从 output.stance）
    ↓
立场聚类（相似立场分组）
    ↓
每组选取代表性输出
    ↓
检测冲突点
    ↓
生成 AggregationDigest（信息素）
    ↓
下发到下一轮任务
```

---

## 五、核心组件设计

### 5.1 TaskBoard

```typescript
class TaskBoard {
  // 发布任务
  publishTask(task: Task): Promise<void>
  
  // 领取任务
  claimTask(terminalId: string): Promise<Task | null>
  
  // 提交结果
  submitResult(taskId: string, result: ResultMetadata): Promise<void>
  
  // 查询可用任务
  getAvailableTasks(terminalId: string): Promise<Task[]>
  
  // 查询任务状态
  getTaskStatus(taskId: string): Promise<TaskStatus>
  
  // 超时重分配
  handleTimeout(): Promise<void>
}
```

### 5.2 Cortex（信息素浓缩器）

```typescript
class Cortex {
  // 生成 AggregationDigest
  generateAggregationDigest(
    missionId: string,
    phaseId: string,
    roundIndex: number
  ): Promise<AggregationDigest>
  
  // 立场聚类
  clusterStances(results: ResultMetadata[]): Promise<StanceCluster[]>
  
  // 信息素浓缩
  condensePheromones(clusters: StanceCluster[]): Promise<KeyInsight[]>
  
  // 检测冲突
  detectConflicts(insights: KeyInsight[]): Promise<Conflict[]>
  
  // 检测引导信号
  detectGuidanceSignals(digest: AggregationDigest): Promise<GuidanceSignal[]>
  
  // 生成引导信号
  generateGuidanceSignal(signal: GuidanceSignal): Promise<Task>
}
```

### 5.3 DAG 引擎

```typescript
class DAGEngine {
  // 基于 Mission 配置生成任务图
  generateTaskGraph(mission: Mission): DAG
  
  // 执行任务图
  executeDAG(dag: DAG): Promise<void>
  
  // 处理任务完成
  handleTaskComplete(task: Task, result: ResultMetadata): Promise<void>
  
  // 处理任务失败
  handleTaskFailed(task: Task, error: Error): Promise<void>
  
  // 检测 DAG 完成条件
  checkDAGCompletion(dag: DAG): Promise<boolean>
}

// DAG 节点类型
interface DAGNode {
  nodeId: string
  missionId: string
  phaseId: string
  taskType: TaskType
  dependencies: string[]              // 依赖的节点 ID
  status: 'pending' | 'running' | 'completed' | 'failed'
}

// 变量名已同步：InteractionThread, InteractionRound
interface DAGContext {
  interactionThread: InteractionThread
  currentRound: InteractionRound
  aggregationDigest: AggregationDigest
}
```

---

## 六、Worker 设计

### 6.1 终端 Worker 架构

```
┌─────────────────────────────────────────────────────────────┐
│                    终端 Worker                               │
│                                                              │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐  │
│  │  任务轮询器   │ →  │  任务队列     │ →  │  任务执行器   │  │
│  │  TaskPoller  │    │  TaskQueue   │    │  TaskRunner  │  │
│  └──────────────┘    └──────────────┘    └──────────────┘  │
│                                              ↓               │
│                                      ┌──────────────┐       │
│                                      │MastraExecutor│       │
│                                      └──────────────┘       │
│                                              ↓               │
│                                      ┌──────────────┐       │
│                                      │ 结果提交器    │       │
│                                      │ResultSubmitter│      │
│                                      └──────────────┘       │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### 6.2 MastraExecutor

```typescript
class MastraExecutor {
  private agentBlueprint: AgentBlueprint
  
  constructor(agentBlueprint: AgentBlueprint) {
    this.agentBlueprint = agentBlueprint
  }
  
  // 执行任务
  async execute(task: Task, aggregationDigest?: AggregationDigest): Promise<ResultMetadata> {
    // 1. 解析任务指令
    const parsedInput = this.parseTaskInput(task, aggregationDigest)
    
    // 2. 调用 Mastra Agent
    const agentOutput = await this.agentBlueprint.agent.execute(parsedInput)
    
    // 3. 提取立场（从 output.stance）
    const stance = this.extractStance(agentOutput)
    
    // 4. 构建 ResultMetadata
    const result: ResultMetadata = {
      taskId: task.taskId,
      terminalId: this.getTerminalId(),
      agentId: this.agentBlueprint.agent.id,
      phaseId: task.phaseId,
      output: {
        content: agentOutput.content,
        stance: stance,
        confidence: agentOutput.confidence || 0.8,
        reasoning: agentOutput.reasoning,
        tags: agentOutput.tags,
        customFields: agentOutput.customFields
      },
      metadata: {
        agentFramework: 'mastra',
        custom: this.extractCustomMetadata(agentOutput),
        executionTime: Date.now() - task.claimedAt!.getTime(),
        modelUsed: agentOutput.modelUsed,
        tokenUsed: agentOutput.tokenUsed
      },
      submittedAt: new Date()
    }
    
    return result
  }
  
  // 解析任务输入
  private parseTaskInput(task: Task, aggregationDigest?: AggregationDigest): AgentInput {
    return {
      instructions: task.instructions,
      context: task.context,
      aggregationDigest: aggregationDigest  // 信息素作为额外上下文
    }
  }
  
  // 提取立场
  private extractStance(output: AgentOutput): string {
    // 从 output.stance 提取，如果没有则推断
    return output.stance || this.inferStance(output.content)
  }
  
  // 推断立场（备用逻辑）
  private inferStance(content: string): string {
    // 使用关键词匹配和情感分析推断立场
    // 详细实现请参考：swarm-flow-design-implementation.md
    const lowerContent = content.toLowerCase()

    // 正面关键词
    const positiveKeywords = [
      '支持', '赞同', '同意', '优秀', '好', '推荐', '应该',
      '合理', '正确', '有价值', '有效', '成功', '优点', '优势'
    ]

    // 负面关键词
    const negativeKeywords = [
      '反对', '不赞同', '不同意', '差', '不好', '不推荐', '不应该',
      '不合理', '错误', '无价值', '无效', '失败', '缺点', '劣势',
      '问题', '风险', '担忧', '质疑', '怀疑'
    ]

    // 计算关键词出现次数
    let positiveCount = 0
    let negativeCount = 0

    for (const keyword of positiveKeywords) {
      const regex = new RegExp(keyword, 'g')
      const matches = lowerContent.match(regex)
      if (matches) positiveCount += matches.length
    }

    for (const keyword of negativeKeywords) {
      const regex = new RegExp(keyword, 'g')
      const matches = lowerContent.match(regex)
      if (matches) negativeCount += matches.length
    }

    // 判断立场
    if (positiveCount > negativeCount * 1.5) {
      return 'positive'
    } else if (negativeCount > positiveCount * 1.5) {
      return 'negative'
    } else {
      return 'neutral'
    }
  }
  
  // 提取自定义元数据
  private extractCustomMetadata(output: AgentOutput): Record<string, any> {
    return output.customMetadata || {}
  }
  
  // 获取终端 ID
  private getTerminalId(): string {
    return process.env.TERMINAL_ID || 'unknown'
  }
}
```

---

## 七、关键算法

### 7.1 立场聚类算法

```typescript
async function clusterStances(
  results: ResultMetadata[],
  similarityThreshold: number = 0.7
): Promise<StanceCluster[]> {
  // 1. 提取所有立场
  const stances = results.map(r => r.output.stance).filter(Boolean)
  
  // 2. 计算相似度矩阵
  const similarityMatrix = computeSimilarityMatrix(stances)
  
  // 3. 层次聚类
  const clusters = hierarchicalClustering(
    similarityMatrix,
    similarityThreshold
  )
  
  // 4. 为每个聚类选取代表性输出
  return clusters.map(cluster => {
    const clusterResults = results.filter(r => 
      cluster.includes(r.output.stance!)
    )
    
    return {
      stance: findCentroid(cluster),
      count: clusterResults.length,
      representativeOutput: selectRepresentative(clusterResults),
      confidence: averageConfidence(clusterResults)
    }
  })
}
```

### 7.2 收敛判断算法

```typescript
async function checkConvergence(
  thread: InteractionThread,
  policy: ConvergencePolicy
): Promise<boolean> {
  const { rounds, aggregationDigest } = thread
  const currentRound = rounds[rounds.length - 1]
  
  // 1. 检查最大轮次
  if (rounds.length >= policy.conditions.maxRounds) {
    return true
  }
  
  // 2. 检查最小轮次
  if (rounds.length < policy.conditions.minRounds) {
    return false
  }
  
  // 3. 根据策略判断
  switch (policy.strategy) {
    case 'consensus':
      return checkConsensus(aggregationDigest, policy.conditions.consensusThreshold)
    
    case 'stability':
      return checkStability(thread, policy.conditions.stabilityThreshold)
    
    case 'hybrid':
      const consensusReached = checkConsensus(
        aggregationDigest,
        policy.conditions.consensusThreshold
      )
      const stabilityReached = checkStability(
        thread,
        policy.conditions.stabilityThreshold
      )
      return consensusReached && stabilityReached
  }
}

function checkConsensus(
  digest: AggregationDigest,
  threshold: number
): boolean {
  // 检查最大立场占比是否超过阈值
  const maxStanceRatio = Math.max(
    ...Object.values(digest.statistics.stanceDistribution)
  )
  return maxStanceRatio >= threshold
}

function checkStability(
  thread: InteractionThread,
  threshold: number
): boolean {
  // 检查最近 N 轮的立场分布变化率
  const recentRounds = thread.rounds.slice(-3)
  if (recentRounds.length < 2) return false
  
  const distributionChange = computeDistributionChange(recentRounds)
  return distributionChange <= threshold
}
```

---

## 八、API 设计

### 8.1 TaskBoard API

#### 发布任务
```http
POST /api/tasks
Authorization: Bearer {apiKey}
Content-Type: application/json

{
  "missionId": "uuid",
  "phaseId": "uuid",
  "taskType": "independent_opinion",
  "instructions": "请分析...",
  "context": { ... }
}

Response 201:
{
  "taskId": "uuid",
  "status": "pending"
}
```

#### 领取任务
```http
GET /api/tasks/available
Authorization: Bearer {apiKey}

Response 200:
{
  "tasks": [
    {
      "taskId": "uuid",
      "instructions": "...",
      "context": { ... },
      "timeoutAt": "2026-04-21T18:35:00Z"
    }
  ]
}
```

#### 提交结果
```http
POST /api/tasks/{taskId}/submit
Authorization: Bearer {apiKey}
Content-Type: application/json

{
  "output": {
    "content": "分析结果...",
    "stance": "positive",
    "confidence": 0.85,
    "reasoning": "...",
    "tags": ["quality", "performance"]
  },
  "metadata": {
    "agentFramework": "mastra",
    "custom": { ... },
    "executionTime": 1234,
    "modelUsed": "gpt-4",
    "tokenUsed": 1500
  }
}

Response 200:
{
  "taskId": "uuid",
  "status": "completed"
}
```

### 8.2 Cortex API

#### 获取 AggregationDigest
```http
GET /api/missions/{missionId}/phases/{phaseId}/digest
Authorization: Bearer {apiKey}

Response 200:
{
  "digestId": "uuid",
  "statistics": { ... },
  "keyInsights": [ ... ],
  "conflicts": [ ... ],
  "guidanceSuggestions": [ ... ]
}
```

---

## 九、性能优化

### 9.1 Token 消耗优化

| 环节 | 是否需要 LLM | 未优化 Token | 优化后 Token |
|------|-------------|-------------|-------------|
| Mission 创建 | ❌ | 0 | 0 |
| 信息素浓缩 | ⚠️ 可选 | 200 万 | **0**（结构化聚合） |
| 立场聚类 | ❌ | 0 | 0 |
| 收敛判断 | ❌ | 0 | 0 |
| 引导信号检测 | ❌ | 0 | 0 |
| 引导信号生成 | ⚠️ 偶尔 | 2 万 | 0.5 万（模板为主） |
| 交互地图更新 | ⚠️ 可选 | 10 万 | **0**（结构化合并） |
| 报告生成 | ⚠️ 必须 | 200 万 | **1.5 万**（分层策略） |
| 报告修正 | ⚠️ 必须 | 5 万 | 3 万 |
| **合计** | | **~417 万** | **~5 万** ✅ |

> 💡 通过结构化输出 + 分层聚合，中枢侧 token 消耗从 **417 万降至 5 万**，降幅 **98.8%**。

### 9.2 并发优化

```typescript
// 任务批量发布
async function publishTasksBatch(
  mission: Mission,
  batchSize: number = 100
): Promise<void> {
  const tasks = generateTasks(mission)
  
  // 分批发布
  for (let i = 0; i < tasks.length; i += batchSize) {
    const batch = tasks.slice(i, i + batchSize)
    await Promise.all(batch.map(task => TaskBoard.publishTask(task)))
  }
}

// 结果批量处理
async function processResultsBatch(
  results: ResultMetadata[],
  batchSize: number = 50
): Promise<void> {
  for (let i = 0; i < results.length; i += batchSize) {
    const batch = results.slice(i, i + batchSize)
    await Promise.all(batch.map(result => processResult(result)))
  }
}
```

---

## 十、聚合与报告

### 10.1 AggregationDigest（泛化）

```typescript
interface AggregationDigest {
  digestId: string
  missionId: string
  phaseId: string
  roundIndex: number
  
  // 统计摘要
  statistics: {
    totalResults: number
    completedResults: number
    pendingResults: number
    averageConfidence: number
    stanceDistribution: Record<string, number>
  }
  
  // 关键观点（信息素浓缩）
  keyInsights: {
    stance: string
    count: number
    representativeOutput: string
    confidence: number
  }[]
  
  // 冲突点
  conflicts: {
    topic: string
    stances: string[]
    intensity: number
  }[]
  
  // 引导建议
  guidanceSuggestions?: {
    type: 'devil_advocate' | 'focus_topic' | 'clarify分歧'
    topic: string
    priority: number
  }[]
  
  generatedAt: Date
}
```

### 10.2 立场聚类

```typescript
// 从 output.stance 提取立场
function extractStance(result: ResultMetadata): string {
  return result.output.stance || inferStance(result.output.content)
}

// 推断立场（备用）
function inferStance(content: string): string {
  // 使用关键词匹配和情感分析推断立场
  // 详细实现请参考：swarm-flow-design-implementation.md
  const lowerContent = content.toLowerCase()

  // 正面关键词
  const positiveKeywords = [
    '支持', '赞同', '同意', '优秀', '好', '推荐', '应该',
    '合理', '正确', '有价值', '有效', '成功', '优点', '优势'
  ]

  // 负面关键词
  const negativeKeywords = [
    '反对', '不赞同', '不同意', '差', '不好', '不推荐', '不应该',
    '不合理', '错误', '无价值', '无效', '失败', '缺点', '劣势',
    '问题', '风险', '担忧', '质疑', '怀疑'
  ]

  // 计算关键词出现次数
  let positiveCount = 0
  let negativeCount = 0

  for (const keyword of positiveKeywords) {
    const regex = new RegExp(keyword, 'g')
    const matches = lowerContent.match(regex)
    if (matches) positiveCount += matches.length
  }

  for (const keyword of negativeKeywords) {
    const regex = new RegExp(keyword, 'g')
    const matches = lowerContent.match(regex)
    if (matches) negativeCount += matches.length
  }

  // 判断立场
  if (positiveCount > negativeCount * 1.5) {
    return 'positive'
  } else if (negativeCount > positiveCount * 1.5) {
    return 'negative'
  } else {
    return 'neutral'
  }
}
```

### 10.3 报告生成策略

```typescript
async function generateReport(
  mission: Mission,
  finalDigest: AggregationDigest
): Promise<Report> {
  // 分层聚合策略
  const layers = [
    // Layer 1: 统计摘要（无需 LLM）
    generateStatisticsSummary(finalDigest),
    
    // Layer 2: 关键观点提取（无需 LLM）
    extractKeyInsights(finalDigest),
    
    // Layer 3: 冲突分析（无需 LLM）
    analyzeConflicts(finalDigest),
    
    // Layer 4: 引导信号总结（轻量 LLM）
    summarizeGuidanceSignals(finalDigest),
    
    // Layer 5: 最终报告（轻量 LLM）
    generateFinalReport(mission, finalDigest)
  ]
  
  return {
    missionId: mission.missionId,
    layers: layers,
    generatedAt: new Date()
  }
}
```

---

## 十一、安全架构设计

### 11.1 威胁模型

```
攻击面分析：

┌─────────────────────────────────────────────────────────────┐
│                    中枢服务（云端）                            │
│                                                              │
│  威胁 1: API 未鉴权 → 任意访问任务/结果                       │
│  威胁 2: IDOR → 遍历 ID 批量爬取任务上下文                    │
│  威胁 3: 无限注册 → 虚假终端刷量                              │
│  威胁 4: 任务上下文泄露 → 敏感信息暴露                        │
│  威胁 5: 结果投毒 → 恶意终端提交虚假/有害内容                 │
│  威胁 6: DDoS → 大量请求压垮 TaskBoard                       │
│                                                              │
├──────────────────────┬──────────────────────────────────────┤
│      REST API        │                                      │
├──────────────────────┘                                      │
│                                                              │
│  威胁 7: 中间人攻击 → 截获任务内容和结果                      │
│  威胁 8: 令牌泄露 → 冒充合法终端                              │
│                                                              │
├─────────────────────────────────────────────────────────────┤
│                    终端（个人电脑）                            │
│                                                              │
│  威胁 9: 提示词注入 → 任务指令中嵌入恶意 prompt               │
│  威胁 10: 数据外泄 → 终端将任务上下文泄露给第三方             │
│  威胁 11: 逆向工程 → 通过任务上下文推断 Mission 全貌          │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### 11.2 安全设计方案

#### A. 身份认证与授权

```typescript
interface TerminalIdentity {
  terminalId: string                    // UUID（不可预测，防 IDOR）
  ownerUserId: string                   // 终端所有者（人类）
  apiKey: string                        // API 密钥（注册时生成，可轮换）
  capabilities: string[]                // 声明的能力
  registeredAt: Date
  lastActiveAt: Date
  creditScore: number                   // 信用分
  status: 'active' | 'suspended' | 'banned'
}

// 注册流程：人类认领制（防止无限注册）
interface TerminalRegistration {
  maxTerminalsPerUser: number           // 每人最多注册终端数（默认 5）
  requireEmailVerification: boolean     // 注册需邮箱验证
  requireHumanCaptcha: boolean          // 注册需人机验证
}
```

#### B. API 安全

```typescript
interface APISecurityConfig {
  authentication: {
    type: 'bearer'
    required: true                      // 所有端点强制鉴权
  }
  
  rateLimiting: {
    global: {
      requestsPerMinute: 60
      requestsPerHour: 1000
    }
    perEndpoint: {
      'GET /tasks/available': { rpm: 10 }
      'POST /tasks/{id}/claim': { rpm: 5 }
      'POST /tasks/{id}/submit': { rpm: 3 }
      'POST /terminals/register': { rph: 5 }
    }
  }
  
  transport: {
    enforceHTTPS: true
    tlsMinVersion: '1.2'
    hsts: true
  }
}
```

#### C. 任务上下文安全

```typescript
interface ContextSecurityPolicy {
  sanitization: {
    removePersonalInfo: boolean
    removeApiKeys: boolean
    removeInternalUrls: boolean
    maxContextSizeBytes: number
  }
  
  minimumPrivilege: {
    hideOtherTerminalIds: boolean
    hideRawResults: boolean
    hideMissionConfig: boolean
  }
  
  watermarking: {
    enabled: boolean
    method: 'unicode_steganography'
  }
}
```

#### D. 提示词注入防护

```typescript
interface PromptInjectionDefense {
  inputValidation: {
    patterns: [
      'ignore previous instructions',
      'system prompt',
      'you are now',
      'disregard all',
      'override your'
    ]
    action: 'flag_and_review'
  }
  
  instructionIsolation: {
    systemPrefix: '你是 SwarmFlow 任务执行者。以下是你的任务，请严格按要求输出。'
    contextDelimiter: '===USER_CONTEXT_START=== ... ===USER_CONTEXT_END==='
    enforceStructuredOutput: true
  }
  
  outputSanitization: {
    checkForApiKeys: boolean
    checkForCredentials: boolean
    checkForInternalPaths: boolean
    checkForCodeExecution: boolean
    action: 'reject_and_flag'
  }
}
```

#### E. 结果投毒防护

```typescript
interface AntiPoisoningPolicy {
  crossValidation: {
    enabled: boolean
    redundancyFactor: number
    agreementThreshold: number
    applyToPhases: PhaseType[]
  }
  
  anomalyDetection: {
    stanceOutlierThreshold: number
    confidenceOutlierThreshold: number
    action: 'flag_for_meta_review'
  }
  
  sybilDetection: {
    sameOwnerCorrelationThreshold: number
    sameSubnetCorrelationThreshold: number
    action: 'reduce_weight'
  }
}
```

#### F. 审计与可追溯性

```typescript
interface AuditConfig {
  logging: {
    logAllApiCalls: boolean
    logAllTaskTransitions: boolean
    logAllResultSubmissions: boolean
    retentionDays: number
  }
  
  eventSourcing: {
    enabled: boolean
  }
  
  alerting: {
    highRejectionRate: { threshold: 0.5, window: '1h' }
    suspiciousRegistration: { threshold: 10, window: '1h' }
    apiAbuseDetected: { threshold: 100, window: '1m' }
    possibleDataLeak: { triggerOn: 'watermark_detected_externally' }
  }
}
```

### 11.3 安全设计检查清单

| # | 检查项 | SwarmFlow 对策 | 状态 |
|---|--------|---------------|------|
| 1 | 所有 API 端点强制鉴权 | Bearer Token + 强制鉴权 | ✅ 已设计 |
| 2 | 使用 UUID 替代自增 ID | 全部使用 UUID | ✅ 已设计 |
| 3 | 终端注册需人类认领 | 人类认领制 + 每人限额 | ✅ 已设计 |
| 4 | API 多层速率限制 | 全局 + 端点级限流 | ✅ 已设计 |
| 5 | 任务上下文脱敏 | 自动脱敏 + 最小权限 | ✅ 已设计 |
| 6 | 上下文水印追溯 | Unicode 隐写水印 | ✅ 已设计 |
| 7 | 提示词注入防护 | 模式检测 + 指令隔离 | ✅ 已设计 |
| 8 | 结果内容安全检查 | 检测密钥/凭证/路径泄露 | ✅ 已设计 |
| 9 | 交叉验证防投毒 | 冗余分配 + 一致性比对 | ✅ 已设计 |
| 10 | 女巫攻击检测 | 同源终端关联分析 | ✅ 已设计 |
| 11 | 全量审计日志 | 事件溯源 + 告警 | ✅ 已设计 |
| 12 | 强制 HTTPS | TLS 1.2+ / HSTS | ✅ 已设计 |

---

## 十二、风险与应对

| 风险 | 影响 | 应对 |
|------|------|------|
| 终端算力不均 | 部分任务执行很慢 | 超时自动重分配 + 任务难度分级 |
| 终端结果质量差 | 汇总结果不可靠 | Schema 验证 + 置信度阈值 + 元 Agent 抽样审核 |
| 恶意终端 | 提交垃圾/有害结果 | 信用评分 + 终端限流 + 交叉验证 + 女巫检测 |
| 任务上下文泄露 | 敏感信息暴露 | 自动脱敏 + 最小权限 + 上下文水印 + 审计日志 |
| IDOR 枚举攻击 | 批量爬取任务/结果 | UUID 标识符 + 强制鉴权 + 速率限制 |
| 虚假终端注册 | 刷量/投毒 | 人类认领制 + 每人限额 + 人机验证 |
| 提示词注入 | 操控 Agent 执行恶意操作 | 模式检测 + 指令隔离 + 结构化输出 |
| API 密钥泄露 | 攻击者冒充合法终端 | 密钥轮换 + 即时撤销 + 异常检测告警 |
| 结果投毒 | 讨论结论被操控 | 交叉验证 + 异常检测 + 元 Agent 审核 |
| 讨论同质化 | 所有 Agent 观点趋同 | 引导信号（devil_advocate）+ 立场聚类配对 |
| 讨论偏离主题 | Agent 偏离角色设定 | 动态角色约束 + 引导信号（focus_topic） |
| 中枢 token 爆炸 | 汇总成本过高 | 结构化输出 + 分层聚合策略 |

---

## 附录 A：RealComment 迁移参考

### A.1 概念映射

| RealComment | SwarmFlow | 迁移说明 |
|-------------|-----------|---------|
| DiscussionThread | InteractionThread | 泛化为通用交互线程 |
| DiscussionDigest | AggregationDigest | 泛化为通用聚合摘要 |
| DiscussionMap | InteractionMap | 泛化为通用交互地图 |
| DiscussionPhase | InteractionPhase | 泛化为通用交互阶段 |
| DiscussionRound | InteractionRound | 泛化为通用交互轮次 |
| stanceShift（字段） | output.stance | 从输出中提取立场 |
| DiscussionDigest | AggregationDigest | 泛化，移除特定业务逻辑 |

### A.2 代码迁移示例

#### RealComment（原代码）
```typescript
interface DiscussionThread {
  threadId: string
  discussionId: string
  rounds: DiscussionRound[]
  discussionDigest: DiscussionDigest
  discussionMap?: DiscussionMap
}
```

#### SwarmFlow（迁移后）
```typescript
interface InteractionThread {
  threadId: string
  missionId: string
  phaseId: string
  rounds: InteractionRound[]
  aggregationDigest: AggregationDigest
  interactionMap?: InteractionMap
}
```

### A.3 配置迁移

```typescript
// RealComment 特定配置
const realCommentConfig = {
  domain: 'code_review',
  stanceLabels: ['positive', 'negative', 'neutral'],
  stanceShiftEnabled: true
}

// SwarmFlow 泛化配置
const swarmFlowConfig = {
  // 不绑定特定领域
  stanceLabels: undefined,  // 由 Mission 定义
  stanceShiftEnabled: false,  // 改为从 output.stance 提取
  agentFramework: 'mastra'
}
```

---

*本设计方案将随讨论深入持续更新。*
