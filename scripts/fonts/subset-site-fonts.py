"""Regenerate only the licensed Noto supplements, never used during next build.

Usage: python subset-site-fonts.py SOURCE_DIRECTORY OUTPUT_DIRECTORY
Supply the pinned original TTFs from public/fonts/manifest.json. FontTools 4.68.0
and Brotli 1.2.1 are generation tools, not application dependencies.
"""
from pathlib import Path
import hashlib
import json
import sys
from fontTools.ttLib import TTFont
from fontTools import subset

repository = Path(__file__).resolve().parents[2]
manifest = json.loads((repository / 'public/fonts/manifest.json').read_text(encoding='utf-8'))
source_dir = Path(sys.argv[1]).resolve()
output_dir = Path(sys.argv[2]).resolve()
output_dir.mkdir(parents=True, exist_ok=True)
for family in manifest['families']:
    entry = family.get('supplement')
    if not entry:
        continue
    original = source_dir / entry['upstream']
    if hashlib.sha256(original.read_bytes()).hexdigest() != entry['source']['sha256']:
        raise ValueError('Source font checksum mismatch: ' + original.name)
    options = subset.Options()
    options.layout_features = ['*']
    options.name_IDs = ['*']
    options.name_legacy = True
    options.name_languages = ['*']
    options.recalc_timestamp = False
    font = TTFont(original, recalcTimestamp=False)
    processor = subset.Subsetter(options=options)
    processor.populate(unicodes=entry['supplementCodepoints'])
    processor.subset(font)
    font.flavor = 'woff2'
    output = output_dir / (family['id'] + '-supplement.woff2')
    font.save(output)
    expected = next(asset for asset in manifest['files'] if asset['family'] == family['family'] and asset.get('supplement'))
    if hashlib.sha256(output.read_bytes()).hexdigest() != expected['sha256']:
        raise ValueError('Subset differs; check the pinned tooling versions')
    print(f'{family["family"]}: {output.stat().st_size} bytes; checksum verified')
