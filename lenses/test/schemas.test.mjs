import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { compileGraffitiObjectSchema } from "@graffiti-garden/api";
import {
  createSiteVersion, deleteSiteVersion, getSiteVersions,
  normalizeSiteVersions, pickVersion, siteStateSchema,
  siteVersionsSchema, sortSiteVersions,
} from "../src/utils/site-versions.ts";
import { protectionSchema, trustSchema } from "../src/utils/schemas.ts";
import { sortProtectionHistory, updateSiteProtection } from "../src/utils/protection.ts";
import { computeTrustAnnotationsByActor, trustedActors, trustActor } from "../src/utils/trust.ts";
import { browserHistorySchema } from "../src/browser/browser-history.ts";

const session = { actor: "did:example:alice" };
function record(url, value, overrides = {}) {
  return { url, actor: session.actor, channels: ["mypage"], value, ...overrides };
}
const legacy = record("legacy", {
  activity: "Update", object: "mypage", published: 200,
  summary: "Original", result: { media: "legacy-html" }, precededBy: [],
});
// Causality must win even when the newer writer's clock is behind.
const current = record("current", {
  action: "Publish site", "site name": "mypage", time: 100,
  changes: "Added feature", document: "current-html", "previous versions": ["legacy"],
});
const protection = record("protection", {
  action: "Protect site", "site name": "mypage", time: 100,
});
const removal = record("removal", {
  action: "Remove site protection", "site name": "mypage",
  "protection removed": "protection", time: 100,
});

function publisher() {
  const posts = [];
  const graffiti = {
    async postMedia({ data }) {
      assert.equal(data.type, "text/html");
      assert.equal(await data.text(), "<h1>Hello</h1>");
      return "uploaded-html";
    },
    async post(object, author) {
      assert.equal(author, session);
      posts.push(object);
      return { ...object, actor: author.actor, url: "new-record" };
    },
  };
  return { graffiti, posts };
}

test("site discovery accepts old and new publications but scopes both by name", async () => {
  const matches = await compileGraffitiObjectSchema(siteVersionsSchema("mypage"));
  assert(matches(legacy));
  assert(matches(current));
  assert(!matches({ ...legacy, value: { ...legacy.value, object: "other" } }));
  assert(!matches({ ...current, value: { ...current.value, "site name": "other" } }));
  assert(!matches(protection));
  assert(!matches(record("incomplete", { action: "Publish site", "site name": "mypage" })));
});

test("mixed-format versions preserve identity, links and causal order", () => {
  const before = structuredClone(legacy);
  const normalized = normalizeSiteVersions([current, legacy, protection], "mypage");
  const sorted = sortSiteVersions(normalized);
  assert.deepEqual(sorted.map((version) => version.url), ["current", "legacy"]);
  assert.equal(sorted[1].value.document, "legacy-html");
  assert.equal(sorted[1].actor, legacy.actor);
  assert.deepEqual(sorted[0].value["previous versions"], [legacy.url]);
  assert.deepEqual(legacy, before);
  assert.equal(pickVersion(sorted, [session.actor], true).url, "current");
  assert.equal(pickVersion(sorted, [], true), null);
  assert.equal(pickVersion(sorted, [], false).url, "current");
});

test("legacy records with unrelated extra action fields still normalize safely", () => {
  const extra = { ...legacy, value: { ...legacy.value, action: "Publish site" } };
  assert.equal(normalizeSiteVersions([extra])[0].value.document, "legacy-html");
  assert.deepEqual(normalizeSiteVersions([extra], "other"), []);
});

test("one-shot discovery handles repeats and URL-only tombstones before normalization", async () => {
  const graffiti = {
    async *discover(channels, schema) {
      assert.deepEqual(channels, ["mypage"]);
      const matches = await compileGraffitiObjectSchema(schema);
      assert(matches(legacy) && matches(current));
      yield { object: legacy };
      yield { object: legacy };
      yield { object: current };
      yield { tombstone: true, object: { url: current.url } };
    },
  };
  const versions = await getSiteVersions(graffiti, "mypage");
  assert.deepEqual(versions.map((version) => version.url), ["legacy"]);
  assert.equal(versions[0].value.document, "legacy-html");
});

test("publishing uses only readable fields and can reference legacy revisions", async () => {
  const { graffiti, posts } = publisher();
  await createSiteVersion(graffiti, "mypage", "<h1>Hello</h1>", [legacy.url], "Added feature", session);
  assert.deepEqual(posts[0], {
    channels: ["mypage"],
    value: {
      action: "Publish site", "site name": "mypage", changes: "Added feature",
      document: "uploaded-html", "previous versions": [legacy.url], time: posts[0].value.time,
    },
  });
  assert.equal(typeof posts[0].value.time, "number");
});

test("deleting a normalized legacy revision uses its original media and record URLs", async () => {
  const calls = [];
  await deleteSiteVersion({
    async deleteMedia(url) { calls.push(["media", url]); },
    async delete(url) { calls.push(["record", url]); },
  }, normalizeSiteVersions([legacy])[0], session);
  assert.deepEqual(calls, [["media", "legacy-html"], ["record", "legacy"]]);
});

test("site state includes new protection alongside either publication format", async () => {
  const matches = await compileGraffitiObjectSchema(siteStateSchema("mypage"));
  for (const object of [legacy, current, protection, removal]) assert(matches(object));
  assert(!matches(record("old-protection", { activity: "Protect", object: "mypage", published: 100 })));
  assert(!matches({ ...protection, value: { ...protection.value, "site name": "other" } }));
  const { "protection removed": _, ...incomplete } = removal.value;
  assert(!matches(record("incomplete", incomplete)));
});

test("protection removal links to the specific protection and wins at equal times", async () => {
  const { graffiti, posts } = publisher();
  await updateSiteProtection(graffiti, "mypage", false, null, session);
  await updateSiteProtection(graffiti, "mypage", true, protection, session);
  const matches = await compileGraffitiObjectSchema(protectionSchema("mypage"));
  assert(posts.every((post) => matches({ ...post, actor: session.actor, url: "posted" })));
  assert.equal(posts[1].value["protection removed"], protection.url);
  const unrelated = record("unrelated", { ...removal.value, "protection removed": "missing" });
  const untrusted = { ...protection, actor: "did:example:mallory", url: "untrusted" };
  assert.deepEqual(
    sortProtectionHistory([protection, removal, unrelated, untrusted], [session.actor]).map((item) => item.url),
    ["removal", "protection"],
  );
});

test("trust decisions use the editor field, enforce authorship, and resolve equal-time untrust", async () => {
  const { graffiti, posts } = publisher();
  await trustActor(graffiti, "did:example:bob", session);
  await trustActor(graffiti, "did:example:bob", session, { untrust: true });
  const trust = record("trust", { ...posts[0].value, time: 100 });
  const untrust = record("untrust", { ...posts[1].value, time: 100 });
  const matches = await compileGraffitiObjectSchema(trustSchema(session.actor));
  assert(matches(trust) && matches(untrust));
  assert(!matches({ ...trust, actor: "did:example:mallory" }));
  assert(!matches(record("old", { activity: "Trust", object: "did:example:bob", published: 100 })));
  for (const decisions of [[trust, untrust], [untrust, trust]]) {
    assert.deepEqual(trustedActors(computeTrustAnnotationsByActor(decisions, ["did:example:bob"]), session.actor), [session.actor]);
  }
});

test("browser history requires private, recent visits in the new format", async () => {
  const matches = await compileGraffitiObjectSchema(browserHistorySchema(100));
  const visit = record("visit", { action: "Visit site", "site address": "mypage?section=introduction", time: 100 }, { allowed: [] });
  assert(matches(visit));
  const { allowed: _, ...publicVisit } = visit;
  assert(!matches(publicVisit));
  assert(!matches({ ...visit, allowed: ["did:example:bob"] }));
  assert(!matches({ ...visit, value: { ...visit.value, time: 99 } }));
  assert(!matches({ ...visit, value: { activity: "View", site: "mypage", published: 100 } }));
});

test("the actual starter discovers both wave formats and publishes the readable format", async () => {
  const html = readFileSync(new URL("../src/edit/starter.html", import.meta.url), "utf8");
  const expression = html.match(/:schema="([\s\S]*?)"/)[1];
  const schema = new Function("__SITE_NAME__", `return (${expression});`)("mypage");
  const matches = await compileGraffitiObjectSchema(schema);
  const oldWave = record("old-wave", { activity: "Wave" });
  const wave = record("wave", { action: "Wave", "site name": "mypage" });
  assert(matches(oldWave) && matches(wave));
  assert(!matches(record("other-wave", { action: "Wave", "site name": "other" })));
  assert(!matches(record("incomplete-wave", { action: "Wave" })));
  const click = [...html.matchAll(/@click="([^"]*)"/g)].find((match) => match[1].includes("$graffiti.post"))[1];
  const posts = [];
  await new Function("__SITE_NAME__", "$graffiti", "$graffitiSession", "processingWave", click)(
    "mypage", { post: async (object) => { posts.push(object); } }, { value: session }, false,
  );
  assert.deepEqual(posts, [{ value: wave.value, channels: ["mypage"] }]);
});


test("a first publication omits previous versions and reads as a history root", async () => {
  const { graffiti, posts } = publisher();
  const first = await createSiteVersion(graffiti, "newsite", "<h1>Hello</h1>", [], "Initial site", session);
  assert(!Object.hasOwn(posts[0].value, "previous versions"));
  const matches = await compileGraffitiObjectSchema(siteVersionsSchema("newsite"));
  assert(matches(first));
  assert(!matches({ ...first, value: { ...first.value, "previous versions": "invalid" } }));
  const later = record("later", { ...current.value, "site name": "newsite", "previous versions": [first.url] });
  const sorted = sortSiteVersions(normalizeSiteVersions([first, later], "newsite"));
  assert.deepEqual(sorted.map((version) => version.url), ["later", first.url]);
  // Already-published new-format records with explicit empty lists still work.
  const explicitEmpty = { ...first, value: { ...first.value, "previous versions": [] } };
  assert(matches(explicitEmpty));
  assert.equal(normalizeSiteVersions([explicitEmpty]).length, 1);
});
