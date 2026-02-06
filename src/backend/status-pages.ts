const style = `
<style>
:root {
    color-scheme: light dark;
    --background-color: #fff;
    --text-color: #202122;
    --title-color: #101418;
    --link-color: #36c;
    --link-hover-color: #3056a9;
    --border-color: #a2a9b1;
    --background-color-interactive: #eaecf0;
    --background-color-interactive-hover: #dadde3;
}

@media (prefers-color-scheme: dark) {
    :root {
        color-scheme: dark;
        --background-color: #101418;
        --text-color: #eaecf0;
        --title-color: #f8f9fa;
        --link-color: #88a3e8;
        --link-hover-color: #a6bbf5;
        --border-color: #72777d;
        --background-color-interactive: #27292d;
        --background-color-interactive-hover: #404244;

    }
}

html, body, main {
  height: 100%;
}

body {
  background: var(--background-color);
  color: var(--text-color);
  font-family:
      system-ui,
      -apple-system,
      BlinkMacSystemFont,
      "Segoe UI",
      Roboto,
      Helvetica,
      Arial,
      sans-serif;
  display: flex;
  align-items: center;
  justify-content: center;
}

main {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

h1 {
  color: var(--title-color);
}

.dots::after {
    content: "";
    display: inline-block;
    width: 3ch;
    animation: dots 0.7s linear infinite;
}

@keyframes dots {
    0%   { content: ""; }
    25%  { content: "."; }
    50%  { content: ".."; }
    75%  { content: "..."; }
}

a {
    color: var(--link-color);
    cursor: pointer;
    text-decoration: none;
    background: var(--background-color-interactive);
    padding: 1rem;
    border-radius: 0.5rem;
    font-size: 2rem;
    font-weight: bold;
    border: 2px solid var(--border-color);
}

a:hover {
    background: var(--background-color-interactive-hover);
    color: var(--link-hover-color);
}
</style>
`;

export const LoadingPage = `
<!doctype html>
<html>
    <head>${style}</head>
    <body>
        <main>
          <h1 class="dots">Page loading</h1>
        </main>
    </body>
</html>
`;

export const PageNotFound = (pageName: string, origin: string) => `
<!doctype html>
<html>
    <head>
      <script src="${origin}/init.js"></script>
      ${style}
    </head>
    <body>
        <main>
            <h1>Nothing here…yet.</h1>
            <p>
                <a href="#/edit/${pageName}">
                    Edit page
                </a>
            </p>
        </main>
    </body>
</html>
`;

export const ErrorPage = (e: string) => `
<!doctype html>
<html>
    <head>${style}</head>
    <body>
        <main>
            <h1>Error loading page.</h1>
            <p>${e}</p>
        </main>
    </body>
</html>
`;
