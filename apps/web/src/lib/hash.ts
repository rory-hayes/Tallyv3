const toHex = (bytes: Uint8Array): string =>
  Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");

export const sha256Hex = async (
  data: ArrayBuffer | Uint8Array
): Promise<string> => {
  const buffer = (data instanceof ArrayBuffer
    ? data
    : data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength)) as ArrayBuffer;

  if (!globalThis.crypto?.subtle) {
    throw new Error("Crypto subsystem unavailable.");
  }

  const hashBuffer = await globalThis.crypto.subtle.digest("SHA-256", buffer);
  return toHex(new Uint8Array(hashBuffer));
};

export const sha256FromString = async (value: string): Promise<string> =>
  sha256Hex(new TextEncoder().encode(value));
