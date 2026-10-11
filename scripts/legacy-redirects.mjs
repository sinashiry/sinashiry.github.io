/** Legacy WordPress URLs, verified against the preserved export (permalinks /%category%/%postname%/, pages at /<slug>/).
 * GitHub Pages cannot answer 301/410, so redirecting paths get static stubs and ?p=/?page_id=/?attachment_id= get a homepage script.
 * Retired entries are listed only so tests can prove nothing is generated for them; they now return the normal 404. */
export const SITE = 'https://sina-shiri.com';

// Legacy path -> current target. Project posts lived under their category; WordPress pages at the root.
export const legacyPaths = {
  '/projects/standalone-and-network-based-alarm-monitoring/': '/projects/industrial-alarm-monitoring/',
  '/projects/qr-code-reader-and-production-monitoring/': '/projects/embedded-qr-scanner/',
  '/projects/fire-and-smoke-detector-using-image-processing/': '/projects/fire-smoke-vision/',
  '/projects/standalone-roll-call-system/': '/projects/rfid-attendance/',
  '/projects/online-voting-system/': '/projects/networked-polling/',
  '/projects/detection-and-tracking-of-moving-objects/': '/projects/zynq-object-detection/',
  '/projects/industrial-data-graph/': '/projects/industrial-data-graph/',
  '/projects/food-reservation-system/': '/projects/food-reservation-system/',
  '/projects/haypermarket-callerid/': '/projects/two-line-caller-id/',
  '/honors-e/': '/resume/#honors',
  '/resume-e/': '/resume/',
  '/contacts-e/': '/contact/',
  '/home-e/': '/',
  '/about-e/': '/about/',
  '/my-resume/': '/resume/',
  '/contact-me/': '/contact/',
  '/about-me/': '/about/',
};

// WordPress post, page and attachment IDs. Ascending order decides which ID wins when a query names several.
export const legacyIds = {
  41: '/resume/', 46: '/resume/#honors', 53: '/contact/', 151: '/', 372: '/research/#technical-books', 482: '/projects/',
  492: '/projects/industrial-data-graph/', 635: '/projects/zynq-object-detection/', 691: '/projects/food-reservation-system/',
  747: '/projects/two-line-caller-id/', 780: '/projects/rfid-attendance/', 805: '/projects/networked-polling/',
  845: '/projects/embedded-qr-scanner/', 847: '/projects/fire-smoke-vision/', 934: '/projects/industrial-alarm-monitoring/',
  1433: '/downloads/Sina_Shiri_Engineering_CV.pdf',
};

export const retiredIds = [2, 50, 936, 938, 1017, 1064, 1486, 1527];
export const retiredSlugs = ['sample-page', 'blog-e', 'sevda-pourya', 'hosseinpour-memories', 'real-time-signal-and-position-finder-bot-in-crypto-markets', 'chia-block-chain-miner', 'crypto-market-auto-trade-bot', 'auto-money-management-tool-for-scalp-fast-scalp-traders'];

// The old CV upload is served as a build-time copy of the selected Engineering CV, so it never goes stale.
export const legacyCvPath = 'wp-content/uploads/2022/12/Sina-Shiri-CV.pdf';

/** Paths that need a stub: everything whose target is a different route. */
export function legacyStubs() {
  return Object.entries(legacyPaths).filter(([from, to]) => from !== to.split('#')[0]).map(([from, to]) => ({ from, to }));
}
