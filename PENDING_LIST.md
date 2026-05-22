# mcp-omnisearch API 优先级与 Fallback 机制 - 实施计划

> **最后更新**: 2026-05-22  
> **状态**: 已完成 (Completed)  
> **目标**: 为 mcp-omnisearch 添加 API 优先级、Fallback 机制、冷却期管理、权重负载均衡和 Callback 钩子。

---

## 📊 背景分析

### 当前架构
*   **ProviderRegistry**: 统一管理所有 API 提供者的注册、状态追踪和实例获取。
*   **API Key 验证**: 通过 `is_api_key_valid()` 检查 API Key 是否有效。
*   **状态追踪**: 每个 Provider 有 `available`/`unavailable` 状态。
*   **错误处理**: 通过 `ProviderError` 处理提供者不可用的情况。

### 缺失功能
1.  **API 优先级**: 当前没有优先级概念，所有可用的 Provider 平等对待。
2.  **Fallback 机制**: 当一个 API 失败时，没有自动切换到下一个 API 的逻辑。
3.  **冷却期 (Cooldown)**: 没有速率限制或冷却期管理（特别是"直到下月一号"的月度冷却）。
4.  **权重/负载均衡**: 没有权重分配或轮询机制。
5.  **Callback 机制**: 没有回调钩子供外部监听 API 调用状态。

---

## 📋 Pending List

### Phase 1: 核心数据结构扩展

#### 1.1 扩展 `ProviderDefinition` 接口
**文件**: `src/server/provider-registry.ts`

**修改内容**:
```typescript
export interface ProviderDefinition<T> {
  // ... 现有字段
  
  // 新增：优先级 (1-10, 1 为最高优先级)
  priority?: number;
  
  // 新增：权重 (用于负载均衡，默认 1)
  weight?: number;
  
  // 新增：冷却期配置
  cooldown_config?: {
    type: 'fixed' | 'monthly';
    duration_ms?: number; // fixed 类型时使用
  };
  
  // 新增：最大重试次数
  max_retries?: number;
}
```

#### 1.2 新增 `CooldownManager` 类
**文件**: `src/server/cooldown-manager.ts` (新建)

**功能**:
*   管理每个 Provider 的冷却期
*   支持固定时长冷却和"直到下月一号 00:00:00"的动态冷却
*   提供冷却状态查询

**核心方法**:
```typescript
class CooldownManager {
  setCooldown(providerId: string, durationMs: number, reason: string): void;
  setMonthlyCooldown(providerId: string, reason: string): void;
  isAvailable(providerId: string): boolean;
  getRemainingTime(providerId: string): number;
  clearCooldown(providerId: string): void;
  getAllStatus(): Record<string, { availableAt: number; reason: string }>;
}
```

#### 1.3 新增 `ProviderUsageTracker` 类
**文件**: `src/server/provider-usage-tracker.ts` (新建)

**功能**:
*   记录每个 Provider 的调用历史
*   计算成功率、平均响应时间
*   检测异常模式（如连续失败）

**核心方法**:
```typescript
class ProviderUsageTracker {
  recordCall(providerId: string, success: boolean, durationMs: number): void;
  getSuccessRate(providerId: string, windowMinutes: number): number;
  getAvgResponseTime(providerId: string, windowMinutes: number): number;
  getCallCount(providerId: string, windowMinutes: number): number;
}
```

---

### Phase 2: 智能选择器实现

#### 2.1 新增 `ProviderSelector` 类
**文件**: `src/server/provider-selector.ts` (新建)

**功能**:
*   根据优先级、权重、冷却期、成功率选择最佳 Provider
*   支持轮询 (Round-Robin) 和加权随机 (Weighted Random) 策略
*   返回带 Fallback 的候选列表

**核心方法**:
```typescript
class ProviderSelector {
  constructor(
    private registry: ProviderRegistry<any>,
    private tracker: ProviderUsageTracker,
    private cooldownManager: CooldownManager
  );
  
  select(category: ProviderCategory, toolName: string): string;
  selectWithFallback(category: ProviderCategory, toolName: string): string[];
  reset(): void;
}
```

---

### Phase 3: Callback 机制

#### 3.1 新增 `ProviderCallback` 类型和注册表
**文件**: `src/server/provider-callbacks.ts` (新建)

**功能**:
*   允许外部注册回调函数
*   在 API 调用前后触发回调
*   支持异步回调

**核心结构**:
```typescript
type ProviderCallback = (event: ProviderEvent) => void | Promise<void>;

interface ProviderEvent {
  type: 'before_call' | 'after_call' | 'error' | 'cooldown_enter' | 'cooldown_exit';
  providerId: string;
  category: ProviderCategory;
  toolName: string;
  timestamp: number;
  success?: boolean;
  error?: Error;
  metadata?: any;
}

class CallbackRegistry {
  register(callback: ProviderCallback): void;
  emit(event: ProviderEvent): Promise<void>;
}
```

---

### Phase 4: 工具层集成

#### 4.1 修改 `web-search.ts`
**文件**: `src/server/tools/web-search.ts`

**修改内容**:
*   使用 `ProviderSelector` 替代直接的 `require()` 调用
*   实现 Fallback 逻辑：当首选 API 失败时，自动尝试下一个
*   在调用前后触发 Callback
*   捕获错误并触发冷却

**伪代码示例**:
```typescript
const selector = new ProviderSelector(searchRegistry, usageTracker, cooldownManager);

async function webSearchTool(params: any) {
  const candidates = selector.selectWithFallback('search', 'web-search');
  
  for (const providerId of candidates) {
    if (!cooldownManager.isAvailable(providerId)) continue;
    
    await callbackRegistry.emit({ type: 'before_call', ... });
    const startTime = Date.now();
    
    try {
      const provider = searchRegistry.require(providerId, 'web-search');
      const result = await provider.search(params.query);
      
      usageTracker.recordCall(providerId, true, Date.now() - startTime);
      await callbackRegistry.emit({ type: 'after_call', success: true, ... });
      return result;
      
    } catch (error) {
      usageTracker.recordCall(providerId, false, Date.now() - startTime);
      
      if (isQuotaExceeded(error)) {
        cooldownManager.setMonthlyCooldown(providerId, 'quota_exceeded');
      } else if (isRateLimited(error)) {
        cooldownManager.setCooldown(providerId, 60000, 'rate_limited');
      }
      
      await callbackRegistry.emit({ type: 'error', error, ... });
    }
  }
  
  throw new Error('All providers failed or are in cooldown');
}
```

#### 4.2 同样修改其他工具文件
*   `src/server/tools/ai-search.ts`
*   `src/server/tools/web-extract.ts`
*   `src/server/tools/github-search.ts`

---

### Phase 5: 配置与环境变量

#### 5.1 扩展 `env.ts`
**文件**: `src/config/env.ts`

**新增配置**:
```typescript
// API 优先级配置 (JSON 字符串)
// 示例: '{"search": {"tavily": 1, "brave": 2, "kagi": 3}}'
export const API_PRIORITY_CONFIG = process.env.API_PRIORITY_CONFIG;

// 冷却期配置 (JSON 字符串)
// 示例: '{"tavily": {"type": "monthly"}, "brave": {"type": "fixed", "duration_ms": 60000}}'
export const COOLDOWN_CONFIG = process.env.COOLDOWN_CONFIG;

// 权重配置 (JSON 字符串)
// 示例: '{"tavily": 5, "brave": 3, "kagi": 2}'
export const WEIGHT_CONFIG = process.env.WEIGHT_CONFIG;

// 是否启用回调 (布尔值)
export const ENABLE_CALLBACKS = process.env.ENABLE_CALLBACKS === 'true';
```

#### 5.2 新增配置解析器
**文件**: `src/config/provider-config.ts` (新建)

**功能**:
*   解析环境变量中的 JSON 配置
*   将配置应用到 `ProviderDefinition`
*   提供默认值

---

### Phase 6: 辅助模块

#### 6.1 错误映射表
**文件**: `src/common/error-mapping.ts` (新建)

**功能**: 统一不同 API 的错误格式，提供标准化的错误类型判断。

```typescript
interface ErrorMapping {
  providerId: string;
  patterns: {
    statusCode?: number[];
    messageRegex?: RegExp;
    errorCode?: string[];
  };
  errorType: 'quota_exceeded' | 'rate_limited' | 'auth_failed' | 'server_error' | 'unknown';
}

function classifyError(providerId: string, error: any): string;
```

#### 6.2 监控与调试端点
**文件**: `src/server/debug-endpoints.ts` (新建)

**功能**: 通过 MCP resource 暴露内部状态，方便调试。

```typescript
{
  uri: 'omnisearch://status/providers',
  name: 'Provider Status',
  description: 'Current status of all providers',
  handler: () => ({
    cooldowns: cooldownManager.getAllStatus(),
    stats: usageTracker.getAllStats(),
    available: registry.ids(),
  })
}
```

---

### Phase 7: 测试与文档

#### 7.1 单元测试
*   `src/server/cooldown-manager.test.ts`
*   `src/server/provider-usage-tracker.test.ts`
*   `src/server/provider-selector.test.ts`
*   `src/server/provider-callbacks.test.ts`

#### 7.2 集成测试
*   `src/server/tools/web-search.integration.test.ts` (测试 Fallback 逻辑)

#### 7.3 更新 README
*   添加新功能说明
*   添加配置示例
*   添加回调机制使用说明

---

## 🔍 逻辑完整性分析

### ✅ 已覆盖的逻辑
1.  **API 优先级**: 通过 `priority` 字段和 `ProviderSelector` 实现。
2.  **Fallback 机制**: 通过 `selectWithFallback()` 返回候选列表，工具层循环尝试。
3.  **冷却期**: 通过 `CooldownManager` 实现，支持固定时长和"直到下月一号"。
4.  **权重/负载均衡**: 通过 `weight` 字段和加权随机算法实现。
5.  **Callback 机制**: 通过 `CallbackRegistry` 实现，支持异步回调。
6.  **错误处理**: 工具层捕获错误，判断错误类型，触发相应冷却策略。
7.  **配置管理**: 通过环境变量 JSON 配置，支持动态调整。

### ⚠️ 潜在风险与解决方案

| 风险点 | 描述 | 解决方案 |
|--------|------|----------|
| **并发安全** | 多请求同时写入冷却状态 | Node.js 单线程模型天然避免；或使用 async-mutex |
| **冷却期持久化** | 重启后冷却状态丢失 | 接受重启重置（月度额度本身会刷新）；或写入 `.cooldown-state.json` |
| **回调失败阻断** | 回调异常影响主流程 | `CallbackRegistry.emit()` 捕获异常，记录日志但不阻断 |
| **配置热重载** | 运行时修改配置不生效 | 方案 A: 重启生效（推荐）；方案 B: 监听文件变化（复杂） |
| **错误识别准确性** | 不同 API 错误格式不同 | 使用 `error-mapping.ts` 统一映射；依赖 HTTP 状态码 |
| **负载均衡公平性** | 高权重但低成功率导致大量失败 | 引入"成功率惩罚"机制；设置"最大连续失败次数"阈值 |

---

## 🎯 实施顺序建议

1.  **Phase 1**: 建立核心数据结构（`CooldownManager`, `ProviderUsageTracker`）
2.  **Phase 2**: 实现智能选择器（`ProviderSelector`）
3.  **Phase 3**: 实现回调机制（`CallbackRegistry`）
4.  **Phase 4**: 集成到工具层（修改 `web-search.ts` 等）
5.  **Phase 5**: 添加配置支持（`env.ts`, `provider-config.ts`）
6.  **Phase 6**: 添加辅助模块（`error-mapping.ts`, `debug-endpoints.ts`）
7.  **Phase 7**: 编写测试和文档

---

## 📝 备注

*   本计划遵循"Obsidian 备份优先 -> 用户审批 -> 同步至 CoPaw 工作区"的工作流。
*   所有修改需先在 Obsidian (`D:\Schleiden\Obsidian\`) 中记录，获得 Sean 老师批准后再执行。
*   冷却期设计特别考虑了 API 月度额度刷新的场景，支持"直到下月一号"的动态冷却。
