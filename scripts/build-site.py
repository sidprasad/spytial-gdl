"""Build Material docs and stage the existing site for GitHub Pages."""
from pathlib import Path
import shutil
import subprocess
import sys

ROOT = Path(__file__).resolve().parent.parent
SITE = ROOT / "site"

subprocess.run(
    [sys.executable, "-m", "mkdocs", "build", "--strict", "--config-file", str(ROOT / "mkdocs.yml")],
    check=True,
    cwd=ROOT,
)
for name in ("assets", "src", "vendor", "playground", "skills"):
    shutil.copytree(ROOT / name, SITE / name, dirs_exist_ok=True)
for name in ("index.html", ".nojekyll", "spytial-gdl-language.json", "SKILL.md", "llms.txt", "CHANGELOG.md"):
    shutil.copy2(ROOT / name, SITE / name)

# Published agent references link directly to these Markdown source URLs.
raw_docs = SITE / "docs" / "pages"
raw_docs.mkdir(exist_ok=True)
for page in (ROOT / "docs" / "pages").glob("*.md"):
    shutil.copy2(page, raw_docs / page.name)
print(f"Site built at {SITE}")
