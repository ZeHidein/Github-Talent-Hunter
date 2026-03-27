/**
 * Tool Output Types
 *
 * Types for tool execution results. Separated from tool-model.ts to allow
 * browser-safe imports in content.ts without pulling in Node.js dependencies.
 */

/**
 * Binary output type for returning images to the LLM.
 * Used when tools need to return image data that the LLM can "see" and process.
 */
export type ToolOutputImage = {
  type: 'image';
  image: {
    data: Uint8Array;
    mediaType: string;
    filename?: string;
  };
};

/**
 * Binary output type for returning files to the LLM.
 * Used when tools need to return file data for LLM processing.
 */
export type ToolOutputFileContent = {
  type: 'file';
  file: {
    data: Uint8Array;
    mediaType: string;
    filename: string;
  };
};

/**
 * Union type for all possible tool outputs that can be returned to the LLM.
 * - string: Text output
 * - ToolOutputImage: Binary image data
 * - ToolOutputFileContent: Binary file data
 */
export type ToolOutput = string | ToolOutputImage | ToolOutputFileContent;
