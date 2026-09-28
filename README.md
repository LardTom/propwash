# Propwash FPV – landing page

Static landing page for **Propwash FPV**, an FPV drone racing and freestyle mod for Minecraft 26.3
(Fabric and NeoForge). This repository contains only the website.

## Structure

- `index.html` – the page (English and German, switchable)
- `assets/css/style.css` – styles
- `assets/js/main.js` – language switch, image switchers, video demo, gallery lightbox
- `assets/img/` – real in-game screenshots as WebP (800 and 1600 px wide, plus cropped shots) and `og-image.jpg` for link previews
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

Once the mod is live on Modrinth, point the "Coming soon to Modrinth" button in the hero (`href="#release"`) and
the release section at the project page.

## Link previews

`og:image` and `twitter:image` need an absolute URL. They point to
`https://lardtom.github.io/propwash-site/assets/img/og-image.jpg`, which is right if the repository is called
`propwash-site`. With a different repository name (or a custom domain), change both URLs in the `<head>` of
`index.html`.

---

Propwash FPV by lardtom. Not an official Minecraft product. Not approved by or associated with Mojang or Microsoft.
