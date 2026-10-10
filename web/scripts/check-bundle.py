#!/usr/bin/env python3
"""Check submission integrity without dependencies or changes to Git metadata."""
import gzip
import hashlib
import io
import json
from pathlib import Path
import re
import subprocess
import tarfile
import tempfile
from html.parser import HTMLParser

ROOT = Path(__file__).resolve().parents[2]
LIMIT = 8_388_608
REPORT = ROOT / "docs/BUNDLE-CHECK.json"


def git(*args):
    return subprocess.check_output(["git", *args], cwd=ROOT)


def submission_files():
    names = set(git("ls-files", "--cached", "--others", "--exclude-standard", "-z").decode().split("\0"))
    return sorted(ROOT / name for name in names if name)


changed = git("diff", "--name-only", "HEAD").decode().splitlines()
assert changed == ["README.md"], f"Unexpected change to original files: {changed}"
assert not any(line.startswith(b"160000 ") for line in git("ls-files", "--stage").splitlines()), "Git submodule found"

for path in submission_files():
    parts = path.relative_to(ROOT).parts
    assert not path.is_symlink(), f"Unexpected symlink: {path}"
    assert not any(part in {"node_modules", ".cache", ".npm", ".vite", "__pycache__", ".github", ".git"} for part in parts), path
    assert not any(part == ".env" or part.startswith(".env.") for part in parts), path
    assert path.suffix not in {".tgz", ".zip", ".gz", ".pyc"}, path

assert not (ROOT / "web/node_modules").exists(), "Remove disposable dependencies before delivery"
manifest = json.loads((ROOT / "docs/ASSETS.json").read_text())
art_bytes = 0
for asset in manifest["assets"]:
    source = ROOT / asset["path"]
    data = source.read_bytes()
    assert len(data) == asset["bytes"], source
    assert hashlib.sha256(data).hexdigest() == asset["sha256"], source
    relative = source.relative_to(ROOT / "web/public")
    assert (ROOT / "dist" / relative).read_bytes() == data, relative
    if "stillFallback" in asset:
        assert (ROOT / asset["stillFallback"]).is_file(), asset
    art_bytes += len(data)
assert art_bytes == manifest["totalBytes"]
assert len(manifest["assets"]) == 24
assert sum(asset["frames"] > 1 for asset in manifest["assets"]) == 4


class References(HTMLParser):
    def __init__(self):
        super().__init__()
        self.paths = []

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        for key in ("src", "href"):
            if key in attrs:
                self.paths.append(attrs[key])
        if attrs.get("property") == "og:image":
            self.paths.append(attrs["content"])


parser = References()
parser.feed((ROOT / "dist/index.html").read_text())
for path in parser.paths:
    assert path.startswith("./"), f"Nonrelative export reference: {path}"
    assert (ROOT / "dist" / path).is_file(), path

font_hashes = {hashlib.sha256(p.read_bytes()).hexdigest() for p in (ROOT / "web/src/fonts").glob("*.woff2")}
export_font_hashes = {hashlib.sha256(p.read_bytes()).hexdigest() for p in (ROOT / "dist/assets").glob("*.woff2")}
assert len(font_hashes) == 3 and font_hashes == export_font_hashes
for css in (ROOT / "dist/assets").glob("*.css"):
    for url in re.findall(r"url\(([^)]+)\)", css.read_text()):
        path = url.strip("\"'")
        if not path.startswith("data:"):
            assert not path.startswith(("/", "http:" , "https:")), path
            assert (css.parent / path).is_file(), path

package = json.loads((ROOT / "web/package.json").read_text())
lock = json.loads((ROOT / "web/package-lock.json").read_text())["packages"][""]
for field in ("dependencies", "devDependencies"):
    assert package[field] == lock[field], f"Lockfile mismatch: {field}"

result = {
    "date": "2026-10-10",
    "command": "python3 web/scripts/check-bundle.py",
    "result": "passed",
    "limitBytes": LIMIT,
    "measurement": "All tracked and nonignored untracked regular files, including this report; .imd inputs, artifacts and scratch are excluded by existing repository rules.",
    "prospectiveGitFileCount": 0,
    "prospectiveGitContentBytes": 0,
    "distBytes": sum(p.stat().st_size for p in (ROOT / "dist").rglob("*") if p.is_file()),
    "localArtBytes": art_bytes,
    "manifestAssetsVerified": 24,
    "animatedWebPAssetsWithStills": 4,
    "fontSourceExportHashesMatched": 3,
    "relativeExportReferencesVerified": parser.paths,
    "packageLockMatchesManifest": True,
    "onlyOriginalFileModified": "README.md",
    "protectedExistingPathsUnchanged": True,
    "ignoreFilesUnchanged": True,
    "gitSubmodules": 0,
    "dependencyCacheArchiveFilesInSubmission": 0,
    "publicPublication": "incomplete: official publisher returned HTTP 503 member_sites_closed"
}
for _ in range(6):
    REPORT.write_text(json.dumps(result, indent=2) + "\n")
    paths = submission_files()
    size = sum(p.stat().st_size for p in paths)
    if result["prospectiveGitContentBytes"] == size and result["prospectiveGitFileCount"] == len(paths):
        break
    result["prospectiveGitFileCount"] = len(paths)
    result["prospectiveGitContentBytes"] = size
else:
    raise RuntimeError("Report size failed to stabilize")
assert size < LIMIT, f"Uncompressed submission exceeds cap: {size}"

# A complete deterministic archive is created outside the repository. Its
# receipt is outside Git to avoid a self-referential size/hash assertion.
archive = Path(tempfile.gettempdir()) / "prism-riot-submission.tar.gz"
with archive.open("wb") as raw, gzip.GzipFile(fileobj=raw, mode="wb", filename="", mtime=0) as compressed:
    with tarfile.open(fileobj=compressed, mode="w", format=tarfile.USTAR_FORMAT) as tar:
        for path in paths:
            data = path.read_bytes()
            info = tarfile.TarInfo(str(path.relative_to(ROOT)))
            info.size = len(data)
            info.mode = 0o644
            tar.addfile(info, io.BytesIO(data))
assert archive.stat().st_size < LIMIT
receipt = {
    **result,
    "completeCompressedArchiveBytes": archive.stat().st_size,
    "completeCompressedArchiveSha256": hashlib.sha256(archive.read_bytes()).hexdigest(),
    "archiveLocationOutsideRepository": str(archive)
}
(ROOT / "artifacts").mkdir(exist_ok=True)
(ROOT / "artifacts/bundle-check-final.json").write_text(json.dumps(receipt, indent=2) + "\n")
print(json.dumps(receipt, indent=2))
