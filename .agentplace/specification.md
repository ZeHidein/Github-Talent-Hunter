# GitHub Talent Scout Agent - Technical Specification

## Overview
A professional GitHub talent recruitment agent that conducts structured Q&A with employers to understand their company, diagnoses organizational capability gaps, and matches suitable GitHub talent.

## User Flow
1. **Welcome**: Dark tech-themed UI. Agent greets, explains its purpose
2. **Company Discovery**: Agent conducts conversational Q&A covering:
   - Core products & technology stack
   - Business model & market position
   - Team structure & engineering culture
   - Current pain points & hiring goals
3. **Diagnosis**: Agent analyzes company info to identify capability gaps (via `DiagnosisReport` component)
4. **Talent Matching**: Agent searches GitHub for relevant talent, presents results (via `TalentCard` component)

## Theme
- Dark theme with GitHub-inspired aesthetic (deep navy/slate + green accent)
- Monospace display font (JetBrains Mono) + clean body font (Plus Jakarta Sans)
- Professional, developer-tools feel

## Components

### 1. DiagnosisReport
- Shows organizational capability analysis with radar/bar visualization
- Sections: company overview, capability scores, identified gaps, recommended talent profiles
- Props: companyName, industry, capabilities (array of {name, score, maxScore}), gaps (array), recommendations (array)

### 2. TalentCard
- Displays a list of matched GitHub talent profiles
- Shows: avatar, username, bio, location, repos, followers, languages, match reason
- Props: talents (array of talent objects), searchQuery

## Backend Tools

### searchGitHubTalent
- Uses GitHub REST API (no auth, public search)
- Search users by: keywords (language, topic), location, min repos/followers
- Returns: username, avatar, bio, repos, followers, html_url, top languages
- Fetches user details + repos for richer profiles

## Skill

### company-diagnosis
- Autoload skill with structured company assessment framework
- Covers: technology capability, engineering culture, growth potential, organizational maturity
- Provides scoring rubric for capability assessment

## Instruction
- Role: GitHub人才猎手 (GitHub Talent Scout)
- Language: Chinese (primary) with English for technical terms
- Guidelines: structured Q&A flow, diagnosis methodology, talent matching criteria
- Components: DiagnosisReport, TalentCard referenced by name
