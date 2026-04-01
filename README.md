# GitHub Talent Hunter v1.2.3

AI 驱动的 GitHub 技术人才招聘工具。支持企业智能诊断、GitHub 人才搜索/分析、华人开发者特性分析（大厂背景/双轨参与）、以及产品型开发者识别（Building in Public）。基于 Kimi 2.5，零依赖 Python CLI。

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
# 无 Token：10 请求/分钟 ｜ 有 Token：30 请求/分钟
export GITHUB_TOKEN="your-github-token"
```

### 使用方法

```bash
# 1. 企业诊断（交互式）
python3 scripts/github-talent-hunter diagnose

# 2. 搜索人才
python3 scripts/github-talent-hunter search "fullstack developer" \
    --language typescript \
    --location china

# 3. 分析指定用户
python3 scripts/github-talent-hunter analyze octocat

# 4. 启用华人特性分析
python3 scripts/github-talent-hunter search "backend developer" \
    --language java \
    --chinese-focus

# 5. 启用产品型开发者识别（Building in Public）🚀 NEW
python3 scripts/github-talent-hunter search "fullstack" --product-maker -n 10
python3 scripts/github-talent-hunter analyze Vonng --product-maker

# 6. 单文件版本（无需安装）
python3 scripts/github-talent-hunter-standalone.py diagnose
```

## 📦 安装方式

### 方式一：ClawHub（推荐）

```bash
clawhub install github-talent-hunter
```

🔗 https://clawhub.com/skills/github-talent-hunter

### 方式二：GitHub 克隆

```bash
git clone https://github.com/ZeHidein/github-talent-hunter.git
cd github-talent-hunter/scripts
chmod +x github-talent-hunter
```

## 功能详解

### 🔍 人才搜索

```bash
usage: search [-h] [-l LANGUAGE] [--location LOCATION] [-f FOLLOWERS] 
              [-r REPOS] [-n LIMIT] [--chinese-focus] [--product-maker] query
```

**参数说明：**
- `-l, --language`：编程语言（如 typescript, go, python）
- `--location`：地理位置（如 china, beijing）
- `-f, --followers`：粉丝数条件（如 ">1000"）
- `--chinese-focus`：启用华人特性分析
- `--product-maker`：启用产品型开发者识别

### 🇨🇳 华人特性分析（--chinese-focus）

专为识别华人开发者设计：

| 特征 | 检测方式 | 输出 |
|------|----------|------|
| **大厂背景** | 邮箱域名、公司字段匹配 | 阿里、腾讯、字节、华为等 20+ 大厂 |
| **双轨参与指数** | 公司项目星标 vs 个人项目星标 | 0-1 分值，>0.7 为双轨活跃 |
| **中文内容** | Bio、项目简介中的中文字符 | 中文简介、双语项目 |
| **技术栈偏好** | 语言使用频率加权 | Java(3.3x)、Go(1.5x)、Python(1.2x) |

### 🚀 产品型开发者识别（--product-maker）

识别 "Building in Public" 型全能开发者：

| 维度 | 评估内容 | 权重 |
|------|----------|------|
| **产品落地** | 项目有独立 homepage | +30 |
| **公开分享** | 有 Twitter 账号 | +20 |
| **品牌建设** | 有个人网站 | +15 |
| **技术影响力** | GitHub Stars | +0.1/星 (上限20) |
| **持续迭代** | 最近一年活跃项目数 | +10 (3+项目) |
| **技术广度** | 多语言技术栈 | +5 |

**评级标准：**
- ≥60分：🚀 全能型开发者
- ≥40分：⭐ 潜力型开发者
- ≥20分：📊 技术型开发者

## 示例输出

### 产品型开发者分析

```
## 👤 Feng Ruohang

**GitHub:** @Vonng | **位置:** Singapore | **公司:** Pigsty

**粉丝:** 1963 | **仓库:** 104 | **总星标:** 26168

### 🚀 产品型开发者分析 (Building in Public)

🎯 产品型分析: 🚀 全能型开发者 (Building in Public) (得分: 110.0/100)
   关键信号: Twitter(@RonVonng), 个人网站, 7个产品落地, GitHub Pages, 高影响力(⭐26168), 持续活跃, 多语言技术栈
   🐦 Twitter: https://twitter.com/RonVonng
   🌐 个人网站: https://vonng.com/en
   📦 产品项目:
      - ddia: https://ddia.vonng.com (⭐ 22845)
      - blog: http://blog.vonng.com/ (⭐ 12)
```

## 技术栈

- **LLM**：Kimi 2.5 (`kimi-coding/k2p5`)
- **数据源**：GitHub API
- **语言**：Python 3.8+（仅标准库，零依赖）
- **架构**：CLI 工具 + 模块化脚本

## 项目结构

```
github-talent-hunter/
├── scripts/
│   ├── github-talent-hunter              # 主 CLI（完整功能）
│   ├── github-talent-hunter-standalone.py # 单文件版本
│   ├── chinese_focus.py                   # 华人特性分析模块
│   ├── github_product_maker_finder.py     # 产品型开发者识别
│   ├── kimim_client.py                    # Kimi API 封装
│   ├── github_client.py                   # GitHub API 封装
│   ├── diagnosis.py                       # 企业诊断逻辑
│   └── archive/                           # 调试文件归档
├── references/
│   └── api-docs.md                        # API 参考文档
├── docs/
│   └── filter-strategy.md                 # 筛选策略文档
├── SKILL.md                               # OpenClaw Skill 配置
├── AGENT_USAGE.md                         # 外部 Agent 使用指南
├── XIAOHONGSHU_COPY.md                    # 小红书宣传文案
└── README.md                              # 本文件
```

## Changelog

### v1.2.3
- 📝 精简 description，优化 clawhub 显示
- 📚 完善 README 文档

### v1.2.2
- 📚 更新 SKILL.md：完善核心能力列表、差异对比表、示例输出
- 🔧 更新独立版模型名为 `kimi-coding/k2p5`

### v1.2.1
- 🔧 修复版本号不一致问题
- 🔧 补上 `--product-maker` 功能（search 和 analyze 命令都支持）
- 🔧 统一企业诊断为"3阶段"
- 🔧 更新 Kimi 模型为 `kimi-coding/k2p5`
- 🔧 清理调试文件至 archive/ 目录
- 🔧 添加 API 指数退避重试机制

### v1.2.0
- ✨ 新增 `--product-maker` 产品型开发者识别功能
- 🔍 基于 "Building in Public" 理念，识别全能型开发者
- 📊 产品型评分模型（满分100）：产品落地+公开分享+技术影响力
- 🐦 利用 Twitter 账号作为筛选器，命中率94%

### v1.1.0
- ✨ 新增 `--chinese-focus` 华人特性分析功能
- 🔍 支持检测 20+ 大厂背景
- 📊 新增双轨参与指数计算
- 🇨🇳 支持中文内容识别

### v1.0.0
- 🎉 初始版本发布
- 🤖 基于 Kimi 2.5 的企业智能诊断
- 🔍 GitHub 人才搜索与分析
- 📊 8 维度能力评估模型

## 与原项目的差异

本项目基于 [jerryjliu/portfolio_manager](https://github.com/jerryjliu/portfolio_manager) 改造：

| 项目 | 原项目 | 本项目 |
|------|--------|--------|
| LLM | Google Gemini | **Kimi 2.5** |
| 前端 | React Web UI | **CLI 工具** |
| 部署 | Node.js 全栈 | **Python 脚本** |
| 依赖 | npm 依赖 | **仅标准库** |
| 华人特性 | 无 | **--chinese-focus** ⭐ |
| 产品型识别 | 无 | **--product-maker** 🚀 |

## License

MIT

## 相关链接

- **ClawHub Skill**: https://clawhub.com/skills/github-talent-hunter
- **GitHub 仓库**: https://github.com/ZeHidein/github-talent-hunter
- **OpenClaw 官网**: https://openclaw.ai
- **Kimi API**: https://platform.moonshot.cn/
- **GitHub API**: https://docs.github.com/en/rest
