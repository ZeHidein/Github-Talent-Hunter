import type React from 'react';
import { registerComponent } from '@/app/lib/components/registry';
import type { AsArgumentsProps, ComponentConfigT } from '@/app/lib/types';
import { ImageWithScanEffectComponent } from '@/app/lib/components/ImageWithScanEffect';

const config: ComponentConfigT = {
  componentName: 'Image',
  type: 'component',
  isStreaming: false,
  name: 'Image',
  description: 'Image component with alternate text',
  isStrictSchema: false,
  parameters: {
    type: 'object',
    properties: {
      src: {
        type: 'string',
        description: 'URL of the image',
      },
      alt: {
        type: 'string',
        description: 'Image alt attribute',
      },
    },
    additionalProperties: false,
    required: ['src'],
  },
};

type ImageProps = {
  src: string;
  alt?: string;
};

const ImageComponent: React.FC<AsArgumentsProps<ImageProps>> = ({ argumentsProps }) => {
  const { src, alt } = argumentsProps;

  return (
    <div className="w-full bg-transparent text-center max-w-container-xl">
      <div className="relative w-full mx-auto">
        <ImageWithScanEffectComponent src={src} alt={alt} />
      </div>
    </div>
  );
};

export default registerComponent(config)(function Image(props: AsArgumentsProps<ImageProps>) {
  return <ImageComponent {...props} />;
});
