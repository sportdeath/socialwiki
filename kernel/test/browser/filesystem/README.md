# Local file editing manual test

This test bundles the production kernel and its File System adapter. The example
uses ordinary `showSaveFilePicker`, `showOpenFilePicker`, `getFile`, and
`createWritable().write()/close()` calls. The real peripheral guard, remembered
permissions, revocation, ancestor scopes, and Penpal relay are used throughout.
The Edit lens is unchanged.

The native handle stays at the trusted host. The opaque document receives a
small facade; `File` snapshots travel over Penpal using native structured cloning.
The default page runs through blob → srcdoc → data frames, as in Social.Wiki.

## Run manually

From the Social.Wiki repository:

```sh
node kernel/test/browser/filesystem/run.mjs
```

Open <http://127.0.0.1:52180/> in desktop **Chrome**. The server compiles current
sources on startup and never launches or controls a browser. Ctrl+C stops it.
Use `PROBE_PORT=52181` for another port. `?depth=1` tests only the root blob frame
if the default nesting fails.

The page is [examples/filesystem.html](../../../../examples/filesystem.html).
It can also be pasted into Social.Wiki with the appropriate init.js URL, as long
as that instance’s trusted host runs the updated kernel.

1. Click **Create scratch HTML file**, allow the Social.Wiki prompt, and choose a
   **new disposable file** in the native Save dialog. The starter HTML is written
   to that file. Choosing an existing file replaces its contents.
2. Open that file in VS Code, Zed, or another local editor. Change the heading and
   save. The source and preview should update within roughly a second. Save again
   to verify the handle remains usable. The preview does not execute scripts.
3. Click **Append a test comment from browser**. Verify that the local editor
   notices the appended comment. Avoid editing simultaneously during this write:
   the example does not implement conflict-safe two-way editing.
4. Click **Disconnect**, edit locally, and confirm the page stops updating. Use
   **Connect existing file** to resume. This does not overwrite the selected file.
5. Use **Permissions** to revoke local-file access while connected. Further reads
   and writes should fail. Reconnect and also try Deny, picker cancellation, and
   **Remember this decision** followed by disconnect/reconnect or page reload.
6. Leave a native write-permission prompt open for more than 15 seconds, then
   allow it. The operation should still complete. Revoke access while a prompt
   is open as well: allowing it afterward must not create a usable writer.

For an optional atomic-replacement test, run this in a terminal while connected
**to the disposable test file**. Paste its absolute path when prompted:

```sh
python3 -c 'from pathlib import Path; import tempfile, os; p=Path(input("Scratch HTML file path: ")).expanduser(); text=p.read_text(); f=tempfile.NamedTemporaryFile(mode="w", dir=p.parent, delete=False); f.write(text+"\n<!-- Atomic replacement test -->\n"); f.close(); os.replace(f.name,p)'
```

The page should either observe the replacement or clearly fail on the stale
handle. Reconnecting should recover. This tests the save strategy used by some
editors and agentic tools, rather than assuming every save edits the same file
in place. Do not rename or remove files you want to keep to run this test.

## Standard API compatibility page

Open <http://127.0.0.1:52180/?app=compatibility> for the same nested kernel with
`examples/peripheral-compatibility.html`. Check location permission before/after
requesting a fix, list/select cameras and microphones, and unplug/reconnect a
device to test `devicechange`. In Chromium, read a file, browse a folder, and save
a new scratch file using `startIn`, `queryPermission`, and stream piping.
Firefox/Safari should show local pickers as unavailable using ordinary feature
detection. No browser automation is used.

## What this establishes

- Native pickers after the trusted prompt, including a delayed click on Allow.
- Native pickers with remembered grants and activation relayed through ancestors.
- Creating/writing a normal file that a local editor can open.
- Repeated fresh `getFile()` snapshots after external saves and file replacement.
- Explicit browser writes, and native permission prompts they may require.
- Revocation, disconnect, and cancellation during native picker/writer operations.

Disconnect stops the example's polling and drops its handle reference. The
standard File System API has no handle-close method; use Permissions revocation
to invalidate the document's handles, or leave/reload the document. Previously
read content remains visible after revocation; completed writes cannot be rolled
back. Revocation aborts open, uncommitted writers, but cannot guarantee
cancellation once a native commit has begun.

## Boundaries and limitations

See the [production adapter documentation](../../../src/bridges/peripherals/README.md#file-system-adapter)
for the supported API surface and portability limits. The example polls once a
second and does not use FileSystemObserver; background tabs may throttle polling.
Reloads require selecting the file again, even when site permission is remembered.
Native picker UI cannot be dismissed programmatically; late results are discarded.
