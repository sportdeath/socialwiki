import assert from "node:assert/strict";
import test from "node:test";
import {
  followsOwnVersion, newestFirst,
  type SiteVersion, type VersionFollow,
} from "../src/versions.ts";

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

function follow(url: string, ownVersionUrl: string): VersionFollow {
  return { url, actor: "viewer", allowed: [], channels: ["site:example"], value: {
    action: "Follow site admin versions", "my version": ownVersionUrl,
  } };
}

test("following survives later admin publications until the viewer publishes again", () => {
  const own = { ...version("mine", 100), actor: "viewer" };
  const firstAdmin = version("admin-1", 200, [own.url]);
  const nextAdmin = version("admin-2", 300, [firstAdmin.url]);
  const record = follow("follow", own.url);
  const ordered = newestFirst([own, firstAdmin, nextAdmin]);
  assert.equal(ordered[0].url, nextAdmin.url);
  assert.equal(followsOwnVersion([record], own.url), true);

  const ownNew = { ...version("mine-new", 400, [nextAdmin.url]), actor: "viewer" };
  assert.equal(followsOwnVersion([record], ownNew.url), false);
});

test("old choice records do not enable following", () => {
  const oldChoice = { ...follow("old", "mine"), value: {
    action: "Choose site version", "my version": "mine", choice: "follow",
  } };
  assert.equal(followsOwnVersion([oldChoice], "mine"), false);
});

// The shell must enforce the same confirmation rule as the built-in lenses.
test('guarded publications and follow choices require confirmation; unstamped records remain valid', async () => {
  const { compileGraffitiObjectSchema } = await import('@graffiti-garden/api');
  const { versionSchema, versionFollowSchema, isSiteVersion } = await import('../src/versions.ts');
  for (const [record, schema] of [
    [version('old', 100), versionSchema('example', ['admin'])],
    [follow('follow', 'mine'), versionFollowSchema('viewer')],
  ] as const) {
    const matches = await compileGraffitiObjectSchema(schema);
    assert(matches(record));
    const stamped = { ...record, value: { ...record.value, 'via site': { id: 'game', name: 'Game' } } };
    assert(!matches(stamped));
    assert(matches({ ...stamped, value: { ...stamped.value, 'confirm with guard': true } }));
    if (record.value.action === 'Publish site') assert.equal(isSiteVersion(stamped), false);
    else assert.equal(followsOwnVersion([stamped], 'mine'), false);
  }
});
