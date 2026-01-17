import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export type StorageConfig = {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle?: boolean;
};

export type SignedUrlParams = {
  key: string;
  expiresInSeconds?: number;
  contentType?: string;
};

export const createS3Client = (config: StorageConfig): S3Client =>
  new S3Client({
    region: config.region,
    endpoint: config.endpoint,
    forcePathStyle: config.forcePathStyle ?? false,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey
    }
  });

export const getSignedUploadUrl = async (
  client: S3Client,
  bucket: string,
  params: SignedUrlParams
): Promise<string> => {
  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: params.key,
    ContentType: params.contentType
  });

  return getSignedUrl(client, command, {
    expiresIn: params.expiresInSeconds ?? 900
  });
};

export const getSignedDownloadUrl = async (
  client: S3Client,
  bucket: string,
  params: SignedUrlParams
): Promise<string> => {
  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: params.key
  });

  return getSignedUrl(client, command, {
    expiresIn: params.expiresInSeconds ?? 900
  });
};
