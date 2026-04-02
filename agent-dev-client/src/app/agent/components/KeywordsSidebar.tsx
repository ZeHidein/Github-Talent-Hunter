import type React from 'react';
import { useState, useEffect, useCallback, useRef } from 'react';
import { trpc } from '@/app/lib/trpc';
import {
  Tags,
  X,
  Check,
  ChevronLeft,
  ChevronRight,
  Code2,
  Briefcase,
  UserCheck,
  AlertCircle,
  Heart,
} from 'lucide-react';

interface Keyword {
  id: string;
  text: string;
  category: string;
  checked: boolean;
}

const CATEGORY_CONFIG: Record<
  string,
  { label: string; icon: React.ReactNode; color: string; dotColor: string }
> = {
  tech: {
    label: '技术栈',
    icon: <Code2 className="w-3 h-3" />,
    color: 'text-primary',
    dotColor: 'bg-primary',
  },
  domain: {
    label: '业务领域',
    icon: <Briefcase className="w-3 h-3" />,
    color: 'text-chart-2',
    dotColor: 'bg-chart-2',
  },
  role: {
    label: '岗位需求',
    icon: <UserCheck className="w-3 h-3" />,
    color: 'text-chart-3',
    dotColor: 'bg-chart-3',
  },
  pain: {
    label: '痛点',
    icon: <AlertCircle className="w-3 h-3" />,
    color: 'text-chart-4',
    dotColor: 'bg-chart-4',
  },
  culture: {
    label: '文化特征',
    icon: <Heart className="w-3 h-3" />,
    color: 'text-chart-1',
    dotColor: 'bg-chart-1',
  },
};

/**
 * KeywordsSidebar — persistent right sidebar that shows keywords
 * extracted during conversation. Uses polling to stay in sync with
 * the backend tool (saveKeywords).
 */
export const KeywordsSidebar: React.FC = () => {
  const [keywords, setKeywords] = useState<Keyword[]>([]);
  const [collapsed, setCollapsed] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Poll keywords every 2s
  const fetchKeywords = useCallback(async () => {
    try {
      const data = await trpc.keywords.list.query();
      setKeywords(data);
    } catch (err) {
      // Silent — sidebar is non-critical
      console.warn('[KeywordsSidebar] fetch error:', err);
    }
  }, []);

  useEffect(() => {
    fetchKeywords();
    pollRef.current = setInterval(fetchKeywords, 2000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [fetchKeywords]);

  const handleToggle = async (id: string) => {
    // Optimistic update
    setKeywords((prev) =>
      prev.map((k) => (k.id === id ? { ...k, checked: !k.checked } : k)),
    );
    try {
      await trpc.keywords.toggle.mutate({ id });
    } catch {
      // Revert on failure
      fetchKeywords();
    }
  };

  const handleRemove = async (id: string) => {
    setKeywords((prev) => prev.filter((k) => k.id !== id));
    try {
      await trpc.keywords.remove.mutate({ id });
    } catch {
      fetchKeywords();
    }
  };

  // Group by category
  const grouped = keywords.reduce<Record<string, Keyword[]>>((acc, kw) => {
    const cat = kw.category || 'tech';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(kw);
    return acc;
  }, {});

  const checkedCount = keywords.filter((k) => k.checked).length;

  // Collapsed state — just a toggle button
  if (collapsed) {
    return (
      <div className="hidden md:flex flex-col items-center py-4 w-10 border-l border-border bg-card/30 backdrop-blur-sm">
        <button
          type="button"
          onClick={() => setCollapsed(false)}
          className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
          title="展开关键词面板"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        {keywords.length > 0 && (
          <div className="mt-2 flex flex-col items-center gap-1">
            <Tags className="w-3.5 h-3.5 text-primary" />
            <span className="text-xs text-muted-foreground font-mono">{keywords.length}</span>
          </div>
        )}
      </div>
    );
  }

  return (
    <aside
      className="hidden md:flex flex-col w-[260px] shrink-0 border-l border-border bg-card/30 backdrop-blur-sm h-full overflow-hidden"
      style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-3 border-b border-border">
        <div className="flex items-center gap-1.5">
          <Tags className="w-3.5 h-3.5 text-primary" />
          <span
            className="text-xs font-semibold text-foreground"
            style={{ fontFamily: "'JetBrains Mono', monospace" }}
          >
            关键词
          </span>
          {keywords.length > 0 && (
            <span className="text-xs text-muted-foreground font-mono">
              {checkedCount}/{keywords.length}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => setCollapsed(true)}
          className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
          title="收起"
        >
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto scrollbar-none px-2 py-2 space-y-3">
        {keywords.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <Tags className="w-6 h-6 text-muted-foreground/40 mb-2" />
            <p className="text-xs text-muted-foreground/60 leading-relaxed px-3">
              对话中提取的关键词将显示在这里
            </p>
          </div>
        ) : (
          Object.entries(grouped).map(([category, kws]) => {
            const config = CATEGORY_CONFIG[category] || CATEGORY_CONFIG.tech;
            return (
              <div key={category}>
                {/* Category header */}
                <div className="flex items-center gap-1.5 px-1 mb-1.5">
                  <span className={config.color}>{config.icon}</span>
                  <span className={`text-xs font-medium ${config.color}`}>{config.label}</span>
                  <span className="text-xs text-muted-foreground/50 font-mono">
                    {kws.length}
                  </span>
                </div>

                {/* Keywords */}
                <div className="space-y-0.5">
                  {kws.map((kw) => (
                    <div
                      key={kw.id}
                      className="group flex items-center gap-1.5 px-1.5 py-1 rounded-md hover:bg-muted/30 transition-colors"
                    >
                      {/* Checkbox */}
                      <button
                        type="button"
                        onClick={() => handleToggle(kw.id)}
                        className={`shrink-0 w-4 h-4 rounded border flex items-center justify-center transition-all ${
                          kw.checked
                            ? 'bg-primary/20 border-primary/50 text-primary'
                            : 'border-border text-transparent hover:border-muted-foreground/50'
                        }`}
                      >
                        <Check className="w-2.5 h-2.5" strokeWidth={3} />
                      </button>

                      {/* Label */}
                      <span
                        className={`text-xs flex-1 truncate transition-colors ${
                          kw.checked ? 'text-foreground' : 'text-muted-foreground line-through'
                        }`}
                      >
                        {kw.text}
                      </span>

                      {/* Remove button (show on hover) */}
                      <button
                        type="button"
                        onClick={() => handleRemove(kw.id)}
                        className="shrink-0 opacity-0 group-hover:opacity-100 p-0.5 rounded text-muted-foreground/50 hover:text-destructive transition-all"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            );
          })
        )}
      </div>
    </aside>
  );
};
