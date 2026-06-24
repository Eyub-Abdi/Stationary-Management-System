import { SetMetadata } from '@nestjs/common';
import { IS_PUBLIC_KEY } from '../constants';

/** Marks a route as public (skips the global JWT auth guard). */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
