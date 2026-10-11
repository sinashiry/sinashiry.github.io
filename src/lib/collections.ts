/** Published blog posts and papers for pages, navigation and the collection sitemap. */
import { getCollection } from 'astro:content';
import data from '../data/content.json';
import { buildCollections } from './collection-rules.ts';
import type { Entry, Paper, PaperData, Post, PostData } from './collection-rules.ts';

let cached: Promise<{ posts: Post[]; papers: Paper[] }> | undefined;
async function read() {
  const [posts, papers] = await Promise.all([getCollection('posts'), getCollection('papers')]);
  const result = buildCollections(posts as Entry<PostData>[], papers as Entry<PaperData>[], { projects: data.projects.map(project => project.slug) });
  for (const warning of result.warnings) console.warn(`[collections] ${warning}`);
  if (result.errors.length) throw new Error(`Blog or publication content cannot be published:\n- ${result.errors.join('\n- ')}`);
  return { posts: result.posts, papers: result.papers };
}
/** Validated once per build; the dev server re-reads so content edits appear without a restart. */
const load = () => import.meta.env.DEV ? read() : (cached ??= read());

/** Published posts, newest first (archived and draft files never render). */
export const publishedPosts = async () => (await load()).posts;
/** Published papers: featured first, then newest year, then title. */
export const publishedPapers = async () => (await load()).papers;
/** Blog navigation needs THRESHOLD.post published posts; Publications needs THRESHOLD.paper published papers. */
export async function collectionCounts(): Promise<{ post: number; paper: number }> {
  const { posts, papers } = await load();
  return { post: posts.length, paper: papers.length };
}
