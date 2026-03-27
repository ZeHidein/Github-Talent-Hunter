import { useEffect, useState } from 'react';
import { cn } from '../utils';

type LucideIconProps = {
  name: string;
  size?: number;
  className?: string;
} & React.SVGProps<SVGSVGElement>;

export const LucideIcon = ({ name, size = 24, className = '' }: LucideIconProps) => {
  const [svg, setSvg] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    fetch(`https://unpkg.com/lucide-static/icons/${name}.svg`, {
      signal: controller.signal,
    })
      .then((res) => {
        if (!res.ok) {
          throw new Error('Icon not found');
        }
        return res.text();
      })
      .then(setSvg)
      .catch(() => setSvg(null));

    return () => controller.abort();
  }, [name]);

  if (!svg) {
    return null;
  }

  return (
    <span
      className={cn('flex-center', className)}
      // biome-ignore lint/security/noDangerouslySetInnerHtml: <explanation>
      dangerouslySetInnerHTML={svg ? { __html: svg } : undefined}
    />
  );
};
