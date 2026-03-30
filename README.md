# 🔍 GitHub Talent Hunter / GitHub 人才猎手

AI 驱动的技术人才招聘 Agent —— 通过结构化对话诊断企业能力短板，智能匹配 GitHub 顶尖人才。

[![AgentPlace](https://img.shields.io/badge/Built%20with-AgentPlace-blueviolet)](https://agentplace.ai)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-18+-61DAFB)](https://react.dev/)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

---

## ✨ 核心功能

### 🏢 企业智能问诊
通过 4 阶段结构化对话深度了解企业：
- **基础画像** — 公司规模、行业、发展阶段
- **技术架构** — 技术栈、架构模式、DevOps 成熟度
- **组织文化** — 团队结构、工程文化、协作方式
- **痛点目标** — 技术短板、业务增长、招聘需求

### 📊 组织能力诊断
基于 **8 维度评估模型** 生成专业诊断报告：

| 维度 | 评估内容 | 对应人才 |
|------|---------|---------|
| 🏗️ 技术基础设施 | 云服务、CI/CD、监控体系 | DevOps/SRE |
| 🏛️ 架构设计能力 | 可扩展性、技术选型 | 架构师 |
| ⚡ 工程质量 | 代码质量、测试覆盖 | QA/工程效率专家 |
| 🧠 数据智能 | 数据分析、AI/ML 应用 | 数据工程师 |
| 🔒 安全合规 | 安全实践、数据保护 | 安全工程师 |
| 👥 团队能力密度 | 技术水平、学习氛围 | Tech Lead |
| 🚀 创新能力 | 技术探索、开源贡献 | 创新工程师 |
| ⏱️ 交付效率 | 迭代速度、响应能力 | 工程效率专家 |

### 🔎 GitHub 人才搜索
智能匹配算法将诊断结果转化为精准的 GitHub 搜索策略：
- 支持关键词、语言、地域、仓库数、粉丝数筛选
- 自动提取用户热门仓库和编程语言统计
- 生成可视化人才卡片，一键查看详细档案

---

## 🎁 双版本可用

本项目提供**两个版本**，满足不同使用场景：

### 版本对比

| 维度 | Web UI 版本（本仓库） | CLI Skill 版本（ClawHub） |
|------|---------------------|---------------------------|
| **定位** | React Web 应用 | OpenClaw CLI 工具 |
| **界面** | 可视化对话界面 + 雷达图 | 命令行交互 |
| **技术栈** | React + TypeScript + Node.js | Python（仅标准库） |
| **安装** | `npm install` + 配置环境变量 | `clawhub install github-talent-hunter` |
| **AI 模型** | Google Gemini | **Kimi 2.5**（更适合中文） |
| **华人特性** | ❌ 无 | ✅ `--chinese-focus` 大厂背景检测 |
| **适用场景** | 团队协作、可视化分析 | 快速搜索、自动化脚本 |
| **代码量** | ~5000 行 | ~800 行（单文件版） |

### 如何选择？

**使用本仓库（Web UI）如果你：**
- 需要可视化界面和雷达图
- 团队协作，非技术人员也要使用
- 希望看到直观的诊断报告
- 已经配置了 Gemini API Key

**使用 ClawHub Skill 如果你：**
- 偏好命令行操作
- 需要快速搜索、批量处理
- 想找华人开发者（大厂背景检测）
- 已经是 OpenClaw 用户

### 🔗 ClawHub Skill

```bash
# 一键安装
clawhub install github-talent-hunter

# 使用示例
python3 -m github-talent-hunter search "backend developer" \
    --language go \
    --chinese-focus
```

**Skill 链接**: https://clawhub.ai/skills/github-talent-hunter

---

## 🚀 快速开始

### 环境要求
- Node.js 18+
- npm / yarn / pnpm
- GitHub API Token（可选，用于更高配额）

### 安装

```bash
# 克隆项目
git clone https://github.com/ZeHidein/Github-Talent-Hunter.git
cd Github-Talent-Hunter

# 安装依赖
cd agent-dev-server && npm install
cd ../agent-dev-client && npm install
```

### 配置

1. 复制环境变量文件：
```bash
cp agent-dev-server/.env.example agent-dev-server/.env
```

2. 编辑 `.env` 文件，添加你的配置：
```env
# 必需
GOOGLE_API_KEY=your_gemini_api_key

# 可选（提高 GitHub API 配额）
GITHUB_TOKEN=your_github_personal_access_token
```

### 启动

```bash
# 启动后端（在 agent-dev-server 目录）
npm run dev

# 启动前端（在 agent-dev-client 目录）
npm run dev
```

访问 http://localhost:3000 开始使用。

---

## 📖 使用指南

### 1️⃣ 开始对话
启动应用后，Agent 会自动问候并介绍其功能。你可以直接描述你的招聘需求，例如：
> "我们是一家做 AI 基础设施的初创公司，想找有 Kubernetes 和 Rust 经验的工程师。"

### 2️⃣ 完成企业问诊
Agent 会引导你完成 4 阶段信息采集：
```
┌─────────────────────────────────────────┐
│  阶段 1: 企业基础画像                    │
│  阶段 2: 技术架构与能力                  │
│  阶段 3: 组织与文化                      │
│  阶段 4: 痛点与目标                      │
└─────────────────────────────────────────┘
```

### 3️⃣ 查看诊断报告
完成问诊后，Agent 会生成包含以下内容的诊断报告：
- 🎯 **能力雷达图** — 8 维度可视化评分
- 📈 **维度评分** — 详细的各项能力得分
- ⚠️ **差距分析** — 识别关键短板并推荐人才画像
- 🔍 **一键搜索** — 点击即可搜索匹配的 GitHub 人才

### 4️⃣ 浏览人才卡片
查看搜索结果：
- 👤 开发者档案（头像、简介、位置、公司）
- 📊 统计数据（粉丝数、仓库数、加入时间）
- 🏷️ 技术标签（主要编程语言）
- 📁 热门项目（Stars、Forks、语言）

---

## 🏗️ 技术架构

```
┌─────────────────────────────────────────────────────────┐
│                    GitHub Talent Hunter                 │
├─────────────────────────────────────────────────────────┤
│  Frontend (React + TypeScript)                         │
│  ├── DiagnosisReport    # 诊断报告组件（雷达图）        │
│  ├── TalentCard         # 人才卡片组件                 │
│  └── Chat Interface     # 对话界面                     │
├─────────────────────────────────────────────────────────┤
│  Backend (Node.js + AgentPlace)                        │
│  ├── Company Diagnosis Skill  # 企业诊断 Skill         │
│  ├── SearchGitHubTalent Tool  # GitHub 搜索工具        │
│  └── LLM Orchestration        # 对话编排               │
├─────────────────────────────────────────────────────────┤
│  External APIs                                         │
│  ├── GitHub REST API    # 用户搜索与档案获取           │
│  └── Google Gemini      # 自然语言处理与诊断分析       │
└─────────────────────────────────────────────────────────┘
```

---

## ⚙️ 配置说明

### GitHub API 限制
- **无认证**: 10 请求/分钟
- **有认证**: 30 请求/分钟（使用 `GITHUB_TOKEN`）
- **搜索配额**: 每分钟最多 10 次搜索请求

---

## 🤝 贡献指南

欢迎提交 Issue 和 PR！

### 相关项目
- 🔗 [ClawHub Skill](https://clawhub.ai/skills/github-talent-hunter) — Python CLI 版本，支持 `--chinese-focus` 华人特性分析

---

## 🙏 致谢

- [AgentPlace](https://agentplace.ai) — 无代码 AI 应用构建平台
- [GitHub API](https://docs.github.com/en/rest) — 人才数据源
- [Google Gemini](https://deepmind.google/technologies/gemini/) — 大语言模型支持
- [Recharts](https://recharts.org/) — 数据可视化组件
- [OpenClaw](https://openclaw.ai) — CLI Skill 生态支持
