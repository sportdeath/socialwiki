import { composeAddress, composeQuery } from "./route";

import styleCss from "../style.css?inline";
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

export const PageNotFound = (pageName: string, origin: string) => `
<!doctype html>
<html>
    <head>
      <meta charset="utf-8" />
      <script src="${origin}/init.js"></script>
      ${style}
    </head>
    <body>
        <h1 class="status">Nothing here…yet.</h1>
        <a class="status-button" href="#/${composeAddress("e", composeQuery(undefined, pageName))}">
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
        <p>${e}</p>
    </body>
</html>
`;
