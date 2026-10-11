/** Source-managed reviews; raw GitHub descriptions never determine public copy. */
import source from '../data/repository-overrides.json' with { type: 'json' };

export type RepositoryReview = { description: string; purpose: string; relatedProject: { path: string; label: string } | null; reviewed: boolean };
type Override = Omit<RepositoryReview, 'reviewed'> & { id: number; full_name: string };
type Overrides = { schema_version: number; account: string; projectPaths: string[]; repositories: Override[] };
const route = /^\/projects\/[a-z0-9]+(?:-[a-z0-9]+)*\/$/;
const validRoute = (value: unknown): value is string => typeof value === 'string' && value.endsWith('/') && route.test(value);
const text = (value: unknown, limit: number): value is string => typeof value === 'string' && value.trim().length > 0 && new TextEncoder().encode(value).length <= limit && !/[\u0000-\u001f\u007f]/.test(value);

export function validateRepositoryOverrides(value: unknown): Overrides {
  if (!value || typeof value !== 'object') throw new Error('Invalid repository reviews.');
  const data = value as Overrides;
  if (data.schema_version !== 1 || data.account !== 'sinashiry' || !Array.isArray(data.projectPaths) || data.projectPaths.length > 1000 || data.projectPaths.some(path => !validRoute(path)) || new Set(data.projectPaths).size !== data.projectPaths.length || !Array.isArray(data.repositories) || data.repositories.length > 1000) throw new Error('Invalid repository review schema.');
  const ids = new Set<number>(), names = new Set<string>();
  for (const entry of data.repositories) {
    if (!entry || !Number.isSafeInteger(entry.id) || entry.id <= 0 || ids.has(entry.id) || typeof entry.full_name !== 'string' || !/^sinashiry\/[A-Za-z0-9_.-]+$/.test(entry.full_name) || /[\u0000-\u001f\u007f]/.test(entry.full_name) || ['sinashiry/.', 'sinashiry/..'].includes(entry.full_name) || entry.full_name.length > 110 || names.has(entry.full_name.toLowerCase()) || !text(entry.description, 1200) || !text(entry.purpose, 240)) throw new Error('Invalid repository review entry.');
    const related = entry.relatedProject;
    if (related !== null && (!related || typeof related !== 'object' || !validRoute(related.path) || !data.projectPaths.includes(related.path) || !text(related.label, 160))) throw new Error('Invalid related project.');
    ids.add(entry.id); names.add(entry.full_name.toLowerCase());
  }
  return data;
}

const overrides = validateRepositoryOverrides(source);
export function reviewedRepository(repository: { id: number }, data: Overrides = overrides): RepositoryReview {
  // ID keeps a review through a rename, but prevents another repository reusing it.
  const entry = data.repositories.find(review => review.id === repository.id);
  return entry ? { description: entry.description, purpose: entry.purpose, relatedProject: entry.relatedProject ? { ...entry.relatedProject } : null, reviewed: true } : {
    description: 'Public repository by Sina Shiri. Open GitHub for source and documentation.',
    purpose: 'Source and documentation', relatedProject: null, reviewed: false,
  };
}
