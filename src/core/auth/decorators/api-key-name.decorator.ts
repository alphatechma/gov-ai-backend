import { SetMetadata } from '@nestjs/common';

export const API_KEY_NAME = 'apiKeyName';
export const ApiKeyName = (configKey: string) =>
  SetMetadata(API_KEY_NAME, configKey);
