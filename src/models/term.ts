/**
 * Term Model
 * Represents terms within taxonomies
 */

import { z } from 'zod';

// Term schema
export const TermSchema = z.object({
  id: z.string(),
  taxonomyId: z.string(),
  taxonomySlug: z.string(),
  name: z.string().min(1).max(128),
  slug: z.string().min(1).max(128).regex(/^[a-z0-9][a-z0-9-]*$/),
  description: z.string().max(512).optional(),
  parentId: z.string().optional(),
  order: z.number().default(0),
  metadata: z.record(z.unknown()).default({}),
  count: z.number().default(0),
  createdAt: z.number(),
  updatedAt: z.number(),
});

export type Term = z.infer<typeof TermSchema>;

// Create term input
export const CreateTermSchema = z.object({
  taxonomyId: z.string().optional(),
  taxonomySlug: z.string().optional(),
  name: z.string().min(1).max(128),
  slug: z.string().min(1).max(128).regex(/^[a-z0-9][a-z0-9-]*$/).optional(),
  description: z.string().max(512).optional(),
  parentId: z.string().optional(),
  order: z.number().default(0),
  metadata: z.record(z.unknown()).default({}),
}).refine(
  data => data.taxonomyId || data.taxonomySlug,
  { message: 'Either taxonomyId or taxonomySlug is required' }
);

export type CreateTermInput = z.infer<typeof CreateTermSchema>;

// Update term input
export const UpdateTermSchema = z.object({
  name: z.string().min(1).max(128).optional(),
  slug: z.string().min(1).max(128).regex(/^[a-z0-9][a-z0-9-]*$/).optional(),
  description: z.string().max(512).optional(),
  parentId: z.string().nullable().optional(),
  order: z.number().optional(),
  metadata: z.record(z.unknown()).optional(),
});

export type UpdateTermInput = z.infer<typeof UpdateTermSchema>;

// Term tree node for hierarchical display
export interface TermTreeNode extends Term {
  children: TermTreeNode[];
  depth: number;
}

// Build term tree from flat list
export function buildTermTree(terms: Term[]): TermTreeNode[] {
  const termMap = new Map<string, TermTreeNode>();
  const roots: TermTreeNode[] = [];

  // First pass: create nodes
  for (const term of terms) {
    termMap.set(term.id, { ...term, children: [], depth: 0 });
  }

  // Second pass: build tree
  for (const term of terms) {
    const node = termMap.get(term.id)!;

    if (term.parentId && termMap.has(term.parentId)) {
      const parent = termMap.get(term.parentId)!;
      node.depth = parent.depth + 1;
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  }

  // Sort by order
  const sortChildren = (nodes: TermTreeNode[]) => {
    nodes.sort((a, b) => a.order - b.order);
    for (const node of nodes) {
      sortChildren(node.children);
    }
  };
  sortChildren(roots);

  return roots;
}

// Flatten term tree back to list with depth info
export function flattenTermTree(tree: TermTreeNode[]): TermTreeNode[] {
  const result: TermTreeNode[] = [];

  const traverse = (nodes: TermTreeNode[]) => {
    for (const node of nodes) {
      result.push(node);
      traverse(node.children);
    }
  };

  traverse(tree);
  return result;
}

// Get all ancestor IDs for a term
export function getAncestorIds(termId: string, terms: Term[]): string[] {
  const ancestors: string[] = [];
  const termMap = new Map(terms.map(t => [t.id, t]));

  let current = termMap.get(termId);
  while (current?.parentId) {
    ancestors.push(current.parentId);
    current = termMap.get(current.parentId);
  }

  return ancestors;
}

// Get all descendant IDs for a term
export function getDescendantIds(termId: string, terms: Term[]): string[] {
  const descendants: string[] = [];
  const childMap = new Map<string, Term[]>();

  // Build child map
  for (const term of terms) {
    if (term.parentId) {
      if (!childMap.has(term.parentId)) {
        childMap.set(term.parentId, []);
      }
      childMap.get(term.parentId)!.push(term);
    }
  }

  // Traverse children
  const traverse = (id: string) => {
    const children = childMap.get(id) ?? [];
    for (const child of children) {
      descendants.push(child.id);
      traverse(child.id);
    }
  };

  traverse(termId);
  return descendants;
}
