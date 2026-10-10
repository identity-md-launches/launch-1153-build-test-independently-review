# Static publication

The production artifact is repository-root `dist/`. Publish its contents, including the local artwork and fonts. The frontend uses relative asset URLs and hash navigation so the same export can run beneath an IPFS gateway path without a rewrite server. The publisher must serve the finished export; it does not rebuild the source.

## Project source destination

The requested source repository is [PRISM RIOT's existing application repository](https://github.com/identity-md-launches/launch-1158-complete-missing-application-deployment), with accepted application source at commit `0345ffa67225afed469453250362e74b7f00ff42`. This assignment's worker submits changed files through the IdentityMD job handoff. GitHub delivery is a separate platform publisher step; it supplies the delivered commit and pull-request URL after accepting the submission. The implementation process does not modify `.git/` or assume that an existing repository URL proves the new website was pushed.

## IPFS publication mechanism

IdentityMD's official worker provides `imd site publish ./dist --name prism-riot`. It bundles the export, uploads it to the IdentityMD publisher, pins the content to IPFS, and reports the assigned public name. See the [official worker documentation](https://github.com/Identity-md/worker#your-own-site).

This command uses the paired worker's device authentication internally. It requires no Ethereum transaction or browser key, and no credentials belong in the export. The public name belongs to the publishing seat; the project's owner should control future production updates through the platform's project delivery or an owner-controlled publishing seat. A successful name publication alone does not establish ownership transfer or successful GitHub delivery.

The CLI accepts names of 3–32 lowercase letters, digits, and hyphens. A name already owned by another seat or a launched project is unavailable. A directory publication is limited to an 8 MB compressed bundle. `imd site status <site-id>` reports the resulting CID and public URL. Retain the CID when updating the name so the previous version remains identifiable.

## Validation before publication

1. Install the frontend's locked dependencies in an allowed disposable dependency directory and run the documented typecheck and production build.
2. Serve `dist/` beneath a subpath and verify local asset loading, hash navigation, responsive controls, and unavailable-wallet/network states.
3. Confirm source and `dist/` contain the required assets and no secrets, dependency directories, caches, or packaging archives.
4. Keep the complete Git submission bundle under 8,388,608 bytes.
5. Publish the final export once validation is complete; record the actual status, CID, and reachable URL below.

## Publication record

Attempted on 2026-10-10 after the final production build, contract checks, and 21 passing browser checks. The frozen export's entry module was `assets/index-DbF_2qlm.js`.

Actual command:

```sh
PATH=/home/debian/.nvm/versions/node/v24.21.0/bin:$PATH \
/home/debian/.nvm/versions/node/v24.21.0/bin/node \
/home/debian/.nvm/versions/node/v24.21.0/lib/node_modules/@identitymd/worker/dist/cli.js \
site publish ./dist --name prism-riot
```

Actual result, exit code 1:

```text
bundled ./dist: 2115058 bytes
publish refused (503 member_sites_closed): this plane names no member sites
```

**IPFS publication is incomplete.** The official publishing service refused member-site creation. This is a service-wide restriction, not a label collision, so changing the name would not repair it. No site ID, CID, ENS name or usable public website URL was returned. Consequently public URL and gateway asset checks could not run; no public reachability is claimed. The validated export remains complete and unchanged in `dist/`.

The platform also defines a separate project-hosting step that consumes accepted job artifacts and produces a CID/name. It requires the platform's internal publisher, rather than the contributor's `imd site` CLI. The task handoff must complete that project publication and GitHub delivery, or the service must enable the official member-site route before a worker can retry. No internal publisher credentials were accessed, no alternate server was guessed, and no anonymous third-party upload was substituted.

The existing [source repository](https://github.com/identity-md-launches/launch-1158-complete-missing-application-deployment) is a verified destination, not evidence that this new website commit has already been accepted or pushed. A delivered commit/PR and a successful public site receipt must be added when those platform steps finish.
