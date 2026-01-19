export type UploadStrategy = "proxy" | "direct";

type UploadStrategyInput = {
  mode?: string;
  hasSignedUrl: boolean;
};

export const resolveUploadStrategy = ({
  mode,
  hasSignedUrl
}: UploadStrategyInput): UploadStrategy => {
  const normalized = mode?.toLowerCase();
  if (normalized === "direct") {
    return hasSignedUrl ? "direct" : "proxy";
  }
  if (normalized === "proxy") {
    return "proxy";
  }
  return "proxy";
};
