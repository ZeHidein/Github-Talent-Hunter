import type { ToolResultOutput } from '@ai-sdk/provider-utils';
import type { ToolOutput, ToolOutputFileContent, ToolOutputImage } from '../../tools/tool-model.ts';

function uint8ArrayToBase64(data: Uint8Array): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(data).toString('base64');
  }
  let binary = '';
  for (let i = 0; i < data.length; i++) {
    binary += String.fromCharCode(data[i]);
  }
  return btoa(binary);
}

function isToolOutputImage(output: unknown): output is ToolOutputImage {
  return (
    typeof output === 'object' &&
    output !== null &&
    'type' in output &&
    output.type === 'image' &&
    'image' in output
  );
}

function isToolOutputFileContent(output: unknown): output is ToolOutputFileContent {
  return (
    typeof output === 'object' &&
    output !== null &&
    'type' in output &&
    output.type === 'file' &&
    'file' in output
  );
}

export function isBinaryToolOutput(
  output: unknown,
): output is ToolOutputImage | ToolOutputFileContent {
  return isToolOutputImage(output) || isToolOutputFileContent(output);
}

export function convertToolOutputToModelOutput(output: ToolOutput): ToolResultOutput {
  if (typeof output === 'string') {
    return { type: 'text', value: output };
  }

  if (isToolOutputImage(output)) {
    const base64Data = uint8ArrayToBase64(output.image.data);
    return {
      type: 'content',
      value: [
        {
          type: 'image-data',
          data: base64Data,
          mediaType: output.image.mediaType,
        },
      ],
    };
  }

  if (isToolOutputFileContent(output)) {
    const base64Data = uint8ArrayToBase64(output.file.data);
    const isImage = output.file.mediaType.startsWith('image/');
    return {
      type: 'content',
      value: [
        isImage
          ? {
              type: 'image-data',
              data: base64Data,
              mediaType: output.file.mediaType,
            }
          : {
              type: 'file-data',
              data: base64Data,
              mediaType: output.file.mediaType,
              filename: output.file.filename,
            },
      ],
    };
  }

  return {
    type: 'json',
    value: JSON.parse(JSON.stringify(output ?? null)),
  };
}
