# BattleBots Framework — Master Plan (v3)

## Vision

A **top-down BattleBots arena** where an LLM designs, builds, and controls unique combat robots. Every bot must be **physically plausible** — its shape, weight, weapon, and movement must form a coherent mechanical design, not a random pile of stats. The physics engine enforces real consequences: heavy bots are slow but hit hard, wide bots collide differently than narrow ones, and weapon choice constrains chassis design.

---

## Goals

1. **Physical coherence** — Every bot "makes sense" as a machine. Weight, shape, weapon, and speed are interdependent.
2. **Visual variety** — Bots look distinct through shape, color, weapon style, and custom draw code.
3. **Gameplay variety** — Different weapon archetypes (impact, spin, spray, projectile, reach) create different playstyles.
4. **Strict standardization** — Every generated bot is runnable, safe, and balanced. Validation catches and auto-corrects bad output.
5. **Modular physics** — The physics/collision/movement engines are swappable and customizable.
6. **LLM reasoning** — The LLM understands *why* design choices matter, not just what JSON fields to fill.

## Non-Goals (for now)

- Fully arbitrary 3D physics.
- Letting the LLM write unrestricted engine code.
- Real-time multiplayer networking.

---

## Document Index

| Doc | Title | Contents |
|-----|-------|----------|
| `01-physics-engine-selection.md` | Physics Engine Selection | Comparison of Matter.js, Planck.js, Rapier.js. Recommendation and integration strategy. |
| `02-bot-assembly-logic.md` | Bot Assembly & Coherence | How the LLM should reason about building a physically plausible bot. Weight budgets, shape-weapon compatibility, stat interdependencies. |
| `03-collision-weight-shape.md` | Collision, Weight & Shape Systems | How bot mass, shape, and material affect collisions, knockback, traction, and stability. |
| `04-weapon-archetypes.md` | Universal Weapon Archetypes | All weapon categories (impact, spin, spray, projectile, reach) with templates, constraints, and behavior patterns. |
| `05-movement-and-locomotion.md` | Movement & Locomotion | Drive systems, turning models, speed-weight tradeoffs, and terrain interaction. |
| `06-llm-reasoning-guide.md` | LLM Reasoning & Design Logic | How the LLM should *think* about bot design — decision trees, tradeoff logic, and common pitfalls. |
| `07-edge-cases-long-arms.md` | Edge Case: Long Arms | Multi-segment arms, visual extension, telescoping. |
| `08-edge-cases-fast-spinning.md` | Edge Case: Fast Spinning | Angular velocity clamping, CCD, spin-up mechanics. |
| `09-edge-cases-spray-weapons.md` | Edge Case: Spray Weapons | Continuous damage, cone hitboxes, DoT, particle systems. |
| `10-llm-understanding-animations.md` | LLM Animation Understanding | Weapon archetypes, intent mapping, behavior templates. |
| `11-validation-and-balance.md` | Validation & Balance | All constraint rules, auto-correction, stat budget system. |

---

## Architecture Overview

```
┌──────────────────────────────────────────────────────────────┐
│                      LLM GENERATION LAYER                    │
│  User prompt → Intent classification → Archetype selection   │
│  → Bot Blueprint JSON → Validation → Auto-correction        │
└──────────────────┬───────────────────────────────────────────┘
                   │ BotDefinition (validated JSON)
┌──────────────────▼───────────────────────────────────────────┐
│                      BOT ASSEMBLY LAYER                      │
│  Weight budget allocation → Shape-weapon compatibility       │
│  → Stat interdependency checks → Physics body creation       │
└──────────────────┬───────────────────────────────────────────┘
                   │ Assembled bot (physics bodies + joints)
┌──────────────────▼───────────────────────────────────────────┐
│                      PHYSICS ENGINE LAYER                    │
│  ┌─────────────┐  ┌──────────────┐  ┌───────────────────┐   │
│  │  Collision   │  │   Movement   │  │  Weapon/Damage    │   │
│  │  Engine      │  │   Engine     │  │  Engine           │   │
│  │             │  │              │  │                   │   │
│  │ • Shape vs  │  │ • Drive type │  │ • Archetype rules │   │
│  │   shape     │  │ • Traction   │  │ • Cooldowns       │   │
│  │ • Mass →    │  │ • Turn rate  │  │ • Hitbox shapes   │   │
│  │   knockback │  │ • Accel/     │  │ • Damage scaling  │   │
│  │ • Friction  │  │   decel      │  │ • Effects system  │   │
│  │ • Restitut. │  │              │  │                   │   │
│  └─────────────┘  └──────────────┘  └───────────────────┘   │
└──────────────────────────────────────────────────────────────┘
```

---

## Key Principles

### 1. Everything Has a Cost

Every stat point comes from a finite budget. Want more armor? Lose speed. Want a bigger weapon? The chassis must be heavier to support it — which makes you slower. The LLM must reason about tradeoffs, not just max everything.

### 2. Shape Determines Physics

A circle rolls and deflects. A rectangle has flat faces that catch impacts. A triangle has a wedge that redirects force. Shape isn't cosmetic — it defines collision behavior, stability, and weapon mounting options.

### 3. Weapons Constrain Design

A giant spinning blade needs a heavy chassis to absorb gyroscopic forces. A flamethrower needs a nozzle mount and fuel weight. A lance needs a long chassis for stability. Weapon choice should cascade into the rest of the design.

### 4. Physics Is the Judge

The physics engine resolves all disputes. A light bot that rams a heavy bot bounces off. A fast spinner that hits a wedge gets deflected upward. The engine doesn't care about stats — it cares about mass, velocity, and geometry.

### 5. Enough Constraints to Be Sane, Enough Freedom to Be Creative

Hard constraints prevent broken bots (max weight, max speed, max damage). Soft constraints reward good design (weight budget bonuses for coherent builds). The LLM has creative freedom *within* the physics rules.

---

## Implementation Priority

1. **Phase 1**: Physics engine integration + Bot Assembly v2 (weight/shape/stat interdependencies)
2. **Phase 2**: Collision engine (mass-based knockback, shape-specific interactions)
3. **Phase 3**: Universal weapon archetypes + multi-part physics
4. **Phase 4**: Movement engine (drive types, traction, terrain)
5. **Phase 5**: Effects system + visual feedback
6. **Phase 6**: LLM reasoning guide + validation + balance tuning
