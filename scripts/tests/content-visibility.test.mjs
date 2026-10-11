import test from 'node:test';
import assert from 'node:assert/strict';
import {omitOptional, groupReady} from '../content-visibility.mjs';

test('optional removal eliminates a whole nested wrapper and keeps outside evidence', () => {
  const html = '<header>Public header</header><div data-cv-visible-state="empty"><div>Private draft</div><div><div>Nested private text</div></div>Trailing private text</div><footer>Public footer</footer>';
  assert.equal(omitOptional(html),'<header>Public header</header><footer>Public footer</footer>');
});

test('multiple optional siblings and optional children are removed independently', () => {
  const html = '<section data-cv-visible-state="ready"><p>Keep</p><div data-cv-visible-state="empty"><div data-cv-visible-state="empty">Hidden</div></div><p>Keep also</p></section><section data-cv-visible-state="empty">Hidden sibling</section>';
  assert.equal(omitOptional(html),'<section data-cv-visible-state="ready"><p>Keep</p><p>Keep also</p></section>');
});

test('same-tag self-closing nodes do not swallow a following public sibling', () => {
  const html = '<div data-cv-visible-state="empty"><div/><span>Hidden</span></div><div>Public sibling</div>';
  assert.equal(omitOptional(html),'<div>Public sibling</div>');
});

test('mixed-case wrapper names remain balanced', () => {
  const html = '<DIV class="outer" data-cv-visible-state="empty"><div>Hidden</div></DIV><p>Public</p>';
  assert.equal(omitOptional(html),'<p>Public</p>');
});

test('visible or unmarked markup is preserved byte for byte and removal is idempotent', () => {
  const visible = '<div data-cv-visible-state="ready"><p>  Public &amp; exact  </p></div><p>Unmarked</p>';
  assert.equal(omitOptional(visible),visible);
  const once = omitOptional(visible+'<section data-cv-visible-state="empty">Hidden</section>');
  assert.equal(omitOptional(once),once);
});

test('an unbalanced optional wrapper fails rather than leaking a partial private section', () => {
  assert.throws(()=>omitOptional('<div data-cv-visible-state="empty"><div>Private</div>'),/Unbalanced optional content/);
});

test('whole private academic groups disappear including their headings',()=>{
 assert.equal(groupReady({academic:{profiles:[{label:'Scholar',url:''}]}},'academic-profiles'),false);
 assert.equal(groupReady({academic:{references:[{name:'Professor',status:'University',relationship:'Supervisor',approved:'no'}]}},'academic-references'),false);
 assert.equal(groupReady({currentWork:{researchDetails:{question:'Question',contribution:''}}},'current-research'),false);
 assert.equal(groupReady({currentWork:{researchDetails:{question:'Question',contribution:'Implemented model'}}},'current-research'),true);
 assert.equal(omitOptional('<section data-cv-group-state="empty"><h2>Private heading</h2><section>Nested</section></section><p>Evidence</p>'),'<p>Evidence</p>');
});
