# Plan Directory

This folder contains the complete design specification for the BattleBots physics framework. These documents guide both the codebase implementation and the LLM's reasoning when generating bots.

## Document Index

| # | File | Purpose |
|---|------|---------|
| 00 | `00-overview.md` | Master plan, architecture, goals, phasing |
| 01 | `01-physics-engine-selection.md` | Matter.js vs Planck.js vs Rapier.js comparison |
| 02 | `02-bot-assembly-logic.md` | Weight budgets, shape-weapon compatibility, stat interdependencies |
| 03 | `03-collision-weight-shape.md` | Mass-based knockback, shape collision properties, ram damage, traction |
| 04 | `04-weapon-archetypes.md` | 6 universal weapon types: impact, spinner, spray, projectile, reach, passive |
| 05 | `05-movement-and-locomotion.md` | Drive types (wheels, omni, treads, walker), acceleration, stagger |
| 06 | `06-llm-reasoning-guide.md` | How the LLM should think about bot design — anti-patterns, decision trees |
| 07 | `07-edge-cases-long-arms.md` | Multi-segment arms, telescoping, visual extension |
| 08 | `08-edge-cases-fast-spinning.md` | Angular velocity clamping, CCD, spin-up mechanics |
| 09 | `09-edge-cases-spray-weapons.md` | Continuous damage, cone hitboxes, DoT system |
| 10 | `10-llm-understanding-animations.md` | Weapon archetype templates for LLM prompt, few-shot examples |
| 11 | `11-validation-and-balance.md` | Full validation pipeline, auto-correction, balance scoring |

## Reading Order

**For understanding the framework**: 00 → 02 → 03 → 04 → 06  
**For physics implementation**: 01 → 03 → 05 → 07/08/09  
**For LLM prompt design**: 06 → 10 → 04 → 11  
