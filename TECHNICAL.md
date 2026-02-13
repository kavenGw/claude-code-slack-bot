# Claude Code Slack Bot — 技术文档

## 目录

1. [系统架构](#系统架构)
2. [启动流程](#启动流程)
3. [核心组件详解](#核心组件详解)
4. [数据流](#数据流)
5. [会话与状态管理](#会话与状态管理)
6. [权限系统](#权限系统)
7. [MCP 集成](#mcp-集成)
8. [技能系统](#技能系统)
9. [文件处理](#文件处理)
10. [错误处理与恢复](#错误处理与恢复)
11. [扩展指南](#扩展指南)
12. [类型定义](#类型定义)
13. [依赖关系](#依赖关系)

---

## 系统架构

### 组件关系图

```
┌─────────────────────────────────────────────────────────────┐
│                         Slack API                           │
│              (Socket Mode, Events, Actions)                 │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────┐
│                    SlackHandler (协调器)                      │
│  ┌──────────────┬──────────────┬──────────────┬───────────┐ │
│  │ WorkingDir   │ FileHandler  │ TodoManager  │ Skill     │ │
│  │ Manager      │              │              │ Manager   │ │
│  └──────┬───────┴──────┬───────┴──────┬───────┴─────┬─────┘ │
└─────────┼──────────────┼──────────────┼─────────────┼───────┘
          │              │              │             │
┌─────────▼──────────────▼──────────────▼─────────────▼───────┐
│                     ClaudeHandler                            │
│  ┌────────────────────┐  ┌────────────────────────────┐     │
│  │ SDK 模式 (query()) │  │ 本地模式 (ClaudeLocalHandler)│     │
│  └────────┬───────────┘  └──────────────┬─────────────┘     │
│           │                             │                    │
│  ┌────────▼─────────────────────────────▼─────────────┐     │
│  │              McpManager                             │     │
│  │  ┌──────────────────────────────────────────────┐  │     │
│  │  │ PermissionMCPServer (独立进程, SDK模式专用)    │  │     │
│  │  └──────────────────────────────────────────────┘  │     │
│  └────────────────────────────────────────────────────┘     │
└──────────────────────────────────────────────────────────────┘
```

### 文件清单

| 文件 | 职责 | 行数 |
|------|------|------|
| `src/index.ts` | 入口，初始化和启动 | ~72 |
| `src/config.ts` | 环境变量加载、验证、OpenRouter配置 | ~99 |
| `src/logger.ts` | 结构化日志 (DEBUG/INFO/WARN/ERROR) | ~42 |
| `src/types.ts` | `ConversationSession`、`WorkingDirectoryConfig` 类型 | ~17 |
| `src/slack-handler.ts` | Slack事件处理、消息路由、工具格式化 | ~790 |
| `src/claude-handler.ts` | Claude SDK/本地双模式查询、会话管理 | ~294 |
| `src/claude-local-handler.ts` | 本地 claude CLI 子进程管理 | ~206 |
| `src/working-directory-manager.ts` | 工作目录分层解析和配置 | ~217 |
| `src/file-handler.ts` | 文件下载、类型检测、提示嵌入 | ~167 |
| `src/image-handler.ts` | 图片 Base64 转换 (辅助) | ~39 |
| `src/todo-manager.ts` | 任务列表状态追踪和格式化 | ~146 |
| `src/mcp-manager.ts` | MCP 服务器配置加载和验证 | ~159 |
| `src/skill-manager.ts` | 技能注册、触发匹配、列表展示 | ~119 |
| `src/permission-mcp-server.ts` | 权限申请 MCP 服务器 (独立进程) | ~269 |

---

## 启动流程

```
index.ts: start()
│
├── 1. dotenv.config()                    // 加载 .env
├── 2. validateConfig()                    // 验证 Slack tokens
│     └── 本地模式跳过 API key 检查
│     └── OpenRouter 模式验证 OPENROUTER_API_KEY
├── 3. applyOpenRouterConfig()             // 设置 ANTHROPIC_BASE_URL + ANTHROPIC_AUTH_TOKEN
│     └── 删除 ANTHROPIC_API_KEY 避免冲突
├── 4. new App({ socketMode: true })       // 初始化 Slack Bolt
├── 5. new McpManager()                    // 加载 mcp-servers.json
│     └── loadConfiguration()
├── 6. new ClaudeHandler(mcpManager)       // 初始化 Claude 处理器
│     └── 本地模式: new ClaudeLocalHandler()
├── 7. new SlackHandler(app, claude, mcp)  // 初始化 Slack 处理器
│     └── setupEventHandlers()             // 注册事件监听
└── 8. app.start()                         // 启动 Socket Mode 连接
```

### 定时任务

- **会话清理**: 每 5 分钟运行 `cleanupInactiveSessions()`, 清除 30 分钟不活跃的会话

---

## 核心组件详解

### Config (`src/config.ts`)

导出的配置对象结构:

```typescript
config = {
  slack: { botToken, appToken, signingSecret },
  anthropic: { apiKey },
  claude: {
    mode: 'sdk' | 'local',     // CLAUDE_MODE 环境变量, 默认 'sdk'
    cliPath: string,            // CLAUDE_CLI_PATH, 默认 'claude'
    useBedrock: boolean,
    useVertex: boolean,
  },
  openRouter: {
    enabled: boolean,
    apiKey: string,
    baseUrl: string,            // 默认 'https://openrouter.ai/api/v1'
  },
  baseDirectory: string,        // BASE_DIRECTORY
  debug: boolean,               // DEBUG=true 或 NODE_ENV=development
}
```

**OpenRouter 配置机制**: `applyOpenRouterConfig()` 通过修改 `process.env` 来影响 Claude Agent SDK 的行为:
- `ANTHROPIC_BASE_URL` → OpenRouter URL
- `ANTHROPIC_AUTH_TOKEN` → OpenRouter API Key
- 删除 `ANTHROPIC_API_KEY` → 避免 SDK 直连 Anthropic

### SlackHandler (`src/slack-handler.ts`)

**核心协调器**，管理所有 Slack 交互。

#### 事件注册 (`setupEventHandlers`)

| 事件 | 处理逻辑 |
|------|----------|
| `message` (DM) | `handleMessage()` |
| `app_mention` | 去除 `<@botId>`, 调用 `handleMessage()` |
| `message` (file_share) | 文件上传处理 |
| `member_joined_channel` | 发送欢迎消息 |
| `approve_tool` action | 权限审批 → `permissionServer.resolveApproval(id, true)` |
| `deny_tool` action | 权限拒绝 → `permissionServer.resolveApproval(id, false)` |

#### 内部状态 Map

```typescript
activeControllers: Map<sessionKey, AbortController>     // 活跃请求的取消控制器
todoMessages: Map<sessionKey, messageTs>                // Todo 列表消息时间戳
originalMessages: Map<sessionKey, {channel, ts}>        // 原始消息(用于反应)
currentReactions: Map<sessionKey, emoji>                // 当前反应表情(去重)
```

#### 消息处理流程 (`handleMessage`)

```
1. 文件处理: downloadAndProcessFiles()
2. 命令检测 (短路返回):
   ├── cwd <path>        → setWorkingDirectory()
   ├── cwd / directory   → getWorkingDirectory()
   ├── mcp / servers     → formatMcpInfo()
   ├── mcp reload        → reloadConfiguration()
   ├── skills            → formatSkillList()
   └── /skill args       → parseMessage() → 设置 appendSystemPrompt
3. 工作目录解析 (无目录则报错返回)
4. 会话获取/创建
5. 发送 "🤔 Thinking..." 状态消息
6. 添加 thinking_face 反应
7. Claude 流式查询:
   ├── assistant + tool_use → 格式化工具使用, TodoWrite 特殊处理
   ├── assistant + text     → 格式化文本, 追加发送
   └── result               → 发送最终结果
8. 更新状态: "✅ Task completed" + white_check_mark
9. finally: 清理 controller, 延迟 5 分钟清理 todo 状态
```

#### 工具格式化 (`formatToolUse`)

| 工具名 | 格式 |
|--------|------|
| Edit / MultiEdit | `📝 Editing file` + diff 代码块 |
| Write | `📄 Creating file` + 内容预览 |
| Read | `👁️ Reading file` |
| Bash | `🖥️ Running command` + bash 代码块 |
| TodoWrite | 空字符串 (单独处理) |
| 其他 | `🔧 Using toolName` |

#### 反应表情状态机

```
thinking_face → gear → white_check_mark    (正常流程)
                  ↘ x                       (错误)
                  ↘ stop_button             (取消)
                  ↘ arrows_counterclockwise (任务进行中)
                  ↘ clipboard               (有待处理任务)
```

### ClaudeHandler (`src/claude-handler.ts`)

**双模式 Claude 查询管理器**。

#### 会话键 (Session Key)

```typescript
getSessionKey(userId, channelId, threadTs?) → `${userId}-${channelId}-${threadTs || 'direct'}`
```

#### SDK 模式查询 (`streamQuerySDK`)

关键配置项:

```typescript
options = {
  abortController,
  permissionMode: slackContext ? 'default' : 'bypassPermissions',
  allowDangerouslySkipPermissions: !slackContext,
  systemPrompt: { type: 'preset', preset: 'claude_code', append?: systemPrompt },
  settingSources: ['user', 'project', 'local'],
  cwd: workingDirectory,
  mcpServers: { ...userServers, ...permissionServer },
  allowedTools: ['mcp__serverName', ..., 'mcp__permission-prompt'],
  resume: sessionId,       // 恢复已有会话
  stderr: (data) => log,
  permissionPromptToolName: 'mcp__permission-prompt__permission_prompt',
}
```

**权限 MCP 服务器注入**: 当有 `slackContext` 时，自动添加 `permission-prompt` MCP 服务器到配置中，路径指向 `src/permission-mcp-server.ts`，通过环境变量 `SLACK_CONTEXT` 传递频道信息。

#### 本地模式查询 (`streamQueryLocal`)

1. 构建临时 MCP 配置文件 → `os.tmpdir()/claude-mcp-*.json`
2. 委托给 `ClaudeLocalHandler.streamQuery()`
3. finally 清理临时文件

#### 连接诊断

```typescript
diagnoseConnectionFailure()
  → fetch(ANTHROPIC_BASE_URL, { timeout: 5s })
  → 记录状态码或错误信息
```

### ClaudeLocalHandler (`src/claude-local-handler.ts`)

**本地 claude CLI 子进程管理**。

#### CLI 路径查找顺序

```
1. CLAUDE_CLI_PATH 环境变量
2. 平台默认路径:
   Win: %LOCALAPPDATA%/Programs/claude-code/claude.exe
   Win: ~/.npm-global/claude.cmd
   Unix: /usr/local/bin/claude
   Unix: ~/.local/bin/claude
   Unix: ~/.npm-global/bin/claude
3. 依赖 PATH 环境变量: 'claude'
```

#### 命令行参数构建

```
claude --print <prompt>
       --output-format stream-json
       --verbose
       [--resume <sessionId>]
       [--dangerously-skip-permissions]        // bypassPermissions 模式
       [--append-system-prompt <text>]         // 技能系统提示
       [--allowedTools <tool1> <tool2> ...]    // MCP 工具
       [--mcp-config <path>]                   // MCP 配置文件
```

#### 流式处理机制

```
stdout → 逐行缓冲 → JSON.parse → pushMessage → messageQueue
                                                     ↓
                                              AsyncGenerator yield
```

使用 **消息队列 + Promise resolve** 模式实现 Node.js 事件回调到 AsyncGenerator 的桥接:
- `child.stdout.on('data')` → 填充 `messageQueue`
- `child.on('close')` → 设置 `done = true`
- generator `while(true)` 循环 → 消费队列或 await 新消息

### WorkingDirectoryManager (`src/working-directory-manager.ts`)

#### 配置键 (Config Key)

```
线程: ${channelId}-${threadTs}
DM:   ${channelId}-${userId}
频道: ${channelId}
```

#### 目录解析优先级

```
getWorkingDirectory():
  1. 线程特定配置      → configs.get(channelId-threadTs)
  2. 频道/DM 配置     → configs.get(channelId / channelId-userId)
  3. BASE_DIRECTORY   → config.baseDirectory
  4. undefined        → 触发错误提示

resolveDirectory():
  1. 绝对路径          → 直接验证存在性
  2. BASE_DIRECTORY 相对 → path.join(baseDir, input)
  3. CWD 相对          → path.resolve(input)
  4. null             → 目录不存在
```

#### 命令解析

```
设置: cwd <path> | set directory <path> | set cwd <path>
查询: cwd | dir | directory | get cwd
```

### FileHandler (`src/file-handler.ts`)

#### 处理流程

```
Slack file event
  → downloadAndProcessFiles([files])
    → downloadFile(file)
      → 大小检查 (50MB)
      → fetch(url_private_download, { Authorization: Bearer token })
      → 写入 os.tmpdir()/slack-file-{timestamp}-{filename}
      → 返回 ProcessedFile
  → formatFilePrompt(files, userText)
    → 图片: 路径 + Read 工具提示
    → 文本: 内容嵌入 (≤10000字符)
    → 二进制: 元数据注释
  → [Claude 处理]
  → cleanupTempFiles(files)
    → fs.unlinkSync(tempPath)
```

#### 文本文件 MIME 类型匹配

```
text/*                          // 所有 text 类型
application/json
application/javascript
application/typescript
application/xml
application/yaml
application/x-yaml
```

### TodoManager (`src/todo-manager.ts`)

#### 数据模型

```typescript
Todo { id, content, status: 'pending'|'in_progress'|'completed', priority: 'high'|'medium'|'low' }
```

存储: `Map<sessionId, Todo[]>`

#### 核心逻辑

- **变化检测** (`hasSignificantChange`): 任务数量变化 或 任务状态变化
- **格式化**: 按状态分组 (进行中→待处理→已完成), 已完成项加删除线
- **状态变化通知** (`getStatusChange`): ➕新增 / ✅完成 / 🔄状态变更 / ➖移除
- **清理**: 会话结束 5 分钟后删除

### McpManager (`src/mcp-manager.ts`)

#### 服务器类型

```typescript
McpStdioServerConfig  { command, args?, env? }              // 默认类型
McpSSEServerConfig    { type: 'sse', url, headers? }
McpHttpServerConfig   { type: 'http', url, headers? }
```

#### 工具命名约定

```
允许所有工具: mcp__${serverName}
特定工具:     mcp__${serverName}__${toolName}
```

#### 配置热重载

```
用户: mcp reload
  → mcpManager.reloadConfiguration()
    → this.config = null
    → this.loadConfiguration()  // 重新读取 mcp-servers.json
```

---

## 数据流

### 完整请求生命周期

```
┌─────────┐     ┌──────────────┐     ┌──────────────┐     ┌──────────┐
│  Slack   │────→│ SlackHandler │────→│ ClaudeHandler│────→│ Claude   │
│  Event   │     │              │     │              │     │ API/CLI  │
└─────────┘     └──────┬───────┘     └──────┬───────┘     └────┬─────┘
                       │                     │                   │
                       │  formatToolUse()    │  SDKMessage 流     │
                       │  handleTodoUpdate() │◄──────────────────┘
                       │  formatMessage()    │
                       │                     │
                       ▼                     ▼
                ┌──────────────┐     ┌──────────────┐
                │ Slack API    │     │ MCP Servers   │
                │ (发送消息)    │     │ (外部工具)    │
                └──────────────┘     └──────────────┘
```

### SDK 模式 vs 本地模式

| 维度 | SDK 模式 | 本地模式 |
|------|---------|---------|
| 入口 | `query()` 函数 | `spawn('claude', [...args])` |
| 通信 | 内部 SDK 管道 | stdout JSON 流 |
| 权限 | `permissionMode + permission MCP` | `--dangerously-skip-permissions` |
| MCP | 直接传入 options | 临时配置文件 `--mcp-config` |
| 会话恢复 | `options.resume` | `--resume sessionId` |
| 系统提示 | `options.systemPrompt.append` | `--append-system-prompt` |
| 配置加载 | `settingSources: ['user','project','local']` | CLI 自动加载 |

---

## 会话与状态管理

### 会话生命周期

```
创建 → 活跃 → 不活跃 → 清理
       ↑________↓
       (新消息恢复)
```

- **SessionKey**: `${userId}-${channelId}-${threadTs || 'direct'}`
- **SessionId**: Claude SDK 返回的 `session_id`，用于 `resume`
- **活跃检测**: `lastActivity` 时间戳, 30 分钟超时
- **清理周期**: 5 分钟定时器

### 内存中的状态

所有状态存储在内存 Map 中，重启后丢失:

```
ClaudeHandler.sessions          → 会话信息
SlackHandler.activeControllers  → 取消控制器
SlackHandler.todoMessages       → Todo 消息引用
SlackHandler.originalMessages   → 原始消息引用
SlackHandler.currentReactions   → 当前反应表情
WorkingDirectoryManager.configs → 工作目录配置
TodoManager.todos               → 任务列表
McpManager.config               → MCP 配置 (可从文件重载)
```

---

## 权限系统

### 架构

```
Claude SDK 查询
  → 需要权限
  → 调用 mcp__permission-prompt__permission_prompt 工具
  → PermissionMCPServer (独立 npx tsx 进程)
    → 读取 SLACK_CONTEXT 环境变量
    → 通过 Slack WebClient 发送按钮消息
    → waitForApproval(approvalId) → Promise 等待 (5分钟超时)

用户点击 Slack 按钮
  → SlackHandler action handler (approve_tool / deny_tool)
  → permissionServer.resolveApproval(approvalId, approved)
  → Promise resolve → 返回给 Claude SDK
```

### Slack 上下文传递

```typescript
// ClaudeHandler 设置 MCP 服务器时注入:
env: {
  SLACK_BOT_TOKEN: process.env.SLACK_BOT_TOKEN,
  SLACK_CONTEXT: JSON.stringify({ channel, threadTs, user })
}

// PermissionMCPServer 读取:
const slackContext = JSON.parse(process.env.SLACK_CONTEXT);
```

### 超时行为

- 5 分钟内无响应 → 自动 deny
- 错误发生 → 自动 deny

---

## MCP 集成

### 配置文件 (`mcp-servers.json`)

```json
{
  "mcpServers": {
    "serverName": {
      "command": "npx",
      "args": ["-y", "@package/name", ...],
      "env": { "KEY": "value" }
    }
  }
}
```

### 集成方式

**SDK 模式**: 直接作为 `options.mcpServers` 传入 `query()`
**本地模式**: 写入临时 JSON 文件, 通过 `--mcp-config` 传递

### 运行时管理

- 启动时自动加载 `./mcp-servers.json`
- 用户发送 `mcp reload` 触发热重载
- 无效配置自动跳过，不影响其他服务器

---

## 技能系统

### 注册和触发

```typescript
// 注册
skillManager.register({
  name: 'brainstorm',
  aliases: ['superpowers:brainstorm', 'bs'],
  description: '...',
  systemPrompt: '...',       // 追加到 Claude 系统提示
});

// 触发格式 (三选一):
/brainstorm 讨论一下架构设计
!bs 讨论一下架构设计
brainstorm: 讨论一下架构设计
```

### 技能执行流程

```
用户消息 → SkillManager.parseMessage()
  → 匹配成功:
    → userPrompt = 用户输入 (去除触发词)
    → appendSystemPrompt = skill.systemPrompt
    → ClaudeHandler.streamQuery(..., appendSystemPrompt)
      → SDK: systemPrompt.append = appendSystemPrompt
      → 本地: --append-system-prompt appendSystemPrompt
```

### 内置技能

| 名称 | 别名 | 说明 |
|------|------|------|
| brainstorm | bs, superpowers:brainstorm | 创意探索模式，禁用所有工具 |

---

## 文件处理

### 支持的类型

| 类别 | 格式 | 处理方式 |
|------|------|----------|
| 图片 | jpg, png, gif, webp | 保存到临时目录, 路径传给 Claude Read 工具 |
| 文本 | txt, md, json, js, ts, py... | 内容嵌入提示 (≤10KB) |
| 二进制 | pdf, docx 等 | 元数据注释 |

### 安全措施

- 50MB 文件大小限制
- `Authorization: Bearer` 下载认证
- 临时文件自动清理 (正常完成和异常都会清理)

---

## 错误处理与恢复

### 错误分类

| 错误类型 | 处理 | Slack 状态 | 反应 |
|---------|------|-----------|------|
| AbortError | 静默处理 | ⏹️ Cancelled | stop_button |
| SDK 错误 | 日志 + 诊断 | ❌ Error | x |
| Slack API 失败 | 降级处理 | - | - |
| 文件下载失败 | 跳过该文件 | - | - |
| MCP 配置错误 | 跳过无效服务器 | - | - |
| 权限超时 | 自动 deny | - | - |

### SDK 连接诊断

当 Claude SDK 返回 "exited with code" 错误时:
```
diagnoseConnectionFailure()
  → fetch(ANTHROPIC_BASE_URL)
  → 记录连接状态 (可达/不可达, 状态码)
```

---

## 扩展指南

### 添加新 MCP 服务器

编辑 `mcp-servers.json`:
```json
{
  "mcpServers": {
    "新服务器": {
      "command": "npx",
      "args": ["-y", "@package/name"]
    }
  }
}
```
运行时发送 `mcp reload` 即可生效。

### 添加新技能

在 `src/skill-manager.ts` 的 `registerBuiltinSkills()` 中添加:

```typescript
this.register({
  name: 'review',
  aliases: ['cr', 'code-review'],
  description: 'Code review mode',
  systemPrompt: `You are in CODE REVIEW mode. Focus on...`,
});
```

### 添加新工具格式化

在 `src/slack-handler.ts` 的 `formatToolUse()` switch 中添加 case:

```typescript
case 'NewTool':
  parts.push(`🆕 *Using NewTool:* ${input.someField}`);
  break;
```

### 支持新文件类型

在 `src/file-handler.ts` 的 `isTextFile()` 中添加 MIME 类型:

```typescript
const textTypes = [
  'text/',
  'application/json',
  // 添加新类型
  'application/toml',
];
```

### 持久化工作目录

当前工作目录存储在内存中。持久化需要:
1. 在 `WorkingDirectoryManager` 中添加文件/数据库读写
2. 构造函数中加载已保存配置
3. `setWorkingDirectory()` 中同步保存

---

## 类型定义

### 核心类型 (`src/types.ts`)

```typescript
interface ConversationSession {
  userId: string;
  channelId: string;
  threadTs?: string;
  sessionId?: string;        // Claude SDK session ID, 用于 resume
  isActive: boolean;
  lastActivity: Date;
  workingDirectory?: string;
}

interface WorkingDirectoryConfig {
  channelId: string;
  threadTs?: string;
  userId?: string;           // DM 时使用
  directory: string;         // 解析后的绝对路径
  setAt: Date;
}
```

### 其他关键类型

```typescript
// file-handler.ts
interface ProcessedFile {
  path: string;
  name: string;
  mimetype: string;
  isImage: boolean;
  isText: boolean;
  size: number;
  tempPath?: string;
}

// todo-manager.ts
interface Todo {
  id: string;
  content: string;
  status: 'pending' | 'in_progress' | 'completed';
  priority: 'high' | 'medium' | 'low';
}

// skill-manager.ts
interface SkillDefinition {
  name: string;
  aliases: string[];
  description: string;
  systemPrompt: string;
}

// mcp-manager.ts
type McpServerConfig = McpStdioServerConfig | McpSSEServerConfig | McpHttpServerConfig;

// claude-local-handler.ts
interface LocalQueryOptions {
  prompt: string;
  cwd?: string;
  sessionId?: string;
  abortController?: AbortController;
  appendSystemPrompt?: string;
  allowedTools?: string[];
  mcpConfigPath?: string;
  permissionMode?: string;
}

// permission-mcp-server.ts
interface PermissionResponse {
  behavior: 'allow' | 'deny';
  updatedInput?: any;
  message?: string;
}
```

---

## 依赖关系

### 生产依赖

| 包 | 版本 | 用途 |
|---|------|------|
| `@anthropic-ai/claude-agent-sdk` | ^0.2.34 | Claude Code SDK (query 函数和 SDKMessage 类型) |
| `@modelcontextprotocol/sdk` | ^1.13.2 | MCP Server/Client 实现 (权限服务器) |
| `@slack/bolt` | ^4.4.0 | Slack Bot 框架 (事件、动作、Socket Mode) |
| `dotenv` | ^16.6.0 | 环境变量加载 |
| `node-fetch` | ^3.3.2 | HTTP 请求 (文件下载) |

### 开发依赖

| 包 | 版本 | 用途 |
|---|------|------|
| `@types/node` | ^24.0.4 | Node.js 类型定义 |
| `tsx` | ^4.20.3 | TypeScript 直接执行 |
| `typescript` | ^5.8.3 | TypeScript 编译器 |

### 运行脚本

```bash
npm start      # tsx src/index.ts              (开发直接运行)
npm run dev    # tsx watch src/index.ts         (热重载)
npm run build  # tsc                           (编译到 dist/)
npm run prod   # node dist/index.js            (生产模式)
```

> **Windows 注意**: `tsc` 命令可能需要用 `node ./node_modules/typescript/bin/tsc` 替代。
