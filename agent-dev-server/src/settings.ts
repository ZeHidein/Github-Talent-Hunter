import { loadEnvFile } from 'node:process';

type SecretsConfiguration = {};

class Settings {
  /**
   * Default values for env variables
   */
  configuration: SecretsConfiguration = {} as SecretsConfiguration;

  getSecret(key) {
    return this.configuration[key] || process.env[key];
  }

  getBooleanSecret(key) {
    return this.configuration[key] === 'true' || this.configuration[key] === 1;
  }

  isLocal() {
    return !process.env.ENV || process.env.ENV === 'local';
  }

  isProd() {
    return process.env.ENV === 'production';
  }

  getAppName() {
    if (this.isLocal()) {
      return 'agent-local';
    }
    return 'agent-prod';
  }

  async load() {
    if (this.isLocal()) {
      try {
        loadEnvFile();
      } catch {
        console.warn('No env file loaded');
      } // that ok
    }
    Object.assign(this.configuration, process.env);
  }
}

export default Settings;
