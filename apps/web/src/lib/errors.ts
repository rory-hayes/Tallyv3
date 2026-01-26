export class NotFoundError extends Error {
  constructor(message = "Not found") {
    super(message);
    this.name = "NotFoundError";
  }
}

export class ConflictError extends Error {
  constructor(message = "Conflict") {
    super(message);
    this.name = "ConflictError";
  }
}

export class ValidationError extends Error {
  constructor(message = "Validation error") {
    super(message);
    this.name = "ValidationError";
  }
}

export type ImportErrorCode = "ERROR_FILE_INVALID" | "ERROR_PARSE_FAILED";

export class ImportFileInvalidError extends ValidationError {
  readonly code: ImportErrorCode = "ERROR_FILE_INVALID";

  constructor(message = "Invalid file.") {
    super(message);
    this.name = "ImportFileInvalidError";
  }
}

export class ImportParseError extends ValidationError {
  readonly code: ImportErrorCode = "ERROR_PARSE_FAILED";

  constructor(message = "Unable to parse file.") {
    super(message);
    this.name = "ImportParseError";
  }
}
