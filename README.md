# Propwash FPV – landing page

Static landing page for **Propwash FPV**, an FPV drone racing and freestyle mod for Minecraft 26.3
(Fabric and NeoForge). This repository contains only the website.

## Structure

- `index.html` – the page (English and German, switchable)
- `assets/css/style.css` – styles
- `assets/js/main.js` – language switch, image switchers, video demo, gallery lightbox
- `assets/img/` – real in-game screenshots as WebP (800 and 1600 px wide, plus cropped UI shots)
- `assets/fonts/` – Saira and JetBrains Mono, both under the SIL Open Font License 1.1

No build step, no external requests, no cookies, no tracking. The chosen language is kept in the
browser's `localStorage`.

## Preview

Open `index.html` directly in a browser, or serve the folder locally:

```sh
python3 -m http.server 8000
```

## Publish on GitHub Pages

1. Push this folder to a GitHub repository.
2. Settings → Pages → Build and deployment → Source: *Deploy from a branch*, branch `main`, folder `/ (root)`.
3. `.nojekyll` is included, so the files are served exactly as they are.

All paths are relative, so the page also works from a project URL like `https://<user>.github.io/<repo>/`.

Once the mod is live on Modrinth, point the two "Coming soon on Modrinth" buttons (`href="#release"`) and the
release section at the project page.

---

Propwash FPV by lardtom. Not an official Minecraft product. Not approved by or associated with Mojang or Microsoft.
