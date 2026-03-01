export type ParsedRoute = {
  lens: string;
  lensParams: URLSearchParams;
  pageAddress: string;
  pageName: string;
  pageArgs: URLSearchParams;
  pageHash: string;
};

function decodeUriComponentSafe(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function parseRoute(route: string): ParsedRoute {
  const normalized = route.replace(/^#/, "").replace(/^\/+/, "");

  let encodedLens = "";
  let lensQuery = "";
  let pageSection = "";

  const firstQuestionMark = normalized.indexOf("?");
  if (firstQuestionMark < 0) {
    const firstSlash = normalized.indexOf("/");
    if (firstSlash < 0) {
      encodedLens = normalized;
    } else {
      encodedLens = normalized.slice(0, firstSlash);
      pageSection = normalized.slice(firstSlash + 1);
    }
  } else {
    encodedLens = normalized.slice(0, firstQuestionMark);
    const afterLensQuestion = normalized.slice(firstQuestionMark + 1);
    const slashAfterLensQuery = afterLensQuestion.indexOf("/");

    if (slashAfterLensQuery < 0) {
      lensQuery = afterLensQuestion;
    } else {
      lensQuery = afterLensQuestion.slice(0, slashAfterLensQuery);
      pageSection = afterLensQuestion.slice(slashAfterLensQuery + 1);
    }
  }

  const lens = decodeUriComponentSafe(encodedLens);
  let pageName = "";
  let pageArgs = new URLSearchParams();
  let pageHash = "";
  let pageAddress = "";

  if (pageSection.length) {
    try {
      const pageUrl = new URL(pageSection, "https://social.wiki.invalid/");
      const rawPageName = pageUrl.pathname.replace(/^\/+/, "");
      pageName = decodeUriComponentSafe(rawPageName);
      pageArgs = new URLSearchParams(pageUrl.search);
      pageHash = pageUrl.hash;
    } catch {
      const [pageBeforeHash, hashRaw = ""] = pageSection.split("#", 2);
      const [pageNameRaw, pageQuery = ""] = pageBeforeHash.split("?", 2);
      pageName = decodeUriComponentSafe(pageNameRaw);
      pageArgs = new URLSearchParams(pageQuery);
      pageHash = hashRaw.length ? `#${hashRaw}` : "";
    }

    const pageQuery = pageArgs.toString();
    pageAddress = `${pageName}${pageQuery.length ? `?${pageQuery}` : ""}${pageHash}`;
  }

  return {
    lens,
    lensParams: new URLSearchParams(lensQuery),
    pageAddress,
    pageName,
    pageArgs,
    pageHash,
  };
}

export function composeRoute({
  lens,
  lensParams,
  pageAddress,
}: {
  lens: string;
  lensParams: URLSearchParams;
  pageAddress: string;
}): string {
  const encodedLens = encodeURIComponent(lens);
  const params = lensParams.toString();
  const lensWithParams = params.length ? `${encodedLens}?${params}` : encodedLens;
  return `/${lensWithParams}/${pageAddress}`;
}
