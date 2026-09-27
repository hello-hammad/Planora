# PLANORA TECHNICAL ARCHITECTURE v2

## Purpose

Planora connects:
Requirements → Plan Generation → 2D Editing → 3D Visualization → Save

## High-Level

Frontend
→ Backend/API
→ Database

Frontend:
- UI
- forms
- planner
- 2D editing
- 3D visualization

Backend:
- authentication
- projects
- generation/processing
- validation
- external AI/API integration if required

Database:
- users
- projects
- floor-plan data

## Shared Floor-Plan Concept

The 2D editor, generation logic, and 3D view should work from the same structured plan.

Conceptually:

Project
├── land
│   ├── width
│   └── length
├── requirements
│   ├── bedrooms
│   ├── bathrooms
│   ├── kitchen
│   └── other spaces
└── floorPlan
    ├── rooms[]
    ├── walls[]
    ├── doors[]
    └── windows[]

Do not make the generator return only an image if the goal is to edit the result.

## Conceptual Room

Room:
- id
- type
- x
- y
- width
- length

Other elements should use similarly structured data.

## AI / Generation Flow

User requirements
→ generation logic / AI
→ structured floor-plan data
→ 2D editor
→ user edits
→ 3D representation

The AI service should be treated as replaceable until the core planner is functional.

Do not make an expensive external API the first dependency of the entire application.

## Integration

The project lead owns final integration.

The UI members can build with mock data first.

Example mock project:
- land: 30 × 50 ft
- 3 bedrooms
- 2 bathrooms
- kitchen
- lounge

Later, the real backend replaces the mock data.

## MVP Principle

Prefer:
- simple
- working
- demonstrable

over:
- complex
- highly realistic
- difficult to integrate
