/**
 * Import CMS Structure
 * Imports content types and taxonomies from a JSON file
 */

import { readFileSync, existsSync } from 'fs';
import { initDatabase, getContentTypesCollection, getTaxonomiesCollection, closeDatabase, saveDatabase } from '../db/index.js';
import type { ExportedStructure } from './export-structure.js';

interface ImportOptions {
  /** Skip existing items instead of failing */
  skipExisting?: boolean;
  /** Update existing items with imported data */
  updateExisting?: boolean;
  /** Dry run - don't actually import, just validate */
  dryRun?: boolean;
}

interface ImportResult {
  contentTypes: {
    created: number;
    skipped: number;
    updated: number;
    errors: string[];
  };
  taxonomies: {
    created: number;
    skipped: number;
    updated: number;
    errors: string[];
  };
}

async function importStructure(
  inputPath: string,
  options: ImportOptions = {}
): Promise<ImportResult> {
  const { skipExisting = false, updateExisting = false, dryRun = false } = options;

  if (!existsSync(inputPath)) {
    throw new Error(`File not found: ${inputPath}`);
  }

  const fileContent = readFileSync(inputPath, 'utf-8');
  const structure: ExportedStructure = JSON.parse(fileContent);

  console.log(`[Import] Loading structure from ${inputPath}`);
  console.log(`[Import] Version: ${structure.version}`);
  console.log(`[Import] Exported at: ${structure.exportedAt}`);
  console.log(`[Import] Content types: ${structure.contentTypes.length}`);
  console.log(`[Import] Taxonomies: ${structure.taxonomies.length}`);

  if (dryRun) {
    console.log('[Import] DRY RUN - No changes will be made');
  }

  const dbPath = process.env.DB_PATH || './data/cms.db';
  console.log(`[Import] Connecting to database at ${dbPath}...`);
  await initDatabase({ path: dbPath });

  const contentTypesCollection = getContentTypesCollection();
  const taxonomiesCollection = getTaxonomiesCollection();

  const result: ImportResult = {
    contentTypes: { created: 0, skipped: 0, updated: 0, errors: [] },
    taxonomies: { created: 0, skipped: 0, updated: 0, errors: [] },
  };

  // Import content types
  for (const ct of structure.contentTypes) {
    try {
      const existing = contentTypesCollection.findOne({ slug: ct.slug });

      if (existing) {
        if (updateExisting) {
          if (!dryRun) {
            existing.name = ct.name;
            existing.description = ct.description;
            existing.fields = ct.fields as typeof existing.fields;
            existing.updatedAt = Date.now();
            contentTypesCollection.update(existing);
          }
          result.contentTypes.updated++;
          console.log(`[Import] Updated content type: ${ct.slug}`);
        } else if (skipExisting) {
          result.contentTypes.skipped++;
          console.log(`[Import] Skipped content type: ${ct.slug} (already exists)`);
        } else {
          result.contentTypes.errors.push(`Content type '${ct.slug}' already exists`);
        }
      } else {
        if (!dryRun) {
          const now = Date.now();
          contentTypesCollection.insert({
            id: crypto.randomUUID(),
            name: ct.name,
            slug: ct.slug,
            description: ct.description,
            fields: ct.fields as typeof existing.fields,
            createdAt: now,
            updatedAt: now,
          });
        }
        result.contentTypes.created++;
        console.log(`[Import] Created content type: ${ct.slug}`);
      }
    } catch (err) {
      result.contentTypes.errors.push(`Error importing '${ct.slug}': ${err}`);
    }
  }

  // Import taxonomies
  for (const tax of structure.taxonomies) {
    try {
      const existing = taxonomiesCollection.findOne({ slug: tax.slug });

      if (existing) {
        if (updateExisting) {
          if (!dryRun) {
            existing.name = tax.name;
            existing.description = tax.description;
            existing.hierarchical = tax.hierarchical;
            existing.updatedAt = Date.now();
            taxonomiesCollection.update(existing);
          }
          result.taxonomies.updated++;
          console.log(`[Import] Updated taxonomy: ${tax.slug}`);
        } else if (skipExisting) {
          result.taxonomies.skipped++;
          console.log(`[Import] Skipped taxonomy: ${tax.slug} (already exists)`);
        } else {
          result.taxonomies.errors.push(`Taxonomy '${tax.slug}' already exists`);
        }
      } else {
        if (!dryRun) {
          const now = Date.now();
          taxonomiesCollection.insert({
            id: crypto.randomUUID(),
            name: tax.name,
            slug: tax.slug,
            description: tax.description,
            hierarchical: tax.hierarchical,
            createdAt: now,
            updatedAt: now,
          });
        }
        result.taxonomies.created++;
        console.log(`[Import] Created taxonomy: ${tax.slug}`);
      }
    } catch (err) {
      result.taxonomies.errors.push(`Error importing '${tax.slug}': ${err}`);
    }
  }

  if (!dryRun) {
    await saveDatabase();
  }

  await closeDatabase();

  // Summary
  console.log('\n[Import] Summary:');
  console.log(`  Content Types: ${result.contentTypes.created} created, ${result.contentTypes.updated} updated, ${result.contentTypes.skipped} skipped`);
  console.log(`  Taxonomies: ${result.taxonomies.created} created, ${result.taxonomies.updated} updated, ${result.taxonomies.skipped} skipped`);

  if (result.contentTypes.errors.length > 0 || result.taxonomies.errors.length > 0) {
    console.log('\n[Import] Errors:');
    result.contentTypes.errors.forEach(e => console.log(`  - ${e}`));
    result.taxonomies.errors.forEach(e => console.log(`  - ${e}`));
  }

  return result;
}

// CLI execution
const inputPath = process.argv[2] || './structure.json';
const flags = process.argv.slice(3);

const options: ImportOptions = {
  skipExisting: flags.includes('--skip-existing') || flags.includes('-s'),
  updateExisting: flags.includes('--update-existing') || flags.includes('-u'),
  dryRun: flags.includes('--dry-run') || flags.includes('-d'),
};

importStructure(inputPath, options)
  .then(() => {
    console.log('\n[Import] Done!');
    process.exit(0);
  })
  .catch(err => {
    console.error('[Import] Error:', err);
    process.exit(1);
  });

export { importStructure, ImportOptions, ImportResult };
