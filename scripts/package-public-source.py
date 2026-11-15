#!/usr/bin/env python3
"""Build a reusable source ZIP; large runtime assets are restored by hash.

Only explicitly selected source directories and configuration files are packed.
Hosting identity, credentials, local state and build/review outputs are excluded.
Run after the release source and assets are stable.
"""
import argparse
import hashlib
import json
from pathlib import Path
import stat
import tempfile
import zipfile

ROOT = Path(__file__).resolve().parent.parent
ROOT_FILES = (
    "README.md", "LICENSE", "package.json", "package-lock.json", "index.html",
    "tsconfig.json", "vite.config.ts", "playwright.config.ts",
    "playwright.review.config.ts", ".gitignore",
)
SOURCE_TYPES = {
    "src": {".ts", ".tsx", ".js", ".mjs", ".css", ".scss", ".json", ".svg"},
    "tests": {".ts", ".tsx", ".js", ".mjs", ".json"},
    "scripts": {".py", ".sh", ".js", ".mjs", ".cjs", ".ts"},
    "docs": {".md", ".html", ".txt", ".json", ".css", ".svg"},
    "public/docs": {".md", ".html", ".txt", ".json", ".css", ".svg"},
    "public/presentation-assets": {".png", ".jpg", ".jpeg", ".webp", ".md", ".txt", ".json"},
}
EXCLUDED_PARTS = {
    "node_modules", "dist", ".local", ".git", ".openai", "review-results",
    "test-results", "playwright-report", "__pycache__", ".aws", ".codex",
    ".agents", ".ssh",
}


def forbidden(path):
    return any(part in EXCLUDED_PARTS or part == ".env" or part.startswith(".env.")
               or part.startswith(".download-") for part in path.parts)


def regular_file(path):
    """Do not follow symlinks into credentials or unrelated workspaces."""
    relative = path.relative_to(ROOT)
    for parent in (path, *path.parents):
        if parent == ROOT:
            break
        if parent.is_symlink():
            raise ValueError(f"Refusing symlink in source: {relative}")
    if not stat.S_ISREG(path.stat().st_mode):
        raise ValueError(f"Not a regular file: {relative}")
    return relative.as_posix()


def selected_sources():
    selected = {}
    for name in (*ROOT_FILES, "public/presentation.html", "public/presentation.pdf", "public/assets/credits.json"):
        path = ROOT / name
        if not path.exists():
            raise ValueError(f"Required source file is missing: {name}")
        selected[regular_file(path)] = path
    for directory, extensions in SOURCE_TYPES.items():
        for path in (ROOT / directory).rglob("*"):
            relative = path.relative_to(ROOT)
            if forbidden(relative) or path.suffix not in extensions or not path.is_file():
                continue
            selected[regular_file(path)] = path
    return selected


def asset_manifest():
    records = []
    for path in sorted((ROOT / "public/assets").rglob("*")):
        relative = path.relative_to(ROOT)
        if forbidden(relative):
            raise ValueError(f"Unexpected private/temporary file in assets: {relative}")
        if path.is_symlink():
            raise ValueError(f"Refusing asset symlink: {relative}")
        if path.is_dir():
            continue
        name = regular_file(path)
        digest = hashlib.sha256()
        size = 0
        with path.open("rb") as stream:
            for chunk in iter(lambda: stream.read(1024 * 1024), b""):
                size += len(chunk)
                digest.update(chunk)
        records.append({"path": name, "bytes": size, "sha256": digest.hexdigest()})
    if not records:
        raise ValueError("No runtime assets found")
    return {
        "version": 1,
        "algorithm": "sha256",
        "assetDirectory": "public/assets",
        "files": records,
    }


def add_bytes(archive, name, data, executable=False):
    entry = zipfile.ZipInfo("beyond/" + name, date_time=(1980, 1, 1, 0, 0, 0))
    entry.compress_type = zipfile.ZIP_DEFLATED
    entry.create_system = 3
    entry.external_attr = (stat.S_IFREG | (0o755 if executable else 0o644)) << 16
    archive.writestr(entry, data)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=ROOT / "public/source.zip")
    parser.add_argument("--dry-run", action="store_true", help="Validate inputs and manifest without writing a ZIP")
    args = parser.parse_args()
    sources = selected_sources()
    manifest = asset_manifest()
    total = sum(item["bytes"] for item in manifest["files"])
    print(f"Selected {len(sources)} source files; manifest covers {len(manifest['files'])} assets ({total:,} bytes).")
    if args.dry_run:
        return
    output = args.output.absolute()
    if output.is_symlink() or output in sources.values():
        raise ValueError("Output must not replace a source file or symlink")
    output.parent.mkdir(parents=True, exist_ok=True)
    # Atomic publication prevents serving a partially written source archive.
    with tempfile.NamedTemporaryFile(prefix=".source-", suffix=".zip", dir=output.parent, delete=False) as temporary:
        temporary_path = Path(temporary.name)
    try:
        with zipfile.ZipFile(temporary_path, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
            for name, path in sorted(sources.items()):
                add_bytes(archive, name, path.read_bytes(), bool(path.stat().st_mode & stat.S_IXUSR))
            add_bytes(archive, "asset-manifest.json", (json.dumps(manifest, indent=2) + "\n").encode())
        temporary_path.chmod(0o644)
        temporary_path.replace(output)
    finally:
        temporary_path.unlink(missing_ok=True)
    print(f"Wrote {output} ({output.stat().st_size:,} bytes). Runtime asset bytes are excluded except credits.json.")


if __name__ == "__main__":
    main()
