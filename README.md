# dsh-notifications

Desktop notifications and a two-note chime for DeepSeek Harness Web. Runs in your browser, including through an SSH forward such as `http://127.0.0.1:3084/` → server port 3080. No external notification service, audio download, or model tool is needed.

On first load, click **Enable notifications**, then **Allow** in the browser. This also enables audio and sends a test notification. Open **Settings → General → Notifications** to test again, mute the chime, or disable alerts. Preferences belong to the current browser and origin; changing the forwarded port requires permission again.

If you only hear sound, the test control reports whether desktop delivery is requested, reported shown by the browser, or failed. The chime does not prove a desktop banner was displayed. Allow banners for your browser in the operating system notification settings and check Do Not Disturb. Each test creates a new notification and requests that it remain visible until dismissed; browser support varies.

## Events

Notifications show the project directory name as the title and a short body: **Finished**, the first pending question, **Approval needed**, or **Review plan**. Question previews collapse whitespace and stop at 180 characters. Sessions without a project directory use their display title.

The browser tab icon also gets a red dot for these events. Returning to the tab, focusing its window, or interacting with the page clears it. This works in every DSH tab even when desktop notifications are disabled or blocked. The original favicon is restored when the dot clears or the plugin unloads.

- A main thread changes from running to stopped, including normal completion, cancellation, and failure. Each run alerts once. Initial idle history and reconnect snapshots do not alert.
- A main thread has a pending question, approval, or plan review. Each request alerts once; a simultaneous stop while that request is pending does not produce another alert.
- Subagent threads stay silent. A manually forked conversation remains an independent main thread.
- Clicking an alert focuses DSH and opens its thread. A single tab owns automatic notification delivery when several tabs share an origin; another tab takes over when it closes.

Keep a DSH tab open and connected. Desktop browser notifications are supported; closed-tab push and mobile service-worker notifications are outside this plugin. Sound requires a user interaction after a fresh page load: click the page or use the test button. Browser/OS notification settings, Do Not Disturb, suspended tabs, and SSH connectivity can affect delivery. No stale completions are replayed after an outage. The first tab owning notification delivery must have audio unlocked to chime.

## Install

Build and pack this directory, then install the tarball through DSH:

```sh
npm ci
npm run check
npm pack
dsh plugin --profile web add /absolute/path/dsh-notifications-0.1.1.tgz
dsh web
```

The package contains its built browser bundle. It uses DSH's `sessions`, `uiSession.pendingInteractions`, Remote session status events, locale dictionaries, `shell.overlay`, and `settings.general.item` extension points. Verified against local DSH `0.1.5-rc.1`. The host entry only enrolls the browser module; it exposes no server routes or model capabilities. No separate invariant provider is necessary because the plugin owns no mirrored Host state.

For local development, link this directory as a profile dependency and insert the plugin in the profile's `cordis.patch.yml`:

```yaml
- insert:
    - id: dsh-notifications
      name: dsh-notifications
```

Choose either the bundle installer or this explicit patch, so the plugin is mounted once. Live patch reload can activate the explicit entry without restarting DSH. Rebuild with `npm run build` after client changes; DSH client HMR serves the rebuilt bundle.

## Verification

`npm run check` runs keyless behavior tests, builds the package, and syntax-checks the browser artifact. `scripts/verify-live.mjs` uses Playwright against an existing authenticated DSH server; pass `DSH_LOG` pointing to that server's startup log. It keeps the login token out of reports. It checks native Notification construction, real Web Audio oscillator scheduling, controls, persistence, thread navigation, attention kinds, and multi-tab ownership. It injects synthetic events only into its isolated browser; it never prompts a model or changes Host sessions. Screenshots, videos, and reports go into ignored `verification/`.

Browser requirements: [MDN Notifications API](https://developer.mozilla.org/en-US/docs/Web/API/Notifications_API/Using_the_Notifications_API) and [AudioContext.resume](https://developer.mozilla.org/en-US/docs/Web/API/AudioContext/resume).
