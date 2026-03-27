import { isTextExtension } from '@/app/lib/utils';

export class FileReadingService {
  readFileAsBuffer = async (file: File) => {
    return new Promise(function (resolve, reject) {
      const reader = new FileReader();
      const readFile = function () {
        const buffer = reader.result;
        resolve(buffer);
      };
      reader.addEventListener('load', readFile);
      reader.readAsArrayBuffer(file);
    });
  };

  arrayBufferToBase64 = (buffer: ArrayBuffer): string => {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;

    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }

    // Use btoa to convert binary string to base64
    return window.btoa(binary);
  };

  readFileAsArrayBuffer = async (file: File): Promise<ArrayBuffer> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = function (event) {
        if (!event.target) {
          reject('No target found in BrowderFileReader');
          return;
        }

        const arrayBuffer = event.target.result as ArrayBuffer;
        resolve(arrayBuffer);
      };

      reader.readAsArrayBuffer(file);
    });
  };

  readFileAsText = async (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = function (event) {
        if (!event.target) {
          reject('No target found in BrowderFileReader');
          return;
        }

        const arrayBuffer = event.target.result as string;
        resolve(arrayBuffer);
      };

      reader.readAsText(file);
    });
  };

  createObjFromFile = async (file: File, fieldName: string) => {
    const extension = file.name?.split('.').pop() || '';

    let data: string | ArrayBuffer;
    if (isTextExtension(extension)) {
      data = await this.readFileAsText(file);
    } else {
      const buffer = await this.readFileAsArrayBuffer(file);
      data = this.arrayBufferToBase64(buffer);
    }

    return {
      fieldName,
      name: file.name,
      data,
      type: file.type,
      updateTms: file.lastModified,
    };
  };
}
