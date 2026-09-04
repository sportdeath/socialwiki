import style from "./style.css";

export const LoadingPage = `
<!doctype html>
<html>
  <head><meta charset="utf-8" /><style>${style}</style></head>
  <body><h1 class="status dots">Page loading</h1></body>
</html>`;

export const ErrorPage = (error: string) => {
  const message = document.createElement("p");
  message.textContent = error;

  return `
<!doctype html>
<html>
  <head><meta charset="utf-8" /><style>${style}</style></head>
  <body><h1 class="status">Error loading page.</h1>${message.outerHTML}</body>
</html>`;
};
