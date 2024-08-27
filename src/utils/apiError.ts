export class ApiError extends Error {
  success: boolean;
  constructor(
    message: string,
    public statusCode = 400,
    public error = [],
    stack = ""
  ) {
    super(message);
    this.success = false;
    if (stack) {
      this.stack = stack;
    } else {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}
