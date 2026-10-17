import assert from "node:assert/strict";
import test from "node:test";
import { newestFirst, type SiteVersion } from "../src/versions.ts";

function version(url: string, time: number, previous: string[] = []): SiteVersion {
  return { url, actor: "admin", channels: ["site:example"], value: {
    action: "Publish site", "site name": "example", changes: "Test",
    document: `${url}.html`, time, "previous versions": previous,
  } };
}

test("a later publication beats its ancestor even when its clock runs behind", () => {
  const old = version("old", 200);
  const newer = version("newer", 100, ["old"]);
  assert.deepEqual(newestFirst([newer, old]).map(({ url }) => url), ["newer", "old"]);
});

test("independent branches use time and URL for stable order", () => {
  const versions = [version("b", 100), version("a", 100), version("latest", 200)];
  assert.deepEqual(newestFirst(versions).map(({ url }) => url), ["latest", "b", "a"]);
});
