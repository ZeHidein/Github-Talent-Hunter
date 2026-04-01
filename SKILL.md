---
name: github-talent-hunter
description: AI 驱动的 GitHub 技术人才招聘工具。支持企业诊断、人才搜索/分析、华人特性分析（大厂背景/双轨参与）、以及产品型开发者识别（Building in Public）。基于 Kimi 2.5，零依赖 Python CLI。
version: 1.2.3
---

# GitHub Talent Hunter v1.2.3

AI 驱动的技术人才招聘 Agent。基于 **Kimi 2.5** (`kimi-coding/k2p5`)，支持 **华人开发者特性分析** 和 **产品型开发者识别 (Building in Public)**。

## 核心能力

1. **企业智能诊断** - 3 阶段结构化对话了解企业技术现状与人才需求
2. **GitHub 人才搜索** - 支持多维度筛选的精准搜索
3. **人才档案分析** - 深度分析开发者的开源贡献和技术栈
4. **华人特性分析** ⭐ - 检测大厂背景、双轨参与、中文内容
5. **产品型开发者识别** 🚀 - 识别 Building in Public 型全能开发者
6. **诊断报告生成** - 8 维度能力评估模型

## 快速开始

### 环境配置

```bash
# 必需：Kimi API Key（仅 diagnose 命令需要）
export KIMI_API_KEY="your-kimi-api-key"

# 可选但强烈建议：GitHub Token
export GITHUB_TOKEN="your-github-token"
```

### 使用方法

```bash
# 搜索人才
python3 scripts/github-talent-hunter search "fullstack developer" \
    --language typescript \
    --location china

# 分析指定用户
python3 scripts/github-talent-hunter analyze octocat

# 启用华人特性分析
python3 scripts/github-talent-hunter analyze ruanyf --chinese-focus

# 启用产品型开发者识别
python3 scripts/github-talent-hunter analyze Vonng --product-maker

# 企业诊断
python3 scripts/github-talent-hunter diagnose
```

## 与原项目的差异

| 项目 | 原项目 | 本 Skill |
|------|--------|----------|
| LLM | Google Gemini | **Kimi 2.5** |
| 前端 | React Web UI | **CLI 工具** |
| 部署 | Node.js 全栈 | **Python 脚本** |
| 依赖 | npm 依赖 | **仅标准库** |
| 华人特性 | 无 | **--chinese-focus** ⭐ |
| 产品型识别 | 无 | **--product-maker** 🚀 |

## Changelog

### v1.2.3
- 📝 精简 description，优化 clawhub 显示

### v1.2.2
- 📚 更新 SKILL.md：完善核心能力列表、差异对比表

### v1.2.1
- 🔧 修复版本号不一致问题
- 🔧 补上 `--product-maker` 功能
- 🔧 统一企业诊断为"3阶段"
- 🔧 更新 Kimi 模型为 `kimi-coding/k2p5`
- 🔧 添加 API 指数退避重试机制

### v1.2.0
- ✨ 新增 `--product-maker` 产品型开发者识别功能

### v1.1.0
- ✨ 新增 `--chinese-focus` 华人特性分析功能

### v1.0.0
- 🎉 初始版本发布
