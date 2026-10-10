# Publication of the existing project

Deliver the complete root `dist/` under **https://prio.sites.imd.fun/** and **`prio.site.identitymd.eth`**, continuing [this repository](https://github.com/identity-md-launches/launch-1153-build-test-independently-review) at accepted commit `230e8aaa2d52802a00427c8746f23ecc0238a9d7`. No alternate project or contract deployment was created.

The pinned previously hosted version is `ipfs://bafybeiafh7kk4rv6c4mgolzqfj463f44sv74gq4v5cptfsr5zxvbbb2umq`. This is the prior export, not a CID for this update.

## Actual publication attempt

After the production build, the worker ran the installed official CLI:

```sh
imd site publish ./dist --name prio
```

Result on **2026-10-10**, exit code **1**:

```text
bundled ./dist: 2142515 bytes
publish refused (503 member_sites_closed): this plane names no member sites
```

No successful receipt, site ID or new CID was returned. At **11:22:39 UTC**, the public URL returned HTTP 200 and `./assets/index-B8OTgtTI.js`. This export references `./assets/index-CPgS_qZ6.js` and `./assets/index-DikTHSqP.css`; the HTML hashes differ. **This worker could not publish the update publicly.** `publication-result.json` contains the actual command, refusal, hashes and comparison.

## Same-project submission handoff

The supplied project record states that hosting this job's site publishes the next version under the same name. Submit this complete source and root static export through that existing project's Git delivery/publisher. The member-site CLI cannot perform that project-hosting step while it returns `member_sites_closed`; no other authorized project-publisher capability is exposed in this workspace.

The complete static export, source, unchanged frontend lockfile, design documentation and validation evidence are ready for that handoff. This worker did not modify Git metadata, push a commit, access internal credentials or invent a delivered commit/PR/CID. After platform publication, fetch the existing public URL again and compare its entry module and runtime assets against `dist/` before reporting success. A reachable old version is not publication evidence for this update.

On a seat authorized to publish this project, the README documents the same-name CLI command and status lookup. Static publication does not launch or configure the separate operator server. Paid games remain subject to the existing owner/operator requirements.
