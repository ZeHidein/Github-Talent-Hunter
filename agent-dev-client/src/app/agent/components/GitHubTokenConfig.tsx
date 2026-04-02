import type React from 'react';
import { useState, useEffect } from 'react';
import { registerComponent } from '@/app/lib/components/registry';
import type { AsArgumentsProps, ComponentConfigT } from '@/app/lib/types';
import { useLiveQuery } from '@/app/lib/hooks/useLiveQuery';
import { trpc } from '@/app/lib/trpc';
import {
  KeyRound,
  ExternalLink,
  Check,
  X,
  Eye,
  EyeOff,
  Shield,
  Loader2,
} from 'lucide-react';

const config: ComponentConfigT = {
  componentName: 'GitHubTokenConfig',
  type: 'component',
  isStreaming: false,
  name: 'GitHubTokenConfig',
  description:
    'GitHub Personal Access Token configuration panel. Shows token input, creation link, and current status. Use when user needs to configure their GitHub token for higher API rate limits.',
  isStrictSchema: false,
  parameters: {
    type: 'object',
    properties: {
      title: {
        type: 'string',
        description: 'Optional title override',
      },
    },
    additionalProperties: false,
  },
};

type GitHubTokenConfigProps = {
  title?: string;
};

const GITHUB_TOKEN_URL = 'https://github.com/settings/tokens/new?scopes=read:user,read:org&description=GitHub+Talent+Scout';

const GitHubTokenConfigComponent: React.FC<AsArgumentsProps<GitHubTokenConfigProps>> = ({
  argumentsProps,
  handleSendMessage,
}) => {
  const { title } = argumentsProps;
  const [tokenInput, setTokenInput] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);

  const { data: status, isLoading } = useLiveQuery(
    'githubToken',
    () => trpc.githubToken.status.query(),
  );

  // Reset justSaved after a delay
  useEffect(() => {
    if (justSaved) {
      const timer = setTimeout(() => setJustSaved(false), 3000);
      return () => clearTimeout(timer);
    }
  }, [justSaved]);

  const handleSave = async () => {
    if (!tokenInput.trim()) {
      setError('请输入 Token');
      return;
    }
    // Basic validation: GitHub tokens typically start with ghp_, github_pat_, or gho_
    if (!/^(ghp_|github_pat_|gho_|gh[a-z]_)/.test(tokenInput.trim()) && tokenInput.trim().length < 20) {
      setError('Token 格式不正确，请检查后重试');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await trpc.githubToken.save.mutate({ token: tokenInput.trim() });
      setTokenInput('');
      setShowToken(false);
      setJustSaved(true);
    } catch (err) {
      console.error('[GitHubTokenConfig] Save error:', err);
      setError('保存失败，请重试');
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async () => {
    setSaving(true);
    setError(null);
    try {
      await trpc.githubToken.remove.mutate();
      setJustSaved(false);
    } catch (err) {
      console.error('[GitHubTokenConfig] Remove error:', err);
      setError('移除失败，请重试');
    } finally {
      setSaving(false);
    }
  };

  const isConfigured = status?.configured ?? false;

  return (
    <div
      className="w-full max-w-lg mx-auto rounded-xl border border-border bg-card/60 backdrop-blur-sm overflow-hidden pb-12"
      style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}
    >
      {/* Header */}
      <div className="p-4 border-b border-border">
        <div className="flex items-center gap-2">
          <KeyRound className="w-4 h-4 text-primary" />
          <h3
            className="text-sm font-semibold text-foreground"
            style={{ fontFamily: "'JetBrains Mono', monospace" }}
          >
            {title || 'GitHub Token 配置'}
          </h3>
          {isConfigured && (
            <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
              <Check className="w-3 h-3" />
              已配置
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">
          配置 GitHub Personal Access Token 可将 API 速率限制从 10次/分钟 提升至 5000次/小时，获得更好的人才搜索体验。
        </p>
      </div>

      {/* Token creation guide */}
      <div className="p-4 border-b border-border bg-muted/20">
        <div className="flex items-start gap-2">
          <Shield className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
          <div className="text-xs text-muted-foreground leading-relaxed space-y-1">
            <p className="text-foreground font-medium">如何创建 Token：</p>
            <p>
              1. 点击下方链接前往 GitHub 设置页面
            </p>
            <p>
              2. 选择 Token 类型（Classic 或 Fine-grained 均可）
            </p>
            <p>
              3. 勾选 <span className="font-mono text-primary">read:user</span> 权限（仅需只读权限）
            </p>
            <p>
              4. 生成 Token 后粘贴到下方输入框
            </p>
          </div>
        </div>
        <a
          href={GITHUB_TOKEN_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 flex items-center gap-1.5 px-3 py-2 rounded-lg bg-card border border-border text-sm text-foreground hover:border-primary/40 hover:text-primary transition-colors w-fit"
        >
          <ExternalLink className="w-3.5 h-3.5" />
          前往 GitHub 创建 Token
        </a>
      </div>

      {/* Token input */}
      <div className="p-4">
        {isLoading ? (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="w-5 h-5 text-muted-foreground animate-spin" />
          </div>
        ) : isConfigured && !justSaved ? (
          /* Already configured - show status and remove option */
          <div className="space-y-3">
            <div className="flex items-center gap-2 p-3 rounded-lg bg-primary/5 border border-primary/20">
              <Check className="w-4 h-4 text-primary shrink-0" />
              <span className="text-sm text-foreground">Token 已配置，搜索将使用认证模式（5000次/小时）</span>
            </div>
            <button
              type="button"
              onClick={handleRemove}
              disabled={saving}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-destructive hover:bg-destructive/10 border border-transparent hover:border-destructive/20 transition-colors disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <X className="w-3 h-3" />}
              移除 Token
            </button>
          </div>
        ) : (
          /* Input form */
          <div className="space-y-3">
            <div className="relative">
              <input
                type={showToken ? 'text' : 'password'}
                value={tokenInput}
                onChange={(e) => {
                  setTokenInput(e.target.value);
                  setError(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSave();
                }}
                placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                className="w-full px-3 py-2.5 pr-10 rounded-lg bg-muted/50 border border-border text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary/50 focus:border-primary/50 font-mono"
              />
              <button
                type="button"
                onClick={() => setShowToken(!showToken)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              >
                {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>

            {error && (
              <p className="text-xs text-destructive flex items-center gap-1">
                <X className="w-3 h-3" />
                {error}
              </p>
            )}

            {justSaved && (
              <p className="text-xs text-primary flex items-center gap-1">
                <Check className="w-3 h-3" />
                Token 保存成功！
              </p>
            )}

            <button
              type="button"
              onClick={handleSave}
              disabled={saving || !tokenInput.trim()}
              className="w-full flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <KeyRound className="w-4 h-4" />
              )}
              保存 Token
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default registerComponent(config)(function GitHubTokenConfig(
  props: AsArgumentsProps<GitHubTokenConfigProps>,
) {
  return <GitHubTokenConfigComponent {...props} />;
});
