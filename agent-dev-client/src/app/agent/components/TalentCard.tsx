import type React from 'react';
import { useState } from 'react';
import { registerComponent } from '@/app/lib/components/registry';
import type { AsArgumentsProps, ComponentConfigT } from '@/app/lib/types';
import {
  MapPin,
  Star,
  GitFork,
  Users,
  ExternalLink,
  Code2,
  Building2,
  Calendar,
  BookOpen,
  ChevronDown,
  ChevronUp,
  Search,
} from 'lucide-react';

const config: ComponentConfigT = {
  componentName: 'TalentCard',
  type: 'component',
  isStreaming: false,
  name: 'TalentCard',
  description:
    'Display a list of matched GitHub talent profiles with avatars, bio, languages, repos, and contribution metrics. Use after searching GitHub talent to present results.',
  isStrictSchema: false,
  parameters: {
    type: 'object',
    properties: {
      searchQuery: { type: 'string', description: 'The search query used' },
      totalCount: { type: 'number', description: 'Total matching users on GitHub' },
      matchReason: { type: 'string', description: 'Why these talents were selected (context from diagnosis)' },
      talents: {
        type: 'array',
        description: 'Array of talent profiles',
        items: {
          type: 'object',
          properties: {
            login: { type: 'string' },
            name: { type: 'string' },
            avatarUrl: { type: 'string' },
            htmlUrl: { type: 'string' },
            bio: { type: 'string' },
            company: { type: 'string' },
            location: { type: 'string' },
            publicRepos: { type: 'number' },
            followers: { type: 'number' },
            following: { type: 'number' },
            blog: { type: 'string' },
            createdAt: { type: 'string' },
            topLanguages: { type: 'array', items: { type: 'string' } },
            topRepos: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  description: { type: 'string' },
                  language: { type: 'string' },
                  stars: { type: 'number' },
                  forks: { type: 'number' },
                  url: { type: 'string' },
                },
              },
            },
          },
        },
      },
    },
    additionalProperties: false,
    required: ['talents'],
  },
};

interface TalentRepo {
  name: string;
  description: string | null;
  language: string | null;
  stars: number;
  forks: number;
  url: string;
}

interface Talent {
  login: string;
  name: string | null;
  avatarUrl: string;
  htmlUrl: string;
  bio: string | null;
  company: string | null;
  location: string | null;
  publicRepos: number;
  followers: number;
  following: number;
  blog: string | null;
  createdAt: string;
  topLanguages: string[];
  topRepos: TalentRepo[];
}

type TalentCardProps = {
  searchQuery?: string;
  totalCount?: number;
  matchReason?: string;
  talents: Talent[];
};

const LANG_COLORS: Record<string, string> = {
  JavaScript: '#f1e05a',
  TypeScript: '#3178c6',
  Python: '#3572a5',
  Go: '#00add8',
  Rust: '#dea584',
  Java: '#b07219',
  'C++': '#f34b7d',
  C: '#555555',
  Ruby: '#701516',
  PHP: '#4f5d95',
  Swift: '#ffac45',
  Kotlin: '#a97bff',
  Dart: '#00b4ab',
  Shell: '#89e051',
  Scala: '#c22d40',
  Elixir: '#6e4a7e',
  Haskell: '#5e5086',
  Vue: '#41b883',
  CSS: '#563d7c',
  HTML: '#e34c26',
};

const formatCount = (n: number): string => {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
};

const formatDate = (dateStr: string): string => {
  try {
    const d = new Date(dateStr);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  } catch {
    return dateStr;
  }
};

const TalentCardComponent: React.FC<AsArgumentsProps<TalentCardProps>> = ({
  argumentsProps,
}) => {
  const { searchQuery, totalCount, matchReason, talents = [] } = argumentsProps;
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);

  if (!talents || talents.length === 0) {
    return (
      <div className="w-full max-w-2xl mx-auto rounded-xl border border-border bg-card/60 backdrop-blur-sm p-8 text-center">
        <Search className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
        <p className="text-sm text-muted-foreground">未找到匹配的GitHub人才</p>
        {searchQuery && (
          <p className="text-xs text-muted-foreground mt-1">搜索关键词：{searchQuery}</p>
        )}
      </div>
    );
  }

  return (
    <div className="w-full max-w-2xl mx-auto space-y-4 pb-12" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
      {/* Header */}
      <div className="rounded-xl border border-border bg-card/60 backdrop-blur-sm p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-semibold text-foreground" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
              匹配人才
            </h3>
            <span className="text-xs text-muted-foreground">
              ({talents.length}{totalCount ? ` / ${formatCount(totalCount)}` : ''})
            </span>
          </div>
          {searchQuery && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-muted border border-border text-muted-foreground">
              {searchQuery}
            </span>
          )}
        </div>
        {matchReason && (
          <p className="mt-2 text-xs text-muted-foreground leading-relaxed">{matchReason}</p>
        )}
      </div>

      {/* Talent Profiles */}
      {talents.map((talent, idx) => {
        const isExpanded = expandedIdx === idx;
        return (
          <div
            key={talent.login}
            className="rounded-xl border border-border bg-card/60 backdrop-blur-sm overflow-hidden hover:border-primary/30 transition-colors"
          >
            {/* Profile Header */}
            <div className="p-4">
              <div className="flex items-start gap-3">
                {/* Avatar */}
                <div className="shrink-0">
                  <img
                    src={talent.avatarUrl}
                    alt={talent.login}
                    className="w-12 h-12 rounded-full border-2 border-border"
                    loading="lazy"
                  />
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <a
                      href={talent.htmlUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm font-semibold text-foreground hover:text-primary transition-colors flex items-center gap-1"
                    >
                      {talent.name || talent.login}
                      <ExternalLink className="w-3 h-3" />
                    </a>
                    <span className="text-xs text-muted-foreground font-mono">@{talent.login}</span>
                  </div>

                  {talent.bio && (
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2 leading-relaxed">
                      {talent.bio}
                    </p>
                  )}

                  {/* Meta */}
                  <div className="flex flex-wrap items-center gap-3 mt-2 text-xs text-muted-foreground">
                    {talent.location && (
                      <span className="flex items-center gap-1">
                        <MapPin className="w-3 h-3" />
                        {talent.location}
                      </span>
                    )}
                    {talent.company && (
                      <span className="flex items-center gap-1">
                        <Building2 className="w-3 h-3" />
                        {talent.company}
                      </span>
                    )}
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      加入 {formatDate(talent.createdAt)}
                    </span>
                  </div>

                  {/* Stats */}
                  <div className="flex items-center gap-4 mt-2">
                    <span className="flex items-center gap-1 text-xs text-foreground">
                      <Users className="w-3 h-3 text-muted-foreground" />
                      <span className="font-mono font-medium">{formatCount(talent.followers)}</span>
                      <span className="text-muted-foreground">followers</span>
                    </span>
                    <span className="flex items-center gap-1 text-xs text-foreground">
                      <BookOpen className="w-3 h-3 text-muted-foreground" />
                      <span className="font-mono font-medium">{talent.publicRepos}</span>
                      <span className="text-muted-foreground">repos</span>
                    </span>
                  </div>

                  {/* Languages */}
                  {talent.topLanguages && talent.topLanguages.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {talent.topLanguages.map((lang) => (
                        <span
                          key={lang}
                          className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-muted border border-border text-foreground"
                        >
                          <span
                            className="w-2 h-2 rounded-full shrink-0"
                            style={{ backgroundColor: LANG_COLORS[lang] || '#8b949e' }}
                          />
                          {lang}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Expand/Collapse repos */}
            {talent.topRepos && talent.topRepos.length > 0 && (
              <>
                <button
                  type="button"
                  onClick={() => setExpandedIdx(isExpanded ? null : idx)}
                  className="w-full flex items-center justify-center gap-1 py-2 text-xs text-muted-foreground hover:text-foreground border-t border-border bg-muted/30 transition-colors"
                >
                  <Code2 className="w-3 h-3" />
                  {isExpanded ? '收起项目' : `查看热门项目 (${talent.topRepos.length})`}
                  {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                </button>

                {isExpanded && (
                  <div className="border-t border-border p-3 space-y-2">
                    {talent.topRepos.map((repo) => (
                      <a
                        key={repo.name}
                        href={repo.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block p-2.5 rounded-lg bg-muted/40 border border-border hover:border-primary/20 transition-colors"
                      >
                        <div className="flex items-center gap-2">
                          <BookOpen className="w-3.5 h-3.5 text-primary shrink-0" />
                          <span className="text-sm font-medium text-foreground truncate">{repo.name}</span>
                        </div>
                        {repo.description && (
                          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{repo.description}</p>
                        )}
                        <div className="flex items-center gap-3 mt-1.5">
                          {repo.language && (
                            <span className="flex items-center gap-1 text-xs text-muted-foreground">
                              <span
                                className="w-2 h-2 rounded-full shrink-0"
                                style={{ backgroundColor: LANG_COLORS[repo.language] || '#8b949e' }}
                              />
                              {repo.language}
                            </span>
                          )}
                          <span className="flex items-center gap-0.5 text-xs text-muted-foreground">
                            <Star className="w-3 h-3" />
                            {formatCount(repo.stars)}
                          </span>
                          {repo.forks > 0 && (
                            <span className="flex items-center gap-0.5 text-xs text-muted-foreground">
                              <GitFork className="w-3 h-3" />
                              {formatCount(repo.forks)}
                            </span>
                          )}
                        </div>
                      </a>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default registerComponent(config)(function TalentCard(
  props: AsArgumentsProps<TalentCardProps>,
) {
  return <TalentCardComponent {...props} />;
});
