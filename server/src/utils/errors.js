// A single error type for everything the client is allowed to see.
// `code` is machine-readable, `message` is safe to show in the UI.
export class AppError extends Error {
  constructor(code, message, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

export const toClientError = (err) =>
  err instanceof AppError
    ? { code: err.code, message: err.message }
    : { code: 'INTERNAL', message: 'Something went wrong on our side. Please try again.' };
