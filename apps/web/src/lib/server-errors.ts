export type ServerErrorMeta = {
  scope: string;
  name?: string;
  code?: string;
};

export const logServerError = (meta: ServerErrorMeta, error: unknown) => {
  const name = error instanceof Error ? error.name : "UnknownError";
  const code =
    typeof error === "object" && error && "code" in error ? String(error.code) : undefined;

  console.error("server_error", {
    scope: meta.scope,
    name,
    code
  });
};
