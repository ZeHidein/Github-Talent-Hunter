export const getJWTPayload = <T = Record<string, unknown>>(jwt: string) => {
  const [, payloadB64] = jwt.split('.');
  const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString());
  return payload as T;
};
