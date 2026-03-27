export function log(level: 'info' | 'warn' | 'error', data: Record<string, unknown>) {
  const logFn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
  logFn(JSON.stringify({ level, timestamp: new Date().toISOString(), ...data }));
}
