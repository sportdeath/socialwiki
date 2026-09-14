// The classic locator records its own stable URL before inlined modules run.
// Their import.meta.url may instead be an unusable blob URL.
export const lensesUrl = new URL(window.socialWikiLensesUrl);
