import assert from "node:assert/strict";
import test from "node:test";
import {
  createSiteVersion,
  normalizeSiteVersions,
  selectPreviousVersions,
  sortSiteVersions,
} from "../src/utils/site-versions.ts";

function version(url, time, previous = []) {
  return {
    url, actor: "did:example:alice", channels: ["site"],
    value: {
      action: "Publish site", "site name": "site", changes: "Change",
      document: `${url}-html`, time,
      ...(previous.length ? { "previous versions": previous } : {}),
    },
  };
}

test("a long sequential history needs only its final tip", () => {
  const history = Array.from({ length: 10_000 }, (_, i) =>
    version(`v${i}`, i, i ? [`v${i - 1}`] : []),
  );
  assert.deepEqual(selectPreviousVersions(history, 10_000), ["v9999"]);
});

test("references include every concurrent tip, omit missing records, and deduplicate", () => {
  const root = version("root", 0);
  const left = version("left", 1, [root.url, root.url]);
  const right = version("right", 2, [root.url]);
  const orphan = version("orphan", 3, ["missing"]);
  const history = [right, orphan, root, left, right];
  const before = structuredClone(history);
  assert.deepEqual(new Set(selectPreviousVersions(history, 10)), new Set(["left", "right", "orphan"]));
  assert.deepEqual(history, before);
});

test("equal and future timestamps are direct predecessors even when they are not tips", () => {
  const old = version("old", 99);
  const equal = version("equal", 100, [old.url]);
  const future = version("future", 1e300, [equal.url]);
  const tip = version("tip", 50, [future.url]);
  const history = [old, equal, future, tip];
  assert.deepEqual(selectPreviousVersions(history, 100), ["equal", "future", "tip"]);
});

test("a legacy future-dated version stays behind the new publication after its successor disappears", () => {
  const legacy = {
    ...version("legacy", 1e300),
    value: {
      activity: "Update", object: "site", summary: "Old format",
      result: { media: "legacy-html" }, published: 1e300, precededBy: [],
    },
  };
  const bridge = version("bridge", 10, [legacy.url]);
  const history = normalizeSiteVersions([legacy, bridge], "site");
  const latest = version("latest", 20, selectPreviousVersions(history, 20));
  assert.deepEqual(latest.value["previous versions"], ["legacy", "bridge"]);
  // Only the hostile ancestor and the new publication remain discoverable.
  assert.equal(sortSiteVersions([history[0], latest])[0].url, latest.url);
});

test("the writer uses the same clock reading for reference selection and publication", async (t) => {
  // A second reading would move backward and require additional predecessors.
  let readings = 0;
  t.mock.method(Date, "now", () => ++readings === 1 ? 200 : 100);
  const older = version("older", 150);
  const equal = version("equal", 200);
  const future = version("future", 1e300);
  const tip = version("tip", 0, [older.url, equal.url, future.url]);
  const history = [older, equal, future, tip];
  const session = { actor: "did:example:alice" };
  const graffiti = {
    async postMedia() { return "uploaded-html"; },
    async post(object) { return { ...object, actor: session.actor, url: "latest" }; },
  };
  const latest = await createSiteVersion(graffiti, "site", "HTML", history, "Update", session);
  assert.equal(readings, 1);
  assert.equal(latest.value.time, 200);
  assert.deepEqual(latest.value["previous versions"], ["equal", "future", "tip"]);
  assert.deepEqual(latest.value["previous versions"], selectPreviousVersions(history, latest.value.time));
});

test("new publications sort ahead of all observed survivors across small DAGs and deletions", () => {
  // Every acyclic four-version graph in this creation order, each assignment
  // of timestamps below/equal/above T, and every subset of surviving metadata.
  const edges = [];
  for (let child = 0; child < 4; child++) {
    for (let parent = 0; parent < child; parent++) edges.push([parent, child]);
  }
  for (let graph = 0; graph < 2 ** edges.length; graph++) {
    for (let times = 0; times < 3 ** 4; times++) {
      const history = Array.from({ length: 4 }, (_, i) => version(
        `old-${i}`,
        Math.floor(times / (3 ** i)) % 3,
        edges.flatMap(([parent, child], bit) =>
          child === i && (graph & (1 << bit)) ? [`old-${parent}`] : [],
        ),
      ));
      const latest = version("new", 1, selectPreviousVersions(history, 1));
      for (let surviving = 0; surviving < 16; surviving++) {
        const remaining = history.filter((_, i) => surviving & (1 << i));
        assert.equal(
          sortSiteVersions([...remaining, latest])[0].url,
          latest.url,
          `graph=${graph}, times=${times}, surviving=${surviving}`,
        );
      }
    }
  }
});
