#!/usr/bin/env python3
"""Pre-render script: reads _vars.css and syncs all places that need hardcoded hex.
- iframe_match.scss    ($body-bg, $body-color — SCSS compile-time vars)
- _entry_dark_vars.css (CSS custom property hex values)
- _qmd_styling.css     (SVG data-URI fill colors)
- preprocessing.html   (native <option> hardcoded colors)
"""
import re, sys

# ── Helpers ───────────────────────────────────────────────────────────────────

def extract(css, var):
    m = re.search(rf'--{re.escape(var)}:\s*(#[0-9a-fA-F]{{3,8}})', css)
    if not m:
        print(f"[sync-palette] ERROR: --{var} not found in _vars.css", file=sys.stderr)
        sys.exit(1)
    return m.group(1)

def extract_from_block(css, selector, var):
    """Extract a CSS custom property value from inside a specific selector block."""
    block_m = re.search(
        rf'{re.escape(selector)}\s*\{{([^}}]*)\}}',
        css, re.DOTALL
    )
    if not block_m:
        return None
    m = re.search(rf'--{re.escape(var)}:\s*(#[0-9a-fA-F]{{3,8}})', block_m.group(1))
    return m.group(1) if m else None

def patch_css_var(css, var, value):
    """Replace the hex value of a CSS var anywhere in the file."""
    return re.sub(
        rf'(--{re.escape(var)}:\s*)#[0-9a-fA-F]{{3,8}}',
        rf'\g<1>{value}',
        css
    )

def hex_to_rgb(h):
    h = h.lstrip('#')
    if len(h) == 3:
        h = ''.join(c * 2 for c in h)
    r, g, b = int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)
    return f'{r}, {g}, {b}'

# ── Read source of truth ──────────────────────────────────────────────────────

with open('_vars.css') as f:
    vars_css = f.read()

VARS = ['back-body', 'front-body', 'accent-front-body', 'accent-back-body', 'sub-accent-front-body']

# :root palette (= dark/default mode)
palette = {v: extract(vars_css, v) for v in VARS}

# body.quarto-dark palette (= light/toggled mode); fall back to root if absent
dark_palette = {}
for v in VARS:
    val = extract_from_block(vars_css, 'body.quarto-dark', v)
    dark_palette[v] = val if val else palette[v]

root_accent_rgb = hex_to_rgb(palette['accent-front-body'])
dark_accent_rgb = hex_to_rgb(dark_palette['accent-front-body'])

# ── iframe_match.scss (Bootstrap SCSS compile-time vars) ─────────────────────

with open('iframe_match.scss') as f:
    scss = f.read()
scss = re.sub(r'(\$body-bg:\s*)#[0-9a-fA-F]{3,8}',   rf"\g<1>{palette['front-body']}",        scss)
scss = re.sub(r'(\$body-color:\s*)#[0-9a-fA-F]{3,8}', rf"\g<1>{palette['accent-front-body']}", scss)
with open('iframe_match.scss', 'w') as f:
    f.write(scss)
print(f"[sync-palette] iframe_match.scss: $body-bg={palette['front-body']}  $body-color={palette['accent-front-body']}")

# ── _entry_dark_vars.css (CSS vars for entry listing pages) ──────────────────

with open('_entry_dark_vars.css') as f:
    entry_css = f.read()
for var, value in palette.items():
    entry_css = patch_css_var(entry_css, var, value)
with open('_entry_dark_vars.css', 'w') as f:
    f.write(entry_css)
print(f"[sync-palette] _entry_dark_vars.css: {', '.join(f'{k}={v}' for k,v in palette.items())}")

# ── _qmd_styling.css (SVG data-URI fill colors) ───────────────────────────────
# CSS vars can't be used inside url() data URIs, so fills are baked-in hex.
# Unscoped rules use the :root accent; body.quarto-dark rules use the dark accent.
# Two-pass: mark dark-context fills → patch remaining → restore marked.

PLACEHOLDER = '__DARK_FILL__'

with open('_qmd_styling.css') as f:
    qmd_css = f.read()

# Pass 1: replace fills inside body.quarto-dark { … } blocks with placeholder
qmd_css = re.sub(
    r'(body\.quarto-dark[^{]*\{[^}]*?)(fill: rgb\()([\d, ]+)(\))',
    lambda m: m.group(1) + m.group(2) + PLACEHOLDER + m.group(4),
    qmd_css,
    flags=re.DOTALL
)

# Pass 2: replace remaining (root-context) fills with :root accent
qmd_css = re.sub(
    r'(fill: rgb\()([\d, ]+)(\))',
    lambda m: m.group(1) + root_accent_rgb + m.group(3),
    qmd_css
)

# Pass 3: restore placeholder with dark-mode accent
qmd_css = qmd_css.replace(f'fill: rgb({PLACEHOLDER})', f'fill: rgb({dark_accent_rgb})')

with open('_qmd_styling.css', 'w') as f:
    f.write(qmd_css)
print(f"[sync-palette] _qmd_styling.css SVG fills: root=rgb({root_accent_rgb})  dark=rgb({dark_accent_rgb})")

# ── preprocessing.html (native <option> hardcoded colors) ────────────────────
# Native <option> elements cannot resolve CSS custom properties; hardcode palette.

with open('preprocessing.html') as f:
    html = f.read()
html = re.sub(
    r'\bbackground-color:\s*#[0-9a-fA-F]{3,8}',
    f'background-color: {palette["front-body"]}',
    html
)
html = re.sub(
    r'(?<!-)color:\s*#[0-9a-fA-F]{3,8}',
    f'color: {palette["accent-front-body"]}',
    html
)
with open('preprocessing.html', 'w') as f:
    f.write(html)
print(f"[sync-palette] preprocessing.html: option bg={palette['front-body']}  option color={palette['accent-front-body']}")
