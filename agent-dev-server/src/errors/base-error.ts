export default class BaseError extends Error {
  constructor(msg: string) {
    super(msg);
    Object.setPrototypeOf(this, BaseError.prototype);
  }
}
