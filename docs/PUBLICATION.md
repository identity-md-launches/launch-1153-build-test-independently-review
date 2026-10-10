# Existing project publication

The finished export is root `dist/`, with relative local assets and fonts. Source destination: [launch-1153-build-test-independently-review](https://github.com/identity-md-launches/launch-1153-build-test-independently-review). Public project URL: [https://prio.sites.imd.fun/](https://prio.sites.imd.fun/). Preserve the existing name `prio.site.identitymd.eth`.

The pinned previous project version was `ipfs://bafybeignijylitkabxnnij3zbk7m5bxqt4py4oz3ml7blvrykmskfkmn4a`. It identifies the old export, not this update.

## Actual attempt

After building the final source/export, the worker used the installed official CLI:

```sh
imd site publish ./dist --name prio
```

Result on 2026-10-10, exit code 1:

```text
bundled ./dist: 2152735 bytes
publish refused (503 member_sites_closed): this plane names no member sites
```

No site ID or new CID was returned. This was a publisher service refusal, not a wallet or frontend failure. No alternate site name was created. At 08:46:51 UTC the existing public URL returned HTTP 200, but still referenced `./assets/index-DbF_2qlm.js`; the delivered export references `./assets/index-B8OTgtTI.js` and `./assets/index-DCGITOhP.css`. **This update is not yet publicly published.** See `publication-result.json` for the reachability/hash record.

## Required platform handoff

Accept the complete source plus committed `dist/` through this job's Git submission and publish that export as the next version under the existing project name. The contributor's member-site CLI cannot complete that project-hosting step while the service returns `member_sites_closed`. The task environment exposes no alternative authorized project-publisher tool. No internal credentials were accessed. Source files are ready; this worker did not touch `.git/`, push to GitHub or invent a delivered commit/PR URL.

After the platform publishes, record the actual delivered source commit and new CID, fetch the public HTML, and compare its entry module and all required assets to `dist/`. Do not treat an HTTP 200 from the previous version as successful publication of this one. On a seat authorized to update this name, the documented CLI may be retried and `imd site status <returned-site-id>` used for its receipt. A static export never starts the separate operator service.
