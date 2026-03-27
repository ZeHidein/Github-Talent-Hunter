import { Card } from '@/app/agent/shadcdn/card';
import { LazyMarkdown as Markdown } from '@/app/lib/components/LazyMarkdown';

export const TextInCardInline: React.FC<{ text: string }> = ({ text }) => (
  <div>
    {text && (
      <div className="text-start font-plus-jakarta-sans font-normal w-full mx-auto text-[16px] leading-[28px] text-primary">
        <Markdown text={text} />
      </div>
    )}
  </div>
);
