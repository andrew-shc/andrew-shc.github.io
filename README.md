

# Website & Quarto Quick Guide

This site combines traditional HTML and Quarto-generated content.

## Quarto (blog, some pages)
1. Install Quarto: https://quarto.org/docs/get-started/
2. Preview Quarto: `quarto preview`
3. Build Quarto: `quarto render`

## Traditional HTML (main site)
- Edit HTML/CSS/JS files directly in the root folder.

## Serve the Site
- Serve `_site/` (Quarto output) or root folder with:
	`python3 -m http.server --directory _site` (for Quarto)
	`python3 -m http.server` (for root HTML)

## Deploy
- Upload `_site/` (Quarto) and/or root HTML files to your host.
