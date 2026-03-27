/**
 * Service for uploading files to the public CDN via the platform storage API.
 */
export type PublicCdnUploadServiceParams = {
  apiBaseUrl: string;
  accessKey: string;
};

export class PublicCdnUploadService {
  #apiBaseUrl: string;
  #accessKey: string;

  constructor(params: PublicCdnUploadServiceParams) {
    this.#apiBaseUrl = params.apiBaseUrl.replace(/\/$/, '');
    this.#accessKey = params.accessKey;
  }

  /**
   * Upload a file buffer to the public CDN.
   * Returns the public CDN URL of the uploaded file.
   */
  async upload(buffer: Buffer | Uint8Array, mediaType: string, filename: string): Promise<string> {
    const formData = new FormData();
    formData.append('file', new Blob([buffer], { type: mediaType }), filename);

    const response = await fetch(`${this.#apiBaseUrl}/storage/upload-public`, {
      method: 'POST',
      headers: {
        'x-access-key': this.#accessKey,
      },
      body: formData,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`CDN upload failed (${response.status}): ${text}`);
    }

    const json = (await response.json()) as { success: boolean; url: string };
    if (!json.success || !json.url) {
      throw new Error('CDN upload response missing url');
    }

    return json.url;
  }
}
