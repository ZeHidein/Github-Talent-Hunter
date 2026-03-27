import type { FileReadingService, FileUploadService } from '@/app/lib/services';

export type AgentSettings = {
  agentId: string;
  modelId: string;
  displayName: string;
};

export interface UIServicesContainerI {
  fileReadingService: FileReadingService;
  fileUploadService: FileUploadService;
}
