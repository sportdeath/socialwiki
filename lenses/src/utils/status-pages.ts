import styleCss from "./status-pages.css?inline";
import { escapeHtml } from "@vue/shared";
const style = `<style>${styleCss}</style>`;

export const LoadingPage = `
<!doctype html>
<html>
    <head>
      <meta charset="utf-8" />
      ${style}
    </head>
    <body>
        <h1 class="status dots">Page loading</h1>
    </body>
</html>
`;

export const PageNotFound = (pageName: string, initUrl: string) => `
<!doctype html>
<html>
    <head>
      <meta charset="utf-8" />
      <script src="${escapeHtml(initUrl)}"></script>
      ${style}
    </head>
    <body>
        <h1 class="status">Nothing here…yet.</h1>
        <a class="status-button" href="${escapeHtml(`#/${window.route.composeAddress("e", window.route.composeQuery(undefined, pageName))}`)}">
            Edit page
        </a>
    </body>
</html>
`;

export const ErrorPage = (e: string) => `
<!doctype html>
<html>
    <head>
      <meta charset="utf-8" />
      ${style}
    </head>
    <body>
        <h1 class="status">Error loading page.</h1>
        <p>${escapeHtml(e)}</p>
    </body>
</html>
`;
