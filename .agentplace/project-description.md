# GitHub 人才猎手 (GitHub Talent Scout)

## 概述
一个专业的 GitHub 人才猎聘 AI Agent，通过结构化对话了解企业状况，诊断组织能力短板，并从 GitHub 上匹配合适的技术人才。

## 核心工作流
1. **企业问诊**：通过 4 阶段对话收集企业信息（基础画像→技术架构→组织文化→痛点目标）
2. **能力诊断**：基于 8 维度评估模型（基础设施、架构、工程质量、数据智能、安全、人才密度、创新、交付）生成诊断报告
3. **人才匹配**：根据诊断结果搜索 GitHub，推荐匹配的技术人才

## 技术架构

### 后端工具
- `SearchGitHubTalentTool` — 使用 GitHub REST API 搜索用户，获取详细 profile + top repos

### 前端组件
- `DiagnosisReport` — 诊断报告组件（雷达图 + 维度评分 + 差距分析 + 人才建议按钮）
- `TalentCard` — 人才展示组件（头像、简介、语言标签、热门项目、统计数据）

### 技能
- `company-diagnosis` — 企业组织能力诊断框架（autoload），包含信息采集维度、评估模型和人才匹配逻辑

### 主题
- 深色科技风（GitHub 灵感），深海军蓝底 + 绿色强调色
- JetBrains Mono 标题字体 + Plus Jakarta Sans 正文
- 微妙网格图案背景 + 毛玻璃效果卡片

### 模型
- Claude Sonnet 4.6（默认），适合复杂的多轮对话和组织分析推理

## 语言
- 主要语言：中文
- 技术术语保留英文
