<img src="static/logo.svg" alt="Planora logo" width="64" />

# Planora

**Make room for what matters.**

Planora is an AI-assisted home planning and visualization app. It helps turn
your ideas and requirements into an editable floor plan, then lets you refine
the layout and explore it in 3D. AI can suggest and explain changes; you stay
in control of the design.

## What you can do

- **Start with your brief:** describe the home you have in mind and explore
  design options.
- **Edit the plan:** work with rooms, walls, doors, windows, furniture, and
  annotations in the 2D editor.
- **Explore in 3D:** preview the layout and move through the space in
  walkthrough mode.
- **Refine with confidence:** use selection, layers, snapping, undo and redo,
  and version history while you work.
- **Keep and share your work:** save projects in the browser, import plans, and
  export drawings as PNG, PDF, SVG, DXF, or JSON.

## Built with

- [SvelteKit](https://svelte.dev/) and [TypeScript](https://www.typescriptlang.org/)
- [Three.js](https://threejs.org/) for interactive 3D
- [Tailwind CSS](https://tailwindcss.com/) for styling

## Run Planora locally

You need Node.js 24 and npm.

```bash
git clone https://github.com/hello-hammad/Planora.git
cd Planora
npm ci
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

## Project checks

```bash
npm run check
npm test
npm run build
```

## License

Planora includes code distributed under the MIT License. The applicable
license terms and original copyright notice are preserved in [LICENSE](LICENSE).
