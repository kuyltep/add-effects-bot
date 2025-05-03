import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { Logger } from './rollbar.logger';

interface S3StorageConfig {
  region: string;
  endpoint: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucketName: string;
}

class S3Storage {
  private client: S3Client;
  private bucketName: string;

  constructor(config: S3StorageConfig) {
    this.client = new S3Client({
      region: config.region,
      endpoint: config.endpoint,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });
    this.bucketName = config.bucketName;
  }

  async uploadFile(filePath: string): Promise<string> {
    try {
      const fileContent = fs.readFileSync(filePath);
      const fileName = `${uuidv4()}${path.extname(filePath)}`;

      const command = new PutObjectCommand({
        Bucket: this.bucketName,
        Key: fileName,
        Body: fileContent,
        ContentType: this.getContentType(filePath),
      });

      await this.client.send(command);
      
      // Generate URL for the uploaded file
      return `https://${this.bucketName}.storage.yandexcloud.net/${fileName}`;
    } catch (error) {
      Logger.error(error, {
        context: 's3-storage',
        method: 'uploadFile',
        filePath,
      });
      throw error;
    }
  }

  async deleteFile(fileUrl: string): Promise<void> {
    try {
      // Extract the file key from the URL
      const fileName = fileUrl.split('/').pop();
      
      if (!fileName) {
        throw new Error('Invalid file URL');
      }

      const command = new DeleteObjectCommand({
        Bucket: this.bucketName,
        Key: fileName,
      });

      await this.client.send(command);
    } catch (error) {
      Logger.error(error, {
        context: 's3-storage',
        method: 'deleteFile',
        fileUrl,
      });
      throw error;
    }
  }

  private getContentType(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();
    switch (ext) {
      case '.jpg':
      case '.jpeg':
        return 'image/jpeg';
      case '.png':
        return 'image/png';
      case '.gif':
        return 'image/gif';
      case '.webp':
        return 'image/webp';
      default:
        return 'application/octet-stream';
    }
  }
}

// Initialize S3 storage based on environment variables
const s3Config: S3StorageConfig = {
  region: process.env.S3_REGION || 'ru-central1',
  endpoint: process.env.S3_ENDPOINT || 'https://storage.yandexcloud.net',
  accessKeyId: process.env.S3_ACCESS_KEY_ID || '',
  secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || '',
  bucketName: process.env.S3_BUCKET_NAME || '',
};

const s3Storage = new S3Storage(s3Config);

export { s3Storage }; 