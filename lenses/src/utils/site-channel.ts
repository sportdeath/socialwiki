export function siteChannel(siteName: string) {
  return `site:${siteName}`;
}

// Read existing sites published before site channels gained a prefix.
export function siteChannels(siteName: string) {
  return [siteChannel(siteName), siteName];
}
