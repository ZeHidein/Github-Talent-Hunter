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


GitHub API 限制
无认证: 10 请求/分钟
有认证: 30 请求/分钟（使用 GITHUB_TOKEN）
搜索配额: 每分钟最多 10 次搜索请求

🙏 致谢
AgentPlace — 无代码 AI 应用构建平台
GitHub API — 人才数据源
Google Gemini — 大语言模型支持
Recharts — 数据可视化组件
