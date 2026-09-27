export function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => `&#${character.charCodeAt(0)};`);
}
