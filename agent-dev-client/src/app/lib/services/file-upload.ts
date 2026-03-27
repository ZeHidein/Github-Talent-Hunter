import { AgentAuth } from '../agent-auth';

export type FileUploadResult = { url: string; description: string; fileName: string };

export class FileUploadService {
  /**
   * Upload a file to the server.
   * Note: onUploadProgress is not available with fetch API.
   * If progress tracking is needed, XMLHttpRequest would need to be used.
   */
  public uploadFile = async (file: File): Promise<FileUploadResult> => {
    const formData = new FormData();
    formData.append('file', file);

    const result = await AgentAuth.postForm<FileUploadResult>('/api/file/upload', formData);
    return result;
  };
}
