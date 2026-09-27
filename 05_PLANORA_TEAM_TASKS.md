# PLANORA TEAM TASKS v2

## IMPORTANT

Each person may work locally without Git/GitHub for now.

All members must follow:
- Design System
- Project Rules
- Screen Map

The project lead will integrate the final modules.

---

# YOU — PROJECT LEAD / CORE PLANNER

Main work:
- overall architecture
- dashboard functionality
- project creation flow
- requirements form
- 2D planner
- room/wall/door/window editing
- backend/API integration
- generation integration
- final integration

You may get help from your senior brother for backend/architecture.

Priority:
**Make the core Planora experience work.**

---

# FRIEND 1 — LANDING PAGE

Give this friend:
- `01_PLANORA_DESIGN_SYSTEM.md`
- `02_PLANORA_PROJECT_RULES.md`
- `03_PLANORA_SCREEN_MAP.md`
- this task file

Build:
- navbar
- hero
- how it works
- features
- architectural/product visual
- CTA
- footer

Do not build:
- dashboard
- authentication
- planner
- backend

AI instruction:
"Build only the Planora landing page. Follow the supplied design system exactly. Do not invent another visual identity."

---

# FRIEND 2 — DASHBOARD UI

Give this friend:
- `01_PLANORA_DESIGN_SYSTEM.md`
- `02_PLANORA_PROJECT_RULES.md`
- `03_PLANORA_SCREEN_MAP.md`
- this task file

Build:
- sidebar
- header
- welcome section
- create-project UI
- project cards
- recent projects
- empty state
- responsive dashboard

Use mock data if necessary.

Do not build:
- backend
- authentication
- 2D planner

Important:
The dashboard should look like Planora, NOT like a generic admin template.

---

# FRIEND 3 — LOGIN / SIGNUP

Give this friend:
- `01_PLANORA_DESIGN_SYSTEM.md`
- `02_PLANORA_PROJECT_RULES.md`
- `03_PLANORA_SCREEN_MAP.md`
- this task file

Build:
- login
- signup
- form validation UI
- navigation between login/signup

If comfortable:
- basic authentication connection

If backend becomes difficult:
- finish the complete UI
- leave a clean integration point for the project lead

Do not build:
- dashboard
- planner
- landing page

---

# HOW EVERYONE SHOULD USE AI

Do NOT tell the AI:

"Build Planora."

Instead give it:
1. the design system
2. the project rules
3. the screen map
4. the person's specific task

Then say:

"Read the provided files first. Inspect the existing project before coding. Build only my assigned module. Follow the Planora design system exactly. Do not redesign unrelated modules."

Build section by section.

---

# STARTING ORDER

1. Project lead chooses the final stack.
2. Project lead creates a basic starter project.
3. Project lead establishes global colors/fonts/shared UI.
4. Share the four documents with each member.
5. Friends begin their assigned UI modules.
6. You begin the core planner.
7. Integrate progressively.
8. Add backend/generation where the core flow is ready.

---

# FINAL GOAL

One continuous product:

Landing
→ Login/Signup
→ Dashboard
→ Create Project
→ Requirements
→ 2D Planner
→ 3D View
→ Save

The goal is not four beautiful independent pages.

The goal is one beautiful, understandable Planora experience.
