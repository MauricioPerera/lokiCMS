/**
 * Database Seed Script
 * Creates initial admin user and default content types/taxonomies
 */

import { initDatabase, closeDatabase, saveDatabase } from './db/index.js';
import { userService } from './services/user.service.js';
import { contentTypeService } from './services/content-type.service.js';
import { taxonomyService, termService } from './services/taxonomy.service.js';
import { DEFAULT_CONTENT_TYPES, DEFAULT_TAXONOMIES } from './models/index.js';

const DB_PATH = process.env['DB_PATH'] || './data/cms.db';

async function seed() {
  console.log('Initializing database...');
  await initDatabase({
    path: DB_PATH,
    autosave: false,
  });

  try {
    // Create admin user
    console.log('Creating admin user...');
    try {
      const admin = await userService.create({
        email: 'admin@lokicms.local',
        password: 'admin123456',
        name: 'Administrator',
        role: 'admin',
      });
      console.log(`  Created admin user: ${admin.email}`);
    } catch (error) {
      if ((error as Error).message.includes('already registered')) {
        console.log('  Admin user already exists');
      } else {
        throw error;
      }
    }

    // Create default content types
    console.log('Creating default content types...');
    for (const ctInput of DEFAULT_CONTENT_TYPES) {
      try {
        const ct = await contentTypeService.create(ctInput);
        console.log(`  Created content type: ${ct.name}`);
      } catch (error) {
        if ((error as Error).message.includes('already exists')) {
          console.log(`  Content type '${ctInput.name}' already exists`);
        } else {
          throw error;
        }
      }
    }

    // Create default taxonomies
    console.log('Creating default taxonomies...');
    for (const taxInput of DEFAULT_TAXONOMIES) {
      try {
        const tax = await taxonomyService.create(taxInput);
        console.log(`  Created taxonomy: ${tax.name}`);

        // Create some default terms for categories
        if (tax.slug === 'category') {
          const defaultCategories = ['Uncategorized', 'News', 'Tutorial'];
          for (const catName of defaultCategories) {
            try {
              await termService.create({
                taxonomyId: tax.id,
                name: catName,
              });
              console.log(`    Created category: ${catName}`);
            } catch {
              // Ignore if exists
            }
          }
        }
      } catch (error) {
        if ((error as Error).message.includes('already exists')) {
          console.log(`  Taxonomy '${taxInput.name}' already exists`);
        } else {
          throw error;
        }
      }
    }

    // Save database
    await saveDatabase();
    console.log('\nSeed completed successfully!');
    console.log('\nDefault credentials:');
    console.log('  Email: admin@lokicms.local');
    console.log('  Password: admin123456');
    console.log('\nPlease change the admin password after first login.');

  } catch (error) {
    console.error('Seed failed:', error);
    process.exit(1);
  } finally {
    await closeDatabase();
  }
}

seed();
