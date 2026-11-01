import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { effectScope, nextTick, ref } from 'vue';
import { browserHistorySettingSchema, useBrowserHistory } from '../src/browser/browser-history.ts';

// tsx loads these .ts sources as CommonJS; use the same plugin instance.
const { GraffitiPlugin } = createRequire(import.meta.url)('@graffiti-garden/wrapper-vue');
const { compileGraffitiObjectSchema } = createRequire(import.meta.url)('@graffiti-garden/api');

const alice = { actor: 'alice' };
const stamp = { id: '["https://social.wiki"]', name: 'Social.Wiki' };
function record(value, actor = 'alice') {
  return { actor, value, channels: [actor], allowed: [], url: crypto.randomUUID() };
}
const setting = enabled => record({ action: 'Set browser history', enabled, time: Date.now() });
const visit = address => record({ action: 'Visit site', 'site address': address, time: Date.now() });
const waitFor = async predicate => {
  for (let i = 0; i < 200; i++) {
    if (predicate()) return;
    await new Promise(resolve => setTimeout(resolve, 5));
  }
  assert.fail('History did not reach the expected state');
};

test('history settings are private and require confirmation when stamped', async () => {
  const matches = await compileGraffitiObjectSchema(browserHistorySettingSchema());
  const legacy = setting(true);
  assert(matches(legacy));
  const guarded = { ...legacy, value: { ...legacy.value, 'via site': stamp } };
  assert(!matches(guarded));
  const confirmed = { ...guarded, value: { ...guarded.value, 'confirm with guard': true } };
  assert(matches(confirmed));
  assert(!matches({ ...confirmed, allowed: undefined }));
  assert(!matches({ ...confirmed, allowed: ['bob'] }));
  assert(!matches({ ...confirmed, value: { ...confirmed.value, enabled: 'yes' } }));
});

test('history has explicit account-specific consent, respects cancellation, and stops recording when disabled', async () => {
  // Exercise the real Vue/synchronization path, including its batched local updates.
  const oldVisit = visit('previously-visited');
  const unconfirmed = setting(true);
  unconfirmed.value['via site'] = stamp;
  let records = [oldVisit, unconfirmed, { ...setting(true), actor: 'bob', channels: ['bob'] }];
  const posts = [];
  let denySetting = false;
  let delaySetting;
  let queries = 0;
  const base = {
    sessionEvents: new EventTarget(),
    login() {}, logout() {}, actorToHandle() {}, handleToActor() {},
    getMedia() {}, postMedia() {}, deleteMedia() {},
    async post(object, session) {
      if (object.value.action === 'Set browser history') {
        if (delaySetting) await delaySetting;
        if (denySetting) throw new Error('Canceled');
      }
      const posted = { ...object, actor: session.actor, url: crypto.randomUUID(),
        value: { ...object.value, 'via site': stamp } };
      posts.push(posted);
      records.push(posted);
      return posted;
    },
    async delete(object) {
      const previous = records.find(record => record.url === object.url);
      records = records.filter(record => record.url !== object.url);
      return previous;
    },
    async *discover(channels, schema) {
      queries++;
      const matches = await compileGraffitiObjectSchema(schema);
      for (const object of records) {
        if (object.channels.some(channel => channels.includes(channel)) && matches(object)) {
          yield { object, tombstone: false };
        }
      }
      return { cursor: 'done' };
    },
  };
  GraffitiPlugin.install({ component() {}, config: { globalProperties: {} } }, { graffiti: base });
  base.sessionEvents.dispatchEvent(new CustomEvent('login', { detail: { session: alice } }));
  base.sessionEvents.dispatchEvent(new CustomEvent('initialized'));
  const scope = effectScope();
  const address = ref('first');
  const history = scope.run(() => useBrowserHistory(address));
  try {
    await waitFor(() => history.enabled.value === false);
    assert.equal(history.suggestions()[0].address, 'previously-visited');
    assert.equal(posts.length, 0, 'old visits and unconfirmed settings must not enable recording');
    assert.equal(queries, 1, 'visits and preferences share discovery');

    denySetting = true;
    await history.setEnabled(true);
    assert.equal(history.enabled.value, false);
    assert.equal(history.error.value, 'Canceled');
    assert.equal(posts.length, 0);

    denySetting = false;
    await history.setEnabled(true);
    assert.equal(history.enabled.value, true, 'saved consent takes effect before discovery batches it');
    await waitFor(() => posts.some(object => object.value.action === 'Visit site'));
    assert.equal(posts[0].value['confirm with guard'], true);
    const firstVisit = posts.find(object => object.value.action === 'Visit site');
    assert.equal(firstVisit.value['confirm with guard'], undefined, 'individual visits never ask');

    let finish;
    delaySetting = new Promise(resolve => { finish = resolve; });
    const disabling = history.setEnabled(false);
    address.value = 'while-confirming';
    await nextTick();
    finish();
    await disabling;
    assert.equal(history.enabled.value, false);
    address.value = 'after-disabling';
    await new Promise(resolve => setTimeout(resolve, 80));
    assert.equal(posts.filter(object => object.value.action === 'Visit site').length, 1);
    assert(records.some(object => object.url === oldVisit.url), 'disabling keeps existing visits');
    assert.equal(records.filter(object => object.actor === 'alice' &&
      object.value.action === 'Set browser history' && object.value['confirm with guard']).length, 1);
    assert.equal(queries, 1, 'setting changes use local synchronization, not more discovery');

    base.sessionEvents.dispatchEvent(new CustomEvent('login', { detail: { session: { actor: 'carol' } } }));
    await nextTick();
    await waitFor(() => history.enabled.value === false);
    assert.equal(history.suggestions().length, 0, 'another account does not inherit visits or consent');
  } finally {
    scope.stop();
  }
});
