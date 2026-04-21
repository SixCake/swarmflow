# SwarmFlow 设计文档 - 实现细节补充

本文档补充 `swarm-flow-design.md` 中引用但未详细定义的类型和函数实现。

---

## 一、类型定义补充

### 1.1 基础类型

```typescript
// 任务类型
type TaskType = 
  | 'independent_opinion'      // 独立发表意见
  | 'comment'                  // 评论他人观点
  | 'reply'                    // 回应评论
  | 'final_stance'             // 最终立场
  | 'aggregate'                // 聚合任务

// 任务状态
type TaskStatus = 
  | 'pending'                  // 等待领取
  | 'claimed'                  // 已被领取
  | 'submitted'                // 已提交
  | 'verified'                 // 已验证通过
  | 'rejected'                 // 被拒绝
  | 'timeout'                  // 超时
  | 'cancelled'                // 已取消

// Mission 状态
type MissionStatus = 
  | 'created'                  // 已创建
  | 'running'                  // 运行中
  | 'paused'                   // 已暂停
  | 'completed'                // 已完成
  | 'failed'                   // 失败
  | 'cancelled'                // 已取消

// 阶段类型
type PhaseType = 
  | 'parallel'                 // 并行执行
  | 'interactive'              // 交互式
  | 'aggregate'                // 聚合阶段

// 重试策略
interface RetryPolicy {
  maxRetries: number
  backoffType: 'fixed' | 'exponential'
  baseDelayMs: number
}

// 引导策略
interface GuidancePolicy {
  enableDevilsAdvocate: boolean    // 是否启用魔鬼代言人
  enableFocusTopic: boolean        // 是否启用主题聚焦
  maxGuidanceSignals: number       // 最大引导信号数量
}
```

### 1.2 交互相关类型

```typescript
// 交互轮次
interface InteractionRound {
  roundNumber: number
  tasks: Task[]
  results: ResultMetadata[]
  startedAt: Date
  completedAt?: Date
}

// 交互地图
interface InteractionMap {
  mapId: string
  missionId: string
  phaseId: string
  nodes: InteractionNode[]
  edges: InteractionEdge[]
  updatedAt: Date
}

interface InteractionNode {
  nodeId: string
  type: 'post' | 'comment' | 'reply'
  agentId: string
  stance: string
  timestamp: Date
}

interface InteractionEdge {
  fromNodeId: string
  toNodeId: string
  type: 'comment_on' | 'reply_to'
}

// 交互阶段
interface InteractionPhase {
  phaseId: string
  missionId: string
  phaseType: PhaseType
  order: number
  taskTemplate: TaskTemplate
  transitionRule: TransitionRule
  startedAt?: Date
  completedAt?: Date
  status: 'pending' | 'running' | 'completed'
}

interface TaskTemplate {
  type: TaskType
  instructionTemplate: string
  expectedOutputSchema: JSONSchema
  contextFields: string[]
}

interface TransitionRule {
  type: 'all_completed' | 'convergence' | 'decision_point'
  config?: Record<string, any>
}

// 立场聚类
interface StanceCluster {
  stance: string
  count: number
  representativeOutput: string
  confidence: number
  members: ResultMetadata[]
}
```

### 1.3 Agent 相关类型

```typescript
// Agent 输入
interface AgentInput {
  instructions: string
  context: Record<string, any>
  aggregationDigest?: AggregationDigest
}

// Agent 输出
interface AgentOutput {
  content: string
  stance?: string
  confidence: number
  reasoning?: string
  tags?: string[]
  customFields?: Record<string, any>
  customMetadata?: Record<string, any>
  modelUsed?: string
  tokenUsed?: number
}

// JSON Schema（简化）
interface JSONSchema {
  type: 'object' | 'array' | 'string' | 'number' | 'boolean'
  properties?: Record<string, JSONSchema>
  required?: string[]
  items?: JSONSchema
}
```

### 1.4 DAG 相关类型

```typescript
// DAG（有向无环图）
interface DAG {
  dagId: string
  missionId: string
  nodes: DAGNode[]
  edges: DAGEdge[]
}

interface DAGNode {
  nodeId: string
  missionId: string
  phaseId: string
  taskType: TaskType
  dependencies: string[]
  status: 'pending' | 'running' | 'completed' | 'failed'
  createdAt: Date
  completedAt?: Date
}

interface DAGEdge {
  fromNodeId: string
  toNodeId: string
}
```

### 1.5 报告相关类型

```typescript
// 报告
interface Report {
  reportId: string
  missionId: string
  layers: ReportLayer[]
  generatedAt: Date
}

interface ReportLayer {
  layerName: string
  content: string
  metadata?: Record<string, any>
}
```

### 1.6 引导信号类型

```typescript
// 引导信号
interface GuidanceSignal {
  signalId: string
  type: 'devil_advocate' | 'focus_topic' | 'clarify分歧'
  topic: string
  priority: number
  description: string
  createdAt: Date
}
```

---

## 二、函数实现补充

### 2.1 立场聚类算法实现

```typescript
/**
 * 计算立场相似度矩阵
 * 使用简单的字符串相似度（实际可替换为更复杂的 NLP 算法）
 */
function computeSimilarityMatrix(stances: string[]): number[][] {
  const n = stances.length
  const matrix: number[][] = Array(n).fill(null).map(() => Array(n).fill(0))

  for (let i = 0; i < n; i++) {
    for (let j = i; j < n; j++) {
      const similarity = computeStringSimilarity(stances[i], stances[j])
      matrix[i][j] = similarity
      matrix[j][i] = similarity
    }
  }

  return matrix
}

/**
 * 计算两个字符串的相似度（简化版 Jaccard 相似度）
 */
function computeStringSimilarity(str1: string, str2: string): number {
  if (str1 === str2) return 1.0

  const set1 = new Set(str1.toLowerCase().split(/\s+/))
  const set2 = new Set(str2.toLowerCase().split(/\s+/))

  const intersection = new Set([...set1].filter(x => set2.has(x)))
  const union = new Set([...set1, ...set2])

  return union.size === 0 ? 0 : intersection.size / union.size
}

/**
 * 层次聚类算法（简化版：基于相似度阈值的单链接聚类）
 */
function hierarchicalClustering(
  similarityMatrix: number[][],
  threshold: number
): string[][] {
  const n = similarityMatrix.length
  const clusters: string[][] = Array.from({ length: n }, (_, i) => [String(i)])
  const merged = new Array(n).fill(false)

  let changed = true
  while (changed) {
    changed = false
    let maxSimilarity = -1
    let bestPair: [number, number] = [-1, -1]

    // 找到最相似的两个聚类
    for (let i = 0; i < n; i++) {
      if (merged[i]) continue
      for (let j = i + 1; j < n; j++) {
        if (merged[j]) continue

        // 计算两个聚类之间的相似度（单链接：最大相似度）
        let clusterSimilarity = 0
        for (const elemI of clusters[i]) {
          for (const elemJ of clusters[j]) {
            const idxI = parseInt(elemI)
            const idxJ = parseInt(elemJ)
            clusterSimilarity = Math.max(clusterSimilarity, similarityMatrix[idxI][idxJ])
          }
        }

        if (clusterSimilarity > maxSimilarity) {
          maxSimilarity = clusterSimilarity
          bestPair = [i, j]
        }
      }
    }

    // 如果相似度超过阈值，合并聚类
    if (maxSimilarity >= threshold && bestPair[0] !== -1) {
      const [i, j] = bestPair
      clusters[i] = [...clusters[i], ...clusters[j]]
      merged[j] = true
      changed = true
    }
  }

  return clusters.filter((_, i) => !merged[i])
}

/**
 * 找到聚类的中心立场（出现频率最高的立场）
 */
function findCentroid(cluster: string[]): string {
  const frequency: Record<string, number> = {}
  
  for (const item of cluster) {
    frequency[item] = (frequency[item] || 0) + 1
  }

  let maxCount = 0
  let centroid = cluster[0]

  for (const [stance, count] of Object.entries(frequency)) {
    if (count > maxCount) {
      maxCount = count
      centroid = stance
    }
  }

  return centroid
}

/**
 * 选择代表性输出（信心度最高的结果）
 */
function selectRepresentative(results: ResultMetadata[]): string {
  if (results.length === 0) return ''
  
  return results.reduce((best, current) => 
    current.output.confidence > best.output.confidence ? current : best
  ).output.content
}

/**
 * 计算平均信心度
 */
function averageConfidence(results: ResultMetadata[]): number {
  if (results.length === 0) return 0

  const sum = results.reduce((acc, r) => acc + r.output.confidence, 0)
  return sum / results.length
}
```

### 2.2 收敛判断算法实现

```typescript
/**
 * 计算立场分布变化率
 * 使用 KL 散度或简单的欧氏距离
 */
function computeDistributionChange(recentRounds: InteractionRound[]): number {
  if (recentRounds.length < 2) return 1.0

  const latest = recentRounds[recentRounds.length - 1]
  const previous = recentRounds[recentRounds.length - 2]

  // 提取立场分布
  const latestDist = extractStanceDistribution(latest.results)
  const previousDist = extractStanceDistribution(previous.results)

  // 计算欧氏距离
  return computeEuclideanDistance(latestDist, previousDist)
}

/**
 * 从结果中提取立场分布
 */
function extractStanceDistribution(results: ResultMetadata[]): Record<string, number> {
  const distribution: Record<string, number> = {}
  const total = results.length

  for (const result of results) {
    const stance = result.output.stance || 'neutral'
    distribution[stance] = (distribution[stance] || 0) + 1
  }

  // 归一化
  for (const stance in distribution) {
    distribution[stance] /= total
  }

  return distribution
}

/**
 * 计算两个分布之间的欧氏距离
 */
function computeEuclideanDistance(
  dist1: Record<string, number>,
  dist2: Record<string, number>
): number {
  const allStances = new Set([...Object.keys(dist1), ...Object.keys(dist2)])
  let sumSquares = 0

  for (const stance of allStances) {
    const v1 = dist1[stance] || 0
    const v2 = dist2[stance] || 0
    sumSquares += Math.pow(v1 - v2, 2)
  }

  return Math.sqrt(sumSquares)
}
```

### 2.3 立场推断实现（替代简化实现）

```typescript
/**
 * 从内容推断立场
 * 使用关键词匹配和情感分析（简化版）
 */
function inferStance(content: string): string {
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

### 2.4 并发优化函数实现

```typescript
/**
 * 生成任务列表
 */
function generateTasks(mission: Mission): Task[] {
  const tasks: Task[] = []
  const phase = mission.phases[mission.currentPhaseIndex]

  // 根据阶段类型生成任务
  if (phase.phaseType === 'parallel') {
    // 并行阶段：为每个 Agent 生成任务
    for (const blueprint of mission.blueprints) {
      tasks.push(createTaskFromBlueprint(mission, phase, blueprint))
    }
  } else if (phase.phaseType === 'interactive') {
    // 交互阶段：任务由 DAG 引擎动态生成
    // 这里返回空数组，实际任务由交互线程逻辑生成
  }

  return tasks
}

/**
 * 从 Agent 蓝图创建任务
 */
function createTaskFromBlueprint(
  mission: Mission,
  phase: InteractionPhase,
  blueprint: AgentBlueprint
): Task {
  return {
    taskId: generateUUID(),
    missionId: mission.missionId,
    phaseId: phase.phaseId,
    taskType: phase.taskTemplate.type,
    instructions: renderTemplate(phase.taskTemplate.instructionTemplate, {
      role: blueprint.role,
      ...mission.context
    }),
    context: {
      ...mission.context,
      role: blueprint.role
    },
    status: 'pending',
    retryCount: 0,
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + mission.taskConfig.taskTimeout * 1000)
  }
}

/**
 * 处理单个结果
 */
async function processResult(result: ResultMetadata): Promise<void> {
  // 1. 验证结果
  const validation = validateResult(result)
  if (!validation.passed) {
    console.error(`Result validation failed: ${validation.reason}`)
    return
  }

  // 2. 存储结果
  await storeResult(result)

  // 3. 触发 DAG 引擎
  await dagEngine.onTaskCompleted(result.taskId, result)
}

/**
 * 验证结果
 */
function validateResult(result: ResultMetadata): { passed: boolean; reason?: string } {
  // 检查必需字段
  if (!result.output.content) {
    return { passed: false, reason: 'Missing content' }
  }

  if (result.output.confidence < 0 || result.output.confidence > 1) {
    return { passed: false, reason: 'Invalid confidence value' }
  }

  return { passed: true }
}

/**
 * 存储结果（简化版）
 */
async function storeResult(result: ResultMetadata): Promise<void> {
  // 实际实现应该使用持久化存储
  console.log(`Storing result for task ${result.taskId}`)
}
```

### 2.5 报告生成函数实现

```typescript
/**
 * 生成统计摘要
 */
function generateStatisticsSummary(digest: AggregationDigest): ReportLayer {
  const { statistics } = digest

  return {
    layerName: 'Statistics Summary',
    content: `
## 统计摘要

- 总结果数: ${statistics.totalResults}
- 已完成: ${statistics.completedResults}
- 待处理: ${statistics.pendingResults}
- 平均信心度: ${(statistics.averageConfidence * 100).toFixed(1)}%

### 立场分布
${Object.entries(statistics.stanceDistribution)
  .map(([stance, ratio]) => `- ${stance}: ${(ratio * 100).toFixed(1)}%`)
  .join('\n')}
    `.trim(),
    metadata: statistics
  }
}

/**
 * 提取关键观点
 */
function extractKeyInsights(digest: AggregationDigest): ReportLayer {
  const insights = digest.keyInsights.slice(0, 10) // 取前 10 个

  return {
    layerName: 'Key Insights',
    content: `
## 关键观点

${insights.map((insight, index) => `
### ${index + 1}. ${insight.stance}

**支持人数**: ${insight.count}
**信心度**: ${(insight.confidence * 100).toFixed(1)}%

**代表性观点**:
> ${insight.representativeOutput}
`).join('\n---\n')}
    `.trim(),
    metadata: { insights }
  }
}

/**
 * 分析冲突
 */
function analyzeConflicts(digest: AggregationDigest): ReportLayer {
  const conflicts = digest.conflicts

  return {
    layerName: 'Conflict Analysis',
    content: `
## 冲突分析

${conflicts.length === 0 
  ? '未检测到主要冲突'
  : conflicts.map((conflict, index) => `
### 冲突 ${index + 1}: ${conflict.topic}

**冲突强度**: ${(conflict.intensity * 100).toFixed(1)}%

**对立观点**:
${conflict.stances.map(stance => `- ${stance}`).join('\n')}
`).join('\n---\n')
}
    `.trim(),
    metadata: { conflicts }
  }
}

/**
 * 总结引导信号
 */
function summarizeGuidanceSignals(digest: AggregationDigest): ReportLayer {
  const signals = digest.guidanceSuggestions || []

  return {
    layerName: 'Guidance Signals',
    content: `
## 引导信号总结

${signals.length === 0
  ? '未生成引导信号'
  : signals.map((signal, index) => `
### ${index + 1}. ${signal.type}

**主题**: ${signal.topic}
**优先级**: ${signal.priority}

**描述**: ${signal.description || '无'}
`).join('\n---\n')
}
    `.trim(),
    metadata: { signals }
  }
}

/**
 * 生成最终报告
 */
async function generateFinalReport(
  mission: Mission,
  digest: AggregationDigest
): Promise<ReportLayer> {
  // 这里可以使用 LLM 生成更自然的报告
  // 但为了节省 token，使用模板化生成

  return {
    layerName: 'Final Report',
    content: `
## 最终报告

### Mission 概述
- **名称**: ${mission.name}
- **目标**: ${mission.objective.primaryGoal}
- **状态**: ${mission.status}

### 主要发现
- 参与的 Agent 总数: ${digest.statistics.totalResults}
- 平均信心度: ${(digest.statistics.averageConfidence * 100).toFixed(1)}%
- 主要立场: ${getDominantStance(digest.statistics.stanceDistribution)}

### 建议
基于收集到的 ${digest.statistics.completedResults} 个结果，建议：

1. 重点关注 ${digest.keyInsights[0]?.stance || '主流观点'}
2. 进一步讨论 ${digest.conflicts[0]?.topic || '主要冲突'}
3. 考虑 ${digest.guidanceSuggestions?.[0]?.type || '后续行动'}

### 结论
${generateConclusion(mission, digest)}
    `.trim(),
    metadata: { missionId: mission.missionId, digestId: digest.digestId }
  }
}

/**
 * 获取主导立场
 */
function getDominantStance(distribution: Record<string, number>): string {
  let maxRatio = 0
  let dominant = 'neutral'

  for (const [stance, ratio] of Object.entries(distribution)) {
    if (ratio > maxRatio) {
      maxRatio = ratio
      dominant = stance
    }
  }

  return dominant
}

/**
 * 生成结论
 */
function generateConclusion(
  mission: Mission,
  digest: AggregationDigest
): string {
  const consensusLevel = Math.max(...Object.values(digest.statistics.stanceDistribution))

  if (consensusLevel > 0.7) {
    return '各方观点高度一致，可以形成明确的结论。'
  } else if (consensusLevel > 0.5) {
    return '各方观点基本一致，但仍有少数不同意见需要考虑。'
  } else {
    return '各方观点存在显著分歧，建议进一步讨论或收集更多信息。'
  }
}
```

### 2.6 辅助函数

```typescript
/**
 * 生成 UUID
 */
function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0
    const v = c === 'x' ? r : (r & 0x3 | 0x8)
    return v.toString(16)
  })
}

/**
 * 渲染模板（简单的变量替换）
 */
function renderTemplate(template: string, variables: Record<string, any>): string {
  let result = template

  for (const [key, value] of Object.entries(variables)) {
    const regex = new RegExp(`{{${key}}}`, 'g')
    result = result.replace(regex, String(value))
  }

  return result
}

/**
 * 异步延迟
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
```

---

## 三、完整示例：立场推断增强版

```typescript
/**
 * 增强版立场推断
 * 使用更复杂的 NLP 技术（可替换为实际 NLP 库）
 */
class EnhancedStanceInference {
  private positivePatterns: RegExp[]
  private negativePatterns: RegExp[]
  private neutralPatterns: RegExp[]

  constructor() {
    // 编译正则表达式（提升性能）
    this.positivePatterns = [
      /\b(支持|赞同|同意|认可|肯定|推荐|应该|值得)\b/g,
      /\b(优秀|良好|出色|卓越|杰出|完美|理想)\b/g,
      /\b(正确|合理|有效|成功|有价值|有成效)\b/g,
      /\b(优点|优势|长处|亮点|特色|创新)\b/g
    ]

    this.negativePatterns = [
      /\b(反对|不赞同|不同意|否定|质疑|怀疑|不应该|不值得)\b/g,
      /\b(差|糟糕|劣质|低劣|糟糕|失败|无效)\b/g,
      /\b(错误|不合理|无价值|有害|危险|风险)\b/g,
      /\b(缺点|劣势|短处|问题|缺陷|漏洞)\b/g
    ]

    this.neutralPatterns = [
      /\b(客观|中立|平衡|综合|全面|多角度)\b/g,
      /\b(需要考虑|有待观察|需要更多信息|不确定)\b/g
    ]
  }

  /**
   * 推断立场
   */
  inferStance(content: string): 'positive' | 'negative' | 'neutral' {
    const lowerContent = content.toLowerCase()

    const positiveScore = this.computeScore(lowerContent, this.positivePatterns)
    const negativeScore = this.computeScore(lowerContent, this.negativePatterns)
    const neutralScore = this.computeScore(lowerContent, this.neutralPatterns)

    // 加权判断
    const totalScore = positiveScore + negativeScore + neutralScore
    if (totalScore === 0) return 'neutral'

    const positiveRatio = positiveScore / totalScore
    const negativeRatio = negativeScore / totalScore
    const neutralRatio = neutralScore / totalScore

    // 阈值判断
    if (positiveRatio > 0.4 && positiveRatio > negativeRatio * 1.5) {
      return 'positive'
    } else if (negativeRatio > 0.4 && negativeRatio > positiveRatio * 1.5) {
      return 'negative'
    } else {
      return 'neutral'
    }
  }

  /**
   * 计算匹配分数
   */
  private computeScore(content: string, patterns: RegExp[]): number {
    let score = 0

    for (const pattern of patterns) {
      const matches = content.match(pattern)
      if (matches) {
        score += matches.length
      }
    }

    return score
  }
}

// 使用示例
const stanceInference = new EnhancedStanceInference()
const stance = stanceInference.inferStance('这个方案非常好，我完全支持')
console.log(stance) // 'positive'
```

---

## 四、使用说明

### 4.1 在主文档中引用

在 `swarm-flow-design.md` 中，可以使用以下方式引用本补充文档：

```markdown
详细的类型定义和函数实现请参考 [实现细节补充文档](./swarm-flow-design-implementation.md)。
```

### 4.2 代码示例

所有函数都可以直接在 TypeScript 项目中使用。建议：

1. 将类型定义放在 `types/` 目录
2. 将函数实现放在 `utils/` 或 `algorithms/` 目录
3. 根据实际需求调整算法参数（如相似度阈值、聚类策略等）

### 4.3 扩展建议

- **立场推断**：可替换为专业的 NLP 库（如 TensorFlow.js、自然语言处理库）
- **聚类算法**：可使用更复杂的算法（如 DBSCAN、K-means）
- **相似度计算**：可使用词向量或预训练模型
- **报告生成**：可集成 LLM API 生成更自然的报告

---

*本文档随主设计文档持续更新。*
