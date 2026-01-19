import { logError } from "./logger";

export type ServerErrorMeta = {
  scope: string;
  name?: string;
  code?: string;
};

export const logServerError = (meta: ServerErrorMeta, error: unknown) => {
  const name = error instanceof Error ? error.name : "UnknownError";
  const code =
    typeof error === "object" && error && "code" in error ? String(error.code) : undefined;

  const event = `SERVER_ERROR_${meta.scope.toUpperCase().replace(/[^A-Z0-9]+/g, "_")}`;
  logError(event, {
    errorName: name,
    errorCode: code ?? meta.code
  });
};
