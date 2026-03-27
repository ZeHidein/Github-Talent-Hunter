export const base64ToAudioBuffer = async (
  base64Str: string,
  audioContext?: AudioContext,
): Promise<AudioBuffer> => {
  // Use the provided AudioContext or create a new one
  const context = audioContext || new AudioContext();

  // Remove any data URL prefix (if present)
  const regex = /^data:audio\/(wav|mp3|ogg|mpeg);base64,/;
  const base64Data = base64Str.replace(regex, '');

  // Convert base64 string to binary string
  const binaryString = atob(base64Data);

  // Convert binary string to Uint8Array
  const len = binaryString.length;
  const uint8Array = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    uint8Array[i] = binaryString.charCodeAt(i);
  }

  // Decode audio data into AudioBuffer
  const audioBuffer = await context.decodeAudioData(uint8Array.buffer);

  return audioBuffer;
};

export const convertBlobToBase64 = async (data: Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    let base64: string;
    var reader = new window.FileReader();
    reader.readAsDataURL(data);
    reader.onloadend = function () {
      const result = reader.result as string;
      base64 = result.split(',')[1];
      resolve(base64);
    };
  });
};
