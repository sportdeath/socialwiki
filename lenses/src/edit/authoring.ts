import metaPromptFile from "./AI_META_PROMPT.md?raw";
import { lensesUrl } from "../utils/locator";

// Show a rendered guide to people; fetch this lens build's guide for prompts and local files.
export const authoringGuideUrl = "https://github.com/sportdeath/socialwiki/blob/main/DOCUMENT_AUTHORING.md";
export const authoringGuideSourceUrl = new URL("DOCUMENT_AUTHORING.md", lensesUrl).href;

export function buildMetaPrompt(
  taskMode: "create" | "edit",
  siteName: string,
  userRequest: string,
  guide: string,
  existingHtml?: string,
) {
  const hasExistingHtml = existingHtml !== undefined;
  return metaPromptFile
    .replace(
      /\{\{#IF_EXISTING_HTML\}\}\n([\s\S]*?)\n\{\{\/IF_EXISTING_HTML\}\}/g,
      (_match, content: string) => hasExistingHtml ? content : "",
    )
    .replaceAll("{{TASK_MODE}}", () => taskMode)
    .replaceAll("{{SITE_NAME}}", () => siteName)
    .replaceAll("{{USER_REQUEST}}", () => userRequest)
    .replaceAll("{{DOCUMENT_AUTHORING_GUIDE}}", () => guide)
    .replaceAll("{{EXISTING_HTML}}", () => existingHtml ?? "")
    .trim();
}

export function extractHtmlFromClipboard(text: string) {
  const blocks = [...text.matchAll(/```(?:html)?\s*\n([\s\S]*?)\n```/gi)];
  const html = blocks.length === 1 ? blocks[0][1].trim() : text.trim();
  if (blocks.length > 1 ||
      !/^(?:<!doctype\s+html\s*>|<html(?:\s|>))/i.test(html) ||
      !/<head(?:\s|>)/i.test(html) || !/<body(?:\s|>)/i.test(html)) {
    throw new Error("Copy the chatbot's full response, then try again.");
  }
  return html;
}
