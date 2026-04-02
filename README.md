# GitHub Talent Hunter

> 找不到想要的开发者？让 AI 帮你从 GitHub 挖。

GitHub Talent Hunter 是一个基于 AI 的 GitHub 人才发现工具。通过自然语言描述你的需求，它会自动搜索、筛选、分析 GitHub 开发者，找出符合条件的技术人才。

## 功能特性

### 核心能力

- **智能搜索** — 用自然语言描述你的需求，AI 自动转换为 GitHub 搜索查询
- **多维度分析** — 分析开发者的技术栈、活跃度、项目质量、开源贡献
- **华人开发者识别** — 自动识别大厂背景、中文内容参与、开源双轨参与等特征
- **产品型开发者评分** — 识别同时做产品与开发的复合型人才（看 Twitter/Blog/产品数量等信号）
- **企业诊断** — 对招聘方进行需求诊断，确保找到真正匹配的人才

### 技术亮点

- **AgentPlace 原生** — 基于 AgentPlace 平台开发，充分利用 Agent 的推理能力
- **安全 Token 管理** — GitHub Token 仅存储于服务端，不进入 LLM 上下文
- **实时关键词提取** — 对话过程中自动提取关键技能词，展示在侧边栏
- **流式输出** — 打字机效果，实时展示 AI 分析进度

## 快速开始

### 前置要求

- Node.js 20+
- pnpm 9+
- GitHub Personal Access Token（[创建指南](https://github.com/settings/tokens)）

### 安装

```bash
# 克隆仓库
git clone https://github.com/ZeHidein/Github-Talent-Hunter.git
cd Github-Talent-Hunter

# 安装依赖
pnpm install

# 配置环境变量
cp .env.example .env
# 编辑 .env，填入你的 GitHub Token
```

### 启动

```bash
# 开发模式（前后端同时启动）
pnpm dev

# 仅后端
pnpm dev:server

# 仅前端
pnpm dev:client
```

访问 `http://localhost:3000` 即可使用。

### 获取 GitHub Token

1. 打开 [GitHub Settings → Personal access tokens](https://github.com/settings/tokens)
2. 点击 **Generate new token (classic)**
3. 勾选以下权限：
   - `repo`（私有仓库搜索）
   - `read:user`（读取用户信息）
   - `read:org`（读取组织信息）
4. 生成后填入应用设置页

## 项目结构

```
Github-Talent-Hunter/
├── agent-dev-client/          # 前端（Next.js App Router）
│   └── src/app/agent/
│       ├── components/        # Agent 界面组件
│       │   ├── GitHubTokenConfig.tsx   # Token 配置面板
│       │   ├── KeywordsSidebar.tsx     # 关键词侧边栏
│       │   ├── DiagnosisReport.tsx     # 诊断报告展示
│       │   └── TalentCard.tsx          # 人才卡片展示
│       └── page.tsx           # Agent 主页面
│
├── agent-dev-server/          # 后端（Express + tRPC）
│   └── src/
│       ├── bl/tools/impl/     # Agent 工具实现
│       │   └── github-talent.tool.ts   # GitHub 人才搜索工具
│       ├── trpc/routers/      # tRPC 路由
│       │   ├── github-token.router.ts  # Token 管理
│       │   └── keywords.router.ts      # 关键词存储
│       └── server.ts         # 服务端入口
│
└── .agentplace/               # AgentPlace 平台配置
    └── project-description.md # 项目描述
```

## 工作流程

```
用户描述需求
    ↓
AI 诊断需求（澄清模糊点）
    ↓
生成 GitHub 搜索查询
    ↓
执行搜索 + 获取用户详情
    ↓
多维度分析（技术栈/活跃度/华人特征/产品型）
    ↓
输出诊断报告
```

### 四阶段对话引导

1. **收集信息** — 了解用户是谁、要找什么样的人、预算/地点等约束
2. **诊断需求** — 明确用户的真实诉求，过滤掉不合理预期
3. **精准搜索** — 用 AI 优化搜索策略，覆盖更多候选者
4. **分析报告** — 多维度输出分析结果

## API 参考

### tRPC 路由

#### Token 管理

```
GET  /api/trpc/githubToken.get     — 获取当前 Token 状态
POST /api/trpc/githubToken.set     — 设置 Token
DEL  /api/trpc/githubToken.remove  — 删除 Token
```

#### 关键词管理

```
GET  /api/trpc/keywords.list       — 获取关键词列表
POST /api/trpc/keywords.save       — 保存新关键词
DEL  /api/trpc/keywords.remove     — 删除关键词
```

### Agent 工具

| 工具 | 说明 |
|------|------|
| `searchGitHubTalent` | 核心搜索工具，支持关键词、大厂、地区、活跃度等筛选条件 |
| `saveKeywords` | 将对话中的关键技能词保存到侧边栏 |

## 扩展开发

### 添加新的筛选维度

编辑 `agent-dev-server/src/bl/tools/impl/github-talent.tool.ts`，在 `filterByFeatures` 函数中添加新的筛选逻辑：

```typescript
function filterByFeatures(candidates: GitHubUser[], features: UserFeatures): GitHubUser[] {
  // 在此添加新的筛选条件
}
```

### 添加新的 Agent 工具

1. 在 `agent-dev-server/src/bl/tools/` 下创建新的 `.tool.ts` 文件
2. 实现工具的 schema 和 handler
3. 在 AgentPlace 平台注册工具

## 技术栈

| 层级 | 技术 |
|------|------|
| 前端框架 | Next.js 15 (App Router) |
| UI 组件 | shadcn/ui + Radix UI |
| 样式 | Tailwind CSS |
| 状态管理 | Zustand |
| 后端框架 | Express |
| API 层 | tRPC v11 |
| AI 集成 | AgentPlace SDK |
| 部署 | Docker |

## 相关项目

- [AgentPlace](https://agentplace.com) — AI Agent 开发与部署平台
- [ClawHub](https://clawhub.cn) — AI Agent 技能市场

## License

MIT
