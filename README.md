# My App – Quick Start & How It Works

Welcome! This is a small web app built for learning. This guide explains what the project does, how it’s structured, and how to run it on your own machine. It’s written for a first-year student, so no previous experience is required.

## What this project is

- A simple web application you run locally on your computer.
- You edit code in the `src/` folder, save, and the browser refreshes automatically.
- Perfect for experimenting and learning the basics of modern JavaScript/TypeScript and frontend development.

## Prerequisites

Before you start, install:

- **Node.js (LTS)** – download from <https://nodejs.org/>
  (If you already have Node, you can check the version with `node -v`.)

That’s it!

## Getting the project

1. Download or clone this repository to your computer.
2. Open the project folder in your editor (VS Code is a good choice).

## Install dependencies

In the project folder, open a terminal and run:

```bash
npm install
```

This downloads the libraries the app needs.

## Start the app (development mode)

Run:

```bash
npm run dev
```

- Your terminal will print a **Local** URL (something like `http://localhost:xxxx`).
- Open that URL in your browser to see the app.
- Keep the terminal open—when you edit files in `src/`, the page auto-reloads.

> Tip: If the page doesn’t open automatically, just copy the printed URL and paste it into your browser.

## Build for production (optional)

To create an optimized build (the version you would deploy):

```bash
npm run build
```

This generates a `/dist` folder with the production files.

To preview the production build locally:

```bash
npm run preview
```

Then open the URL the terminal shows.

## Project structure (the important parts)

```
project/
├─ src/              # Your application code (components, pages, styles, etc.)
├─ public/           # Static assets (images, icons) copied as-is
├─ package.json      # Scripts and dependencies (where "npm run dev" is defined)
└─ ...               # Config files and other project stuff
```

- **Edit files in `src/`** to change what you see in the browser.
- **Do not edit `node_modules/`** (that’s where your libraries live).
- **`package.json`** is where the `dev`, `build`, and `preview` scripts are defined.

## Common issues & quick fixes

- **`npm run dev` not found**
  Make sure you’re in the **project folder** (where `package.json` is) and you ran `npm install`.

- **Port already in use**
  Another app might be using that port. Stop other dev servers, or press `Ctrl+C` in the terminal and run `npm run dev` again (it usually picks a new port).

- **Node version errors**
  Install the latest **LTS** version of Node.js.

## How to work effectively

1. Run `npm run dev` and keep it running.
2. Make small changes in `src/`, save, and watch the browser update.
3. If something breaks, check the terminal and your browser’s developer console for helpful error messages.

## Contributing (for classmates)

- Create a new branch, make your changes, and open a pull request.
- Keep code simple and add comments if something might be confusing.

---

That’s all you need to get going. Have fun, try things, and don’t be afraid to break it—you’ll learn fastest that way!
