import { z } from 'zod';
import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';

/**
 * Teaches the process that builds the contract how to name a schema.
 *
 * Zod 4 installs `openapi` on each schema instance when it is created, not on a shared prototype the way Zod 3
 * did. That makes the order below load-bearing: this module must be the first import of any entry point that will
 * register schemas, because a schema built before the extension simply does not have the method and cannot gain it
 * afterwards. `openapi.ts` and the two contract tests import it first for that reason; importing it anywhere else
 * would be a no-op that looks like it works.
 */
extendZodWithOpenApi(z);

export { z };
