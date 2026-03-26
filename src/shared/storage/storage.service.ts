import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  CreateBucketCommand,
  HeadBucketCommand,
  PutBucketPolicyCommand,
  PutBucketCorsCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name);
  private s3: S3Client;
  private publicUrl: string;

  constructor(private config: ConfigService) {
    const endpoint = this.config.get<string>('MINIO_ENDPOINT');
    if (!endpoint) {
      this.logger.warn('MINIO_ENDPOINT not configured — storage disabled');
      return;
    }

    this.s3 = new S3Client({
      endpoint,
      region: 'us-east-1',
      credentials: {
        accessKeyId: this.config.get<string>('MINIO_ACCESS_KEY', 'minioadmin'),
        secretAccessKey: this.config.get<string>(
          'MINIO_SECRET_KEY',
          'minioadmin',
        ),
      },
      forcePathStyle: true,
    });

    this.publicUrl = this.config.get<string>('MINIO_PUBLIC_URL', endpoint);
  }

  async onModuleInit() {
    if (!this.s3) return;

    // Create default buckets
    await this.ensureBucket('branding', true);
    await this.ensureBucket('avatars', true);
    await this.ensureBucket('documents', false);
  }

  async upload(
    bucket: string,
    key: string,
    buffer: Buffer,
    contentType: string,
  ): Promise<string> {
    await this.s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: buffer,
        ContentType: contentType,
      }),
    );
    return `${this.publicUrl}/${bucket}/${key}`;
  }

  async delete(bucket: string, key: string): Promise<void> {
    await this.s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
  }

  async getPresignedUrl(
    bucket: string,
    key: string,
    expiresIn = 3600,
  ): Promise<string> {
    return getSignedUrl(
      this.s3,
      new GetObjectCommand({ Bucket: bucket, Key: key }),
      { expiresIn },
    );
  }

  async ensureBucket(bucket: string, isPublic: boolean): Promise<void> {
    try {
      await this.s3.send(new HeadBucketCommand({ Bucket: bucket }));
      this.logger.log(`Bucket "${bucket}" already exists`);
    } catch {
      try {
        await this.s3.send(new CreateBucketCommand({ Bucket: bucket }));
        this.logger.log(`Bucket "${bucket}" created`);
      } catch (createErr) {
        this.logger.error(`Failed to create bucket "${bucket}"`, createErr);
        return;
      }
    }

    // Set CORS
    try {
      await this.s3.send(
        new PutBucketCorsCommand({
          Bucket: bucket,
          CORSConfiguration: {
            CORSRules: [
              {
                AllowedOrigins: ['*'],
                AllowedMethods: ['GET'],
                AllowedHeaders: ['*'],
                MaxAgeSeconds: 86400,
              },
            ],
          },
        }),
      );
    } catch {
      this.logger.warn(`Could not set CORS on bucket "${bucket}"`);
    }

    // Set public policy
    if (isPublic) {
      try {
        await this.s3.send(
          new PutBucketPolicyCommand({
            Bucket: bucket,
            Policy: JSON.stringify({
              Version: '2012-10-17',
              Statement: [
                {
                  Effect: 'Allow',
                  Principal: '*',
                  Action: ['s3:GetObject'],
                  Resource: [`arn:aws:s3:::${bucket}/*`],
                },
              ],
            }),
          }),
        );
        this.logger.log(`Public read policy set on bucket "${bucket}"`);
      } catch {
        this.logger.warn(`Could not set public policy on bucket "${bucket}"`);
      }
    }
  }
}
