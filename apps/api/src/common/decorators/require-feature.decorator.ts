import { SetMetadata } from '@nestjs/common';

export const RequireFeature = (featureCode: string) => SetMetadata('requiredFeature', featureCode);
