import type React from 'react';
import { useState } from 'react';
import { registerComponent } from '@/app/lib/components/registry';
import type { AsArgumentsProps, ComponentConfigT } from '@/app/lib/types';
import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
} from 'recharts';
import {
  Building2,
  Target,
  AlertTriangle,
  Users,
  TrendingUp,
  ChevronDown,
  ChevronUp,
  Zap,
  Shield,
  Database,
  Code2,
  Rocket,
  Timer,
  Brain,
  Layers,
} from 'lucide-react';

const config: ComponentConfigT = {
  componentName: 'DiagnosisReport',
  type: 'component',
  isStreaming: false,
  name: 'DiagnosisReport',
  description:
    'Display organizational capability diagnosis report with radar chart visualization, gap analysis, and talent recommendations. Use after completing company Q&A to show diagnostic results.',
  isStrictSchema: false,
  parameters: {
    type: 'object',
    properties: {
      companyName: { type: 'string', description: 'Company name' },
      industry: { type: 'string', description: 'Industry sector' },
      stage: { type: 'string', description: 'Company stage (startup/growth/mature/transformation)' },
      teamSize: { type: 'string', description: 'Team size description' },
      summary: { type: 'string', description: 'Brief company overview summary' },
      capabilities: {
        type: 'array',
        description: 'Array of capability assessments',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Capability dimension name' },
            nameEn: { type: 'string', description: 'English key: infrastructure/architecture/engineering/data/security/talent/innovation/delivery' },
            score: { type: 'number', description: 'Score 1-10' },
            level: { type: 'string', description: 'Level: critical/needs_improvement/strong' },
            description: { type: 'string', description: 'Brief explanation of this score' },
          },
        },
      },
      gaps: {
        type: 'array',
        description: 'Key identified gaps to address',
        items: {
          type: 'object',
          properties: {
            area: { type: 'string', description: 'Gap area name' },
            severity: { type: 'string', description: 'critical/moderate/minor' },
            description: { type: 'string', description: 'Gap description' },
            talentProfile: { type: 'string', description: 'Recommended talent profile to fill this gap' },
            searchKeywords: { type: 'string', description: 'GitHub search keywords for matching talent' },
          },
        },
      },
      overallScore: { type: 'number', description: 'Overall score out of 100' },
    },
    additionalProperties: false,
    required: ['companyName', 'capabilities', 'gaps', 'overallScore'],
  },
};

interface Capability {
  name: string;
  nameEn?: string;
  score: number;
  level: string;
  description: string;
}

interface Gap {
  area: string;
  severity: string;
  description: string;
  talentProfile: string;
  searchKeywords: string;
}

type DiagnosisReportProps = {
  companyName: string;
  industry?: string;
  stage?: string;
  teamSize?: string;
  summary?: string;
  capabilities: Capability[];
  gaps: Gap[];
  overallScore: number;
};

const DIMENSION_ICONS: Record<string, React.ReactNode> = {
  infrastructure: <Layers className="w-4 h-4" />,
  architecture: <Code2 className="w-4 h-4" />,
  engineering: <Zap className="w-4 h-4" />,
  data: <Database className="w-4 h-4" />,
  security: <Shield className="w-4 h-4" />,
  talent: <Users className="w-4 h-4" />,
  innovation: <Rocket className="w-4 h-4" />,
  delivery: <Timer className="w-4 h-4" />,
};

const SEVERITY_STYLES: Record<string, { bg: string; border: string; text: string; dot: string }> = {
  critical: {
    bg: 'bg-destructive/10',
    border: 'border-destructive/30',
    text: 'text-destructive',
    dot: 'bg-destructive',
  },
  moderate: {
    bg: 'bg-chart-4/10',
    border: 'border-chart-4/30',
    text: 'text-chart-4',
    dot: 'bg-chart-4',
  },
  minor: {
    bg: 'bg-primary/10',
    border: 'border-primary/30',
    text: 'text-primary',
    dot: 'bg-primary',
  },
};

const LEVEL_COLORS: Record<string, string> = {
  critical: 'text-destructive',
  needs_improvement: 'text-chart-4',
  strong: 'text-primary',
};

const DiagnosisReportComponent: React.FC<AsArgumentsProps<DiagnosisReportProps>> = ({
  argumentsProps,
  handleSendMessage,
}) => {
  const {
    companyName,
    industry,
    stage,
    teamSize,
    summary,
    capabilities = [],
    gaps = [],
    overallScore,
  } = argumentsProps;

  const [expandedGap, setExpandedGap] = useState<number | null>(null);

  // Prepare radar chart data
  const radarData = capabilities.map((cap) => ({
    dimension: cap.name,
    score: cap.score,
    fullMark: 10,
  }));

  const getScoreColor = (score: number) => {
    if (score >= 7) return 'text-primary';
    if (score >= 4) return 'text-chart-4';
    return 'text-destructive';
  };

  const getOverallGrade = (score: number) => {
    if (score >= 80) return { grade: 'A', label: '卓越', color: 'text-primary' };
    if (score >= 60) return { grade: 'B', label: '良好', color: 'text-chart-2' };
    if (score >= 40) return { grade: 'C', label: '待提升', color: 'text-chart-4' };
    return { grade: 'D', label: '亟需改善', color: 'text-destructive' };
  };

  const { grade, label, color } = getOverallGrade(overallScore);

  const handleSearchTalent = (gap: Gap) => {
    handleSendMessage({
      instruction: `请根据以下人才需求搜索GitHub人才：${gap.talentProfile}，关键词：${gap.searchKeywords}`,
    });
  };

  return (
    <div className="w-full max-w-2xl mx-auto space-y-4 pb-12" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
      {/* Header */}
      <div className="rounded-xl border border-border bg-card/60 backdrop-blur-sm p-5">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <Building2 className="w-5 h-5 text-primary" />
              <h2 className="text-lg font-semibold text-foreground" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                {companyName}
              </h2>
            </div>
            <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
              {industry && (
                <span className="px-2 py-0.5 rounded-full bg-muted border border-border text-muted-foreground">{industry}</span>
              )}
              {stage && (
                <span className="px-2 py-0.5 rounded-full bg-muted border border-border text-muted-foreground">{stage}</span>
              )}
              {teamSize && (
                <span className="px-2 py-0.5 rounded-full bg-muted border border-border text-muted-foreground">{teamSize}</span>
              )}
            </div>
            {summary && (
              <p className="mt-3 text-sm text-muted-foreground leading-relaxed">{summary}</p>
            )}
          </div>
          {/* Overall Score */}
          <div className="ml-4 flex flex-col items-center">
            <div className="relative w-16 h-16 flex items-center justify-center">
              <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 64 64">
                <circle cx="32" cy="32" r="28" fill="none" stroke="hsl(var(--border))" strokeWidth="3" />
                <circle
                  cx="32"
                  cy="32"
                  r="28"
                  fill="none"
                  stroke="hsl(var(--primary))"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeDasharray={`${(overallScore / 100) * 175.9} 175.9`}
                />
              </svg>
              <span className={`text-xl font-bold ${color}`} style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                {grade}
              </span>
            </div>
            <span className={`text-xs mt-1 ${color} font-medium`}>{label}</span>
            <span className="text-xs text-muted-foreground">{overallScore}/100</span>
          </div>
        </div>
      </div>

      {/* Radar Chart */}
      {radarData.length > 0 && (
        <div className="rounded-xl border border-border bg-card/60 backdrop-blur-sm p-5">
          <div className="flex items-center gap-2 mb-3">
            <Brain className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-semibold text-foreground" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
              能力雷达图
            </h3>
          </div>
          <div className="w-full h-64">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={radarData} cx="50%" cy="50%" outerRadius="70%">
                <PolarGrid stroke="hsl(var(--border))" />
                <PolarAngleAxis
                  dataKey="dimension"
                  tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
                />
                <PolarRadiusAxis
                  angle={90}
                  domain={[0, 10]}
                  tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }}
                  tickCount={6}
                />
                <Radar
                  name="Score"
                  dataKey="score"
                  stroke="hsl(var(--primary))"
                  fill="hsl(var(--primary))"
                  fillOpacity={0.2}
                  strokeWidth={2}
                />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Capability Scores */}
      <div className="rounded-xl border border-border bg-card/60 backdrop-blur-sm p-5">
        <div className="flex items-center gap-2 mb-4">
          <Target className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-semibold text-foreground" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
            维度评分
          </h3>
        </div>
        <div className="space-y-3">
          {capabilities.map((cap, idx) => (
            <div key={idx} className="flex items-center gap-3">
              <div className="w-6 h-6 flex items-center justify-center text-muted-foreground">
                {DIMENSION_ICONS[cap.nameEn || ''] || <Zap className="w-4 h-4" />}
              </div>
              <span className="text-sm text-foreground w-24 shrink-0">{cap.name}</span>
              <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-700"
                  style={{
                    width: `${(cap.score / 10) * 100}%`,
                    background:
                      cap.score >= 7
                        ? 'hsl(var(--primary))'
                        : cap.score >= 4
                          ? 'hsl(var(--chart-4))'
                          : 'hsl(var(--destructive))',
                  }}
                />
              </div>
              <span
                className={`text-sm font-mono font-semibold w-8 text-right ${getScoreColor(cap.score)}`}
              >
                {cap.score}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Gap Analysis */}
      {gaps.length > 0 && (
        <div className="rounded-xl border border-border bg-card/60 backdrop-blur-sm p-5">
          <div className="flex items-center gap-2 mb-4">
            <AlertTriangle className="w-4 h-4 text-chart-4" />
            <h3 className="text-sm font-semibold text-foreground" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
              差距分析与人才建议
            </h3>
          </div>
          <div className="space-y-3">
            {gaps.map((gap, idx) => {
              const style = SEVERITY_STYLES[gap.severity] || SEVERITY_STYLES.moderate;
              const isExpanded = expandedGap === idx;
              return (
                <div
                  key={idx}
                  className={`rounded-lg border ${style.border} ${style.bg} overflow-hidden`}
                >
                  <button
                    type="button"
                    onClick={() => setExpandedGap(isExpanded ? null : idx)}
                    className="w-full flex items-center justify-between p-3 text-left"
                  >
                    <div className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full ${style.dot}`} />
                      <span className="text-sm font-medium text-foreground">{gap.area}</span>
                      <span className={`text-xs px-1.5 py-0.5 rounded ${style.text} ${style.bg} border ${style.border}`}>
                        {gap.severity === 'critical' ? '紧急' : gap.severity === 'moderate' ? '中等' : '轻微'}
                      </span>
                    </div>
                    {isExpanded ? (
                      <ChevronUp className="w-4 h-4 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-muted-foreground" />
                    )}
                  </button>
                  {isExpanded && (
                    <div className="px-3 pb-3 space-y-2">
                      <p className="text-sm text-muted-foreground">{gap.description}</p>
                      <div className="flex items-center gap-2 pt-1">
                        <Users className="w-3.5 h-3.5 text-primary" />
                        <span className="text-xs text-primary font-medium">推荐人才：{gap.talentProfile}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleSearchTalent(gap)}
                        className="mt-2 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/10 border border-primary/20 text-primary text-xs font-medium hover:bg-primary/20 transition-colors"
                      >
                        <TrendingUp className="w-3.5 h-3.5" />
                        搜索匹配人才
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default registerComponent(config)(function DiagnosisReport(
  props: AsArgumentsProps<DiagnosisReportProps>,
) {
  return <DiagnosisReportComponent {...props} />;
});
