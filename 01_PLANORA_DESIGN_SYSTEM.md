# PLANORA DESIGN SYSTEM v2

## 1. Design Direction

Planora should feel like a **premium modern home-design product**:
- warm
- architectural
- elegant
- calm
- trustworthy
- visually memorable

The visual idea is:
**warm wood + soft architectural paper + dark charcoal + terracotta accent + subtle glass surfaces.**

Do NOT make the whole website glassmorphic.
Glass effects are reserved for selected floating cards, overlays, and visual previews.

Do NOT copy another company's branding. The palette below is Planora's own identity, inspired by warm architectural materials and modern editorial UI.

---

## 2. Brand Colors

### Primary — Walnut
HEX: `#6B4636`
Use for:
- primary brand elements
- important buttons
- selected navigation states
- strong accents

### Primary Dark — Deep Walnut
HEX: `#4A3026`
Use for:
- button hover
- dark architectural sections
- strong headings when appropriate

### Accent — Terracotta
HEX: `#C96F4A`
Use for:
- important highlights
- small decorative accents
- selected interactive states
- AI/generation indicators

Do NOT use terracotta everywhere.

### Background — Warm Ivory
HEX: `#F7F3ED`
Main page background.

### Surface — Soft Cream
HEX: `#FFFDF9`
Use for:
- cards
- forms
- panels
- dashboard surfaces

### Wood Tint
HEX: `#E7D2BC`
Use sparingly for:
- architectural preview areas
- subtle section backgrounds
- room/floor-plan visual accents

### Sage
HEX: `#8B9A83`
Use as a secondary natural accent:
- success states
- secondary visual elements
- selected architectural details

### Charcoal
HEX: `#252321`
Primary text.

### Muted Text
HEX: `#746F69`

### Border
HEX: `#DED7CF`

### White
HEX: `#FFFFFF`

### Error
HEX: `#B94A48`

---

## 3. Color Usage Rule

Use approximately:

- 60% warm ivory / cream backgrounds
- 25% white/cream surfaces
- 10% charcoal/dark text
- 5% walnut + terracotta + sage accents

The website should NOT look brown everywhere.

The warm colors should feel like **wood and architecture**, not like a brown-themed website.

---

## 4. Typography

### Primary Font
**Plus Jakarta Sans**

Use it for:
- headings
- body text
- buttons
- navigation
- dashboard
- planner UI

Fallback:
`"Plus Jakarta Sans", Inter, system-ui, sans-serif`

Why:
- modern
- friendly
- clean
- works well for both marketing pages and application UI
- more distinctive than default Arial/Inter while remaining highly readable

### Optional Display Font
**DM Serif Display**

Use ONLY for a few large marketing headlines if desired.

Example:
"Design the home you imagine."

Do NOT use it throughout the application.

If adding a second font makes the implementation complicated, use Plus Jakarta Sans everywhere.

---

## 5. Typography Scale

Desktop:
- Hero H1: 56–64px / 700
- H2: 36–44px / 700
- H3: 22–28px / 600
- Body: 16px / 400
- Large body: 18px / 400
- Small: 14px / 400
- Button: 14–16px / 600

Mobile:
- Hero H1: 38–44px
- H2: 28–34px
- H3: 20–24px
- Body: 15–16px

Keep line heights comfortable. Avoid cramped text.

---

## 6. Buttons

### Primary Button
- Background: Walnut `#6B4636`
- Text: White
- Radius: 10px
- Font: Plus Jakarta Sans, 600
- Hover: Deep Walnut `#4A3026`

### Accent Button
Use only for important special actions:
- Background: Terracotta `#C96F4A`
- Text: White
- Radius: 10px

### Secondary Button
- Background: transparent or Soft Cream
- Text: Charcoal
- Border: `#DED7CF`
- Radius: 10px

Do not create a different button design on every page.

---

## 7. Cards

Standard card:
- Background: `#FFFDF9`
- Border: `#DED7CF`
- Radius: 14px
- Padding: 20–24px
- Very subtle shadow

### Glass Card
Use selectively:
- translucent white/cream
- backdrop blur
- thin light border
- subtle shadow

Good locations:
- hero overlay
- floating feature card
- planner floating controls
- 3D preview controls

Bad locations:
- every dashboard card
- every section
- entire page background

---

## 8. Backgrounds

### Main website
Warm Ivory `#F7F3ED`

### Dashboard
Warm Ivory with Soft Cream panels.

### Planner
Use a very light neutral/cream canvas background so the floor plan remains readable.

### Hero
A warm ivory background with an architectural visual.

Possible visual:
- clean 2D floor plan
- warm wooden floor texture
- subtle house-plan lines
- 3D room preview

Avoid generic AI robot imagery.

---

## 9. Architectural Visual Style

Planora should visually communicate:
- floor plans
- rooms
- measurements
- walls
- wood
- natural materials
- clean architectural drawings

Use:
- thin lines
- subtle grids
- warm wood tones
- cream paper-like surfaces
- simple 3D house visuals

Avoid:
- neon cyberpunk
- excessive gradients
- glowing blue AI effects
- excessive glassmorphism
- random stock photos

---

## 10. Border Radius

Use:
- Small controls: 8px
- Buttons/inputs: 10px
- Cards: 14px
- Large feature panels: 18–20px

Keep this consistent.

---

## 11. Shadows

Use subtle shadows only.

Example:
`0 8px 30px rgba(50, 40, 30, 0.08)`

Do not make cards look like they are floating several centimeters above the page.

---

## 12. Icons

Use one icon library consistently, such as Lucide.

Prefer:
- simple
- thin/medium outline icons
- architectural/UI-related icons

Do not mix several unrelated icon styles.

---

## 13. Overall Visual Rule

When an AI coding tool asks what Planora should look like, describe it as:

> "A premium modern architectural web application using warm ivory backgrounds, walnut brown, terracotta accents, subtle sage, clean Plus Jakarta Sans typography, natural wood-inspired visual details, spacious layouts, and restrained glassmorphism."

That sentence should remain consistent across all modules.
