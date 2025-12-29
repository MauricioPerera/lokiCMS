/**
 * Export CMS Structure
 * Exports content types and taxonomies to a JSON file for migration
 */

import { writeFileSync } from 'fs';
import { initDatabase, getContentTypesCollection, getTaxonomiesCollection, closeDatabase } from '../db/index.js';

interface ExportedStructure {
  version: string;
  exportedAt: string;
  contentTypes: Array<{
    name: string;
    slug: string;
    description?: string;
    fields: unknown[];
  }>;
  taxonomies: Array<{
    name: string;
    slug: string;
    description?: string;
    hierarchical: boolean;
  }>;
}

async function exportStructure(outputPath: string): Promise<ExportedStructure> {
  const dbPath = process.env.DB_PATH || './data/cms.db';

  console.log(`[Export] Loading database from ${dbPath}...`);
  await initDatabase({ path: dbPath });

  const contentTypesCollection = getContentTypesCollection();
  const taxonomiesCollection = getTaxonomiesCollection();

  // Get all content types (without internal LokiJS metadata)
  const contentTypes = contentTypesCollection.find().map(ct => ({
    name: ct.name,
    slug: ct.slug,
    description: ct.description,
    fields: ct.fields,
  }));

  // Get all taxonomies (without internal LokiJS metadata)
  const taxonomies = taxonomiesCollection.find().map(tax => ({
    name: tax.name,
    slug: tax.slug,
    description: tax.description,
    hierarchical: tax.hierarchical,
  }));

  const structure: ExportedStructure = {
    version: '1.0.0',
    exportedAt: new Date().toISOString(),
    contentTypes,
    taxonomies,
  };

  // Write to file
  writeFileSync(outputPath, JSON.stringify(structure, null, 2), 'utf-8');

  console.log(`[Export] Exported ${contentTypes.length} content types`);
  console.log(`[Export] Exported ${taxonomies.length} taxonomies`);
  console.log(`[Export] Saved to ${outputPath}`);

  await closeDatabase();

  return structure;
}

// CLI execution
const outputPath = process.argv[2] || './structure.json';
exportStructure(outputPath)
  .then(() => {
    console.log('[Export] Done!');
    process.exit(0);
  })
  .catch(err => {
    console.error('[Export] Error:', err);
    process.exit(1);
  });

export { exportStructure, ExportedStructure };
