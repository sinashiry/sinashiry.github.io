const menu = document.querySelector<HTMLButtonElement>('.menu-toggle');
menu?.addEventListener('click', () => { const expanded = menu.getAttribute('aria-expanded') === 'true'; menu.setAttribute('aria-expanded', String(!expanded)); document.querySelector('#main-nav')?.classList.toggle('open', !expanded); });
document.querySelectorAll('#main-nav a').forEach(a => a.addEventListener('click', () => { menu?.setAttribute('aria-expanded', 'false'); document.querySelector('#main-nav')?.classList.remove('open'); }));

document.addEventListener('keydown', event => { if(event.key === 'Escape' && menu?.getAttribute('aria-expanded') === 'true') { menu.setAttribute('aria-expanded','false'); document.querySelector('#main-nav')?.classList.remove('open'); menu.focus(); } });

document.querySelectorAll<HTMLButtonElement>('[data-filter]').forEach(button => button.addEventListener('click', () => {
  document.querySelectorAll('[data-filter]').forEach(b => b.setAttribute('aria-pressed', String(b === button)));
  let visible=0;
  document.querySelectorAll<HTMLElement>('[data-category]').forEach(card => {card.hidden = button.dataset.filter !== 'all' && card.dataset.category !== button.dataset.filter; if(!card.hidden) {visible++;card.classList.add('is-revealed');}});
  const status=document.querySelector('#filter-status'); if(status) status.textContent=`${visible} projects shown`;
}));

const motionPreference = matchMedia('(prefers-reduced-motion: reduce)');
const pointerPreference = matchMedia('(hover: hover) and (pointer: fine)');
const cards = document.querySelectorAll<HTMLElement>('[data-tilt]');
cards.forEach(card => {
  let frame=0,rect:DOMRect;
  const reset=()=>{cancelAnimationFrame(frame);card.classList.remove('tilting');card.style.removeProperty('--rx');card.style.removeProperty('--ry');};
  card.addEventListener('pointerenter',()=>{if(motionPreference.matches||!pointerPreference.matches)return;rect=card.getBoundingClientRect();card.classList.add('tilting');const arrow=card.querySelector('.arrow');arrow?.classList.remove('nudge');requestAnimationFrame(()=>arrow?.classList.add('nudge'));});
  card.addEventListener('pointermove',e=>{if(motionPreference.matches||!pointerPreference.matches||!rect)return;cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>{const x=Math.max(0,Math.min(1,(e.clientX-rect.left)/rect.width));const y=Math.max(0,Math.min(1,(e.clientY-rect.top)/rect.height));card.style.setProperty('--rx',`${(0.5-y)*6}deg`);card.style.setProperty('--ry',`${(x-0.5)*6}deg`);card.style.setProperty('--px',`${x*100}%`);card.style.setProperty('--py',`${y*100}%`);});});
  card.addEventListener('pointerleave',reset);card.addEventListener('pointercancel',reset);motionPreference.addEventListener('change',reset);
});
if(!motionPreference.matches && 'IntersectionObserver' in window){
  const observer = new IntersectionObserver(entries=>entries.forEach(entry=>{if(entry.isIntersecting){entry.target.classList.add('is-revealed');observer.unobserve(entry.target);}}),{threshold:.07});
  document.querySelectorAll<HTMLElement>('[data-reveal]').forEach(element=>{if(element.getBoundingClientRect().top>innerHeight){element.classList.add('reveal-pending');observer.observe(element);}});
  motionPreference.addEventListener('change',()=>{if(motionPreference.matches){observer.disconnect();document.querySelectorAll('.reveal-pending').forEach(el=>el.classList.add('is-revealed'));}});
}

// Read the published email from the rendered contact link, including owner edits.
document.querySelectorAll<HTMLButtonElement>('[data-copy-email]').forEach(button => {
  const section = button.closest('.contact-cards-section');
  const address = section?.querySelector<HTMLAnchorElement>('[data-cv-href="profile.email"]');
  const status = section?.querySelector<HTMLElement>('[data-copy-status]');
  if (!address || !navigator.clipboard?.writeText) return;
  button.hidden = false;
  button.addEventListener('click', async () => {
    const email = address.getAttribute('href')?.replace(/^mailto:/, '') || '';
    if (!email) return;
    try { await navigator.clipboard.writeText(email); if (status) status.textContent = 'Email address copied.'; }
    catch { if (status) status.textContent = 'Copy is unavailable. Use the email link above.'; }
  });
});
