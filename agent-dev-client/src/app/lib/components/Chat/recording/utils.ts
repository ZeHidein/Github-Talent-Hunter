export const convertBlobToBase64 = async (data: Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    let base64: string = '';
    var reader = new window.FileReader();
    reader.readAsDataURL(data);
    reader.onloadend = function () {
      const result = reader.result as string;
      base64 = result.split(',')[1];
      resolve(base64);
    };
  });
};
