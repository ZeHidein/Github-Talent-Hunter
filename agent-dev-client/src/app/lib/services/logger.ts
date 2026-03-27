type ConstructorParams = {
  applicationName: string;
};

export class LoggerService {
  private readonly applicationName: string;

  constructor({ applicationName }: ConstructorParams) {
    this.applicationName = applicationName;
  }

  log = (...args: any[]) => {
    console.log(...args);
  };

  error = (...args: any[]) => {
    console.error(...args);
  };
}
