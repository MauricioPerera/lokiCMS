/**
 * Factory exports
 */

export * from './user.factory.js';
export * from './entry.factory.js';
export * from './content-type.factory.js';
export * from './taxonomy.factory.js';
export * from './term.factory.js';

// Reset all counters for test isolation
import { resetUserCounter } from './user.factory.js';
import { resetEntryCounter } from './entry.factory.js';
import { resetContentTypeCounter } from './content-type.factory.js';
import { resetTaxonomyCounter } from './taxonomy.factory.js';
import { resetTermCounter } from './term.factory.js';

export function resetAllCounters(): void {
  resetUserCounter();
  resetEntryCounter();
  resetContentTypeCounter();
  resetTaxonomyCounter();
  resetTermCounter();
}
