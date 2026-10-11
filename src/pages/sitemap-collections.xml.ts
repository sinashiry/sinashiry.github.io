import { publishedPapers, publishedPosts } from '../lib/collections';
import { collectionSitemap } from '../lib/collection-rules';
export async function GET(){ return new Response(collectionSitemap(await publishedPosts(),(await publishedPapers()).length),{headers:{'Content-Type':'application/xml'}}); }
