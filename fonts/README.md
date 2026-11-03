# fonts/

Drop test fonts here; `test/test-fonts.mjs` picks up every `.ttf`, `.otf`, `.woff` and
`.woff2` automatically (or set `FONTS_DIR`). Files in this folder are gitignored
(except this README).

For the container checks, name wrapped fonts after the file they were made from:

```
Foo.ttf   Foo.ttf.woff   Foo.ttf.woff2      ← compared against Foo.ttf
Bar.otf   Bar.otf.woff   Bar.otf.woff2      ← compared against Bar.otf
```

(`Foo.woff2` also works and is matched to `Foo.ttf` or `Foo.otf`.) Include at least one
variable TTF and one CFF-flavoured OTF to cover `gvar`/`HVAR` and the charstring interpreter.

A ready-made set lives in Klint's test fixtures:
`packages/klint/tests/Plugins/fixtures/` (Jost, Marcel, Inter-Variable). WOFF/WOFF2 versions of
any font can be generated with fontTools:

```python
from fontTools.ttLib import TTFont
f = TTFont("Foo.ttf"); f.flavor = "woff2"; f.save("Foo.ttf.woff2")   # needs: pip install fonttools brotli
```

The older `test-*.mjs` files are pinned to `Antique-Legacy-Medium.{ttf,otf,woff,woff2,ttf.woff2}`
and are skipped when it isn't here.
