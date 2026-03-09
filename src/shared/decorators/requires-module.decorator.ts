import { SetMetadata } from '@nestjs/common';

export const MODULE_KEY = 'requiredModule';
export const RequiresModule = (moduleKey: string) =>
  SetMetadata(MODULE_KEY, moduleKey);
