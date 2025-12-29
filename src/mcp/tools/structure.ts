/**
 * MCP Structure Tools
 * Tools for exporting and importing CMS structure (content types, taxonomies)
 */

import { z } from 'zod';
import { getContentTypesCollection, getTaxonomiesCollection, saveDatabase } from '../../db/index.js';

// Exported structure type
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

export const structureTools = {
  export_structure: {
    description: 'Export CMS structure (content types and taxonomies) to JSON format for migration',
    inputSchema: z.object({}),
    handler: async (): Promise<ExportedStructure> => {
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

      return {
        version: '1.0.0',
        exportedAt: new Date().toISOString(),
        contentTypes,
        taxonomies,
      };
    },
  },

  import_structure: {
    description: 'Import CMS structure (content types and taxonomies) from JSON data',
    inputSchema: z.object({
      structure: z.object({
        version: z.string().optional(),
        contentTypes: z.array(z.object({
          name: z.string(),
          slug: z.string(),
          description: z.string().optional(),
          fields: z.array(z.any()),
        })).optional(),
        taxonomies: z.array(z.object({
          name: z.string(),
          slug: z.string(),
          description: z.string().optional(),
          hierarchical: z.boolean(),
        })).optional(),
      }).describe('The structure object to import'),
      skipExisting: z.boolean().optional().describe('Skip items that already exist (default: false)'),
      updateExisting: z.boolean().optional().describe('Update items that already exist (default: false)'),
    }),
    handler: async (input: {
      structure: {
        version?: string;
        contentTypes?: Array<{
          name: string;
          slug: string;
          description?: string;
          fields: unknown[];
        }>;
        taxonomies?: Array<{
          name: string;
          slug: string;
          description?: string;
          hierarchical: boolean;
        }>;
      };
      skipExisting?: boolean;
      updateExisting?: boolean;
    }) => {
      const { structure, skipExisting = false, updateExisting = false } = input;
      const contentTypesCollection = getContentTypesCollection();
      const taxonomiesCollection = getTaxonomiesCollection();

      const result = {
        contentTypes: { created: 0, skipped: 0, updated: 0, errors: [] as string[] },
        taxonomies: { created: 0, skipped: 0, updated: 0, errors: [] as string[] },
      };

      // Import content types
      for (const ct of structure.contentTypes || []) {
        try {
          const existing = contentTypesCollection.findOne({ slug: ct.slug });

          if (existing) {
            if (updateExisting) {
              existing.name = ct.name;
              existing.description = ct.description;
              existing.fields = ct.fields as typeof existing.fields;
              existing.updatedAt = Date.now();
              contentTypesCollection.update(existing);
              result.contentTypes.updated++;
            } else if (skipExisting) {
              result.contentTypes.skipped++;
            } else {
              result.contentTypes.errors.push(`Content type '${ct.slug}' already exists`);
            }
          } else {
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
            result.contentTypes.created++;
          }
        } catch (err) {
          result.contentTypes.errors.push(`Error importing '${ct.slug}': ${err}`);
        }
      }

      // Import taxonomies
      for (const tax of structure.taxonomies || []) {
        try {
          const existing = taxonomiesCollection.findOne({ slug: tax.slug });

          if (existing) {
            if (updateExisting) {
              existing.name = tax.name;
              existing.description = tax.description;
              existing.hierarchical = tax.hierarchical;
              existing.updatedAt = Date.now();
              taxonomiesCollection.update(existing);
              result.taxonomies.updated++;
            } else if (skipExisting) {
              result.taxonomies.skipped++;
            } else {
              result.taxonomies.errors.push(`Taxonomy '${tax.slug}' already exists`);
            }
          } else {
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
            result.taxonomies.created++;
          }
        } catch (err) {
          result.taxonomies.errors.push(`Error importing '${tax.slug}': ${err}`);
        }
      }

      // Save changes
      await saveDatabase();

      return {
        message: 'Structure import completed',
        summary: {
          contentTypes: `${result.contentTypes.created} created, ${result.contentTypes.updated} updated, ${result.contentTypes.skipped} skipped`,
          taxonomies: `${result.taxonomies.created} created, ${result.taxonomies.updated} updated, ${result.taxonomies.skipped} skipped`,
        },
        details: result,
      };
    },
  },

  get_structure_summary: {
    description: 'Get a summary of the current CMS structure',
    inputSchema: z.object({}),
    handler: async () => {
      const contentTypesCollection = getContentTypesCollection();
      const taxonomiesCollection = getTaxonomiesCollection();

      const contentTypes = contentTypesCollection.find().map(ct => ({
        name: ct.name,
        slug: ct.slug,
        fieldsCount: ct.fields.length,
      }));

      const taxonomies = taxonomiesCollection.find().map(tax => ({
        name: tax.name,
        slug: tax.slug,
        hierarchical: tax.hierarchical,
      }));

      return {
        contentTypesCount: contentTypes.length,
        taxonomiesCount: taxonomies.length,
        contentTypes,
        taxonomies,
      };
    },
  },
};
