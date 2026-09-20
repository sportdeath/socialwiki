# Notification feasibility diagnostic

## Click activation, feature detection, and navigate

Run `node kernel/test/browser/notifications/run.mjs` from `socialwiki/` (restart
an older copy), then open <http://127.0.0.1:52181/?display=bridge>. This now has
**Click / navigation tests** in both the native host panel and the production
document below. No browser automation is used.

1. In each panel, use **Control: open from this button** once and close the
   resulting tab. This distinguishes ordinary sandbox/popup restrictions from
   notification-click restrictions. Leave popup settings at their normal value.
2. Select **preventDefault + window.open (MDN example)**, send, and switch to
   another app. The notification is constructed after six seconds so a recent
   test-button click does not mask missing notification activation. Click the
   notification. Compare native versus bridged results; close the destination.
3. Repeat **Default focus** and **preventDefault only**, switching away before
   clicking. Note whether the browser returns focus to the test tab. Avoid
   overlapping outstanding notifications so their labels remain unambiguous.
4. Add observations to the notes field and **Download report**. It contains
   native/document property lists, user activation at event time, cancellation,
   popup return values, and a separate `popup-loaded` acknowledgement. A non-null
   window alone does not prove the destination loaded. An activation flag alone
   does not prove whether an engine allows notification popups.
5. Test **navigate option** last, especially in Safari: run the bridged case
   (currently an explicit `NotSupportedError`) and download before the native
   case. Native navigation may replace the test tab and lose in-memory logs;
   report that visible outcome separately. The destination says it loaded.
   Chrome/Firefox may ignore the option and fire `click` instead. An optional
   native-only comparison is <http://127.0.0.1:52181/?display=native>.

As of the September 2026 review, [MDN's compatibility data](https://github.com/mdn/browser-compat-data/blob/main/api/Notification.json)
lists `navigate` in Safari 18.4+, but not Chrome or Firefox. The diagnostic logs
actual prototype support instead of depending on that table. The [standard](https://notifications.spec.whatwg.org/#activating-a-notification)
lets native `navigate` open/navigate a top-level page **instead of** firing
`click`; forwarding it through the host would skip Social.Wiki's ancestor
navigation handlers. Production continues to reject it pending a routed design.

The existing relay cannot synchronously cancel native default focus.
[Capability Delegation](https://github.com/WICG/capability-delegation) does not
provide a portable notification-click/popup delegation mechanism. Avoid opening
a blank host popup on every click as a workaround: it changes focus, leaves
unwanted windows for handlers that only update the app, and changes the sandbox
inherited by new windows. This diagnostic is evidence gathering, not that workaround.

## No notifications visible: start here

Run the server below and open <http://127.0.0.1:52181/?display=bridge> in **one
browser first**. This compares the original native constructor with the current
production adapter on the same host. It does not substitute the earlier test
adapter. A test-only recorder logs the exact native arguments, constructor
exceptions, and native versus document events. It does not change notification
options or automatically close notifications.

1. Click **A: Native title only**. Allow if prompted. Wait eight seconds. Was
   there a banner, a Notification Center entry, or nothing?
2. Click **B: Send title only** in the document below. Allow the Social.Wiki
   prompt. Wait eight seconds. Compare with A.
3. Click **C: Send example options**, wait eight seconds, then **D: Replay bridge
   options natively**. D is enabled only after the production adapter actually
   reaches the native constructor. It bypasses RPC while using the same options.
4. Enter the visible outcomes in the notes field and **Download report**.
   If needed, repeat A/B with the five-second delay and switch to another tab.

If A shows nothing, first download the comparison report, then try the linked
**native-only page**. It loads no kernel, iframe, bridge, or permission guard.
If even that fails, more bridge code cannot fix that baseline: investigate browser
and OS notification presentation (including Focus, banner settings, and display
sharing restrictions). Browser permission is separate from OS presentation.
Do not change OS settings until noting the initial results; if you change them,
record what changed and repeat the baseline.

How to read the evidence:

- `document-construct` without `bridge-native-construct`: the problem is before
  native creation (guard/transport/adapter); document errors may identify it.
- A succeeds, B fails, D fails: investigate the options the adapter adds.
- `bridge-native-show` without `document-show`: the browser reported showing
  the notification, but that event did not reach the document. Visual outcomes
  are still needed; this alone does not establish an OS banner appeared.
- Native and bridged `show` events but nothing visible: this narrows the issue
  to presentation; a show event alone is not proof of a visible OS banner.
- Any `*-threw` or `*-error` distinguishes a constructor/display failure from
  permission being granted. An eight-second snapshot records missing events
  without treating slow delivery as a definitive failure.

The JSON contains only this fixture's generated notification titles/options,
browser version, source bundle hash, permission/visibility/activation state,
event timings, and your notes. It does not capture your screen or OS settings.

## Production adapter example

The server also serves <http://127.0.0.1:52181/?app=notifications>, which bundles
the **production kernel without diagnostic injection** and runs
[examples/notifications.html](../../../../examples/notifications.html) through
three nested documents. `&depth=1` tests just the root frame. This app uses the
normal Notification API and permission queries. Remember Allow, reload, and check
that the initial synchronous permission already says `granted`; send without
requesting again. Test denial/revocation using the Social.Wiki browser shield
when pasting into that browser, or use browser permission settings here. Include
the blob icon, delayed display, clicking, explicit close, and tab closure.

The older diagnostic below remains available separately to compare activation
and browser behavior. Its permission capability is separate from production.

## Feasibility experiment

Manual desktop test. No browser automation, worker, push subscription, or backend
is installed. The build injects a test adapter
into the existing registry, using the actual permission guard and Penpal relays.
Production source is not changed by this runner. The test has explicit request/send controls;
it does **not** yet prove a synchronous `Notification.permission` facade works.

From `socialwiki/`:

```sh
node kernel/test/browser/notifications/run.mjs
```

Open <http://127.0.0.1:52181/> in Firefox, Safari, and Chrome/Chromium. The default
uses the real kernel's three levels of blob → srcdoc → data documents. The toolbar
also links to depth 1 and a **native baseline** with no kernel or bridge. The
baseline uses the same origin and therefore the same browser permission.
`PROBE_PORT=52182` changes the port. Restart the server after source edits.

## Permission tests (do these before the native baseline)

1. Set browser notification permission for `http://127.0.0.1:52181` to **Ask/default**
   using the browser's site settings. OS notifications must also be enabled for
   that browser. A private window may impose extra notification restrictions.
   If repeating the test, use **Social.Wiki permissions** to revoke/forget the
   diagnostic's remembered decision, then reload before the first-time test.
2. Click **Request permission** in the bridged page. Wait at least five seconds
   at the Social.Wiki dialog, check **Remember this decision**, then Allow. Does
   the native permission prompt appear? Allow it. The page should report `granted`.
3. Send a notification. Reload: the initial state should report both native and
   site permission. Click Request permission again: neither prompt should appear.
   (This explicit request is a probe limitation, not the intended final API.)
4. **Keep the remembered Social.Wiki grant**, reset only the browser notification
   permission to Ask/default, then reload and Request permission. Does the native
   prompt appear without a fresh click in a top-level Social.Wiki dialog? This is
   the key activation test. If the browser resets other site data at the same
   time, record that; it is no longer a remembered-grant test.
5. Test native Deny, then Read permission state / Request permission. Record the
   result. Restore native permission when continuing display tests.

If the bridge fails, download its report **before** following Native baseline.
Reset browser permission again before comparing first-time permission prompts;
otherwise the baseline is only testing an already granted/denied permission.
The baseline distinguishes OS/browser restrictions from bridging failures.

## Display, click, and lifetime tests

- After granting, **Send now**, then **Send in 5 seconds** and switch to another
  tab/app. Record whether notifications appear. A constructor returning or a
  `show` event does not establish that the OS actually displayed a banner.
- Select each click behavior, send a fresh notification, switch away, and click
  it: log only, `window.focus()`, open test window, and `preventDefault()`. Compare
  the native baseline. Reports include native and relayed events, transient user
  activation, popup return value, and host focus/visibility. The leaf's popup may
  also be blocked by the existing document sandbox; that is useful evidence,
  not necessarily a notification adapter defect. Visually confirm the popup.
- Compare **Data URL** and **Document blob URL** icons with the no-icon control.
  These use the same blue square. OSes may ignore icons; compare the native
  baseline before attributing that to bridging. Blob bytes are deliberately not
  transferred, to test whether a fallback is actually needed.
- Explicit **Close this session's notifications** exercises the return bridge.
- Send a fresh notification, then **Remove document** in the host toolbar. Check
  the notification center and click the notification if it survives. The host
  continues recording but disconnected document callbacks stop.
- Separately test reload and closing the entire tab. Download first; after
  reopening, put your observations in the notes field and download again, or
  send those observations in your reply. In-memory logs do not survive tab close.
  No code calls `close()` on teardown, so disappearance here is native behavior.

The experiment requests `requireInteraction`, but browsers/OSes may ignore it.
Nonpersistent notifications cannot run the old page's click handler after the
page is gone; guaranteed persistence/reopening requires a separate persistent
notification design. **Close all test notifications** cleans up notifications
still held by the current host; dismiss older ones in the OS notification center.

Download one report per browser/path, with notes about visible behavior. Reports
include browser version, bundle hash, permission results, event timings, test
source IDs/names and generated icon URLs. Everything stays local until you share
the JSON. The server listens on loopback only; this is not a mobile push test.
