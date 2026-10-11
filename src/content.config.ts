import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import type { Loader } from 'astro/loaders';
import data from './data/content.json';
import { collectionSchemas } from './lib/collection-rules.ts';

/** The file name is the permanent slug. Bodies stay raw text: Astro's Markdown renderer (raw HTML, relative image imports) never runs. */
function textFiles(pattern: string, base: string): Loader {
  const loader = glob({ pattern, base, generateId: ({ entry }) => entry.replace(/\.(?:md|json)$/, '') });
  return { ...loader, name: 'collection-text-glob', load: context => {
    const types = (context as unknown as { entryTypes?: Map<string, object> }).entryTypes;
    return loader.load(types ? { ...context, entryTypes: new Map([...types].map(([ext, type]) => [ext, { ...type, getRenderFunction: undefined }])) } as typeof context : context);
  } };
}
const schemas = collectionSchemas({ projects: data.projects.map(project => project.slug) });

export const collections = {
  posts: defineCollection({ loader: textFiles('*.md', './src/content/blog'), schema: schemas.post }),
  papers: defineCollection({ loader: textFiles('*.json', './src/content/papers'), schema: schemas.paper }),
};
