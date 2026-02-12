# BattleBots Upgrade Plan (v2)

## Goals
- Increase visual variety so bots stop looking the same.
- Increase gameplay variety so bots stop behaving the same.
- Keep strict standardization so every generated bot is runnable, safe, and balanced.
- **Handle edge cases**: long arms, fast spinning, spray weapons, complex attachments.

## Non-goals (for now)
- Fully arbitrary physics bodies with unlimited vertices.
- Letting the LLM write unrestricted engine code.

## Current constraints (observed)
- Bot generation is based on a strict BotDefinition JSON and a sandboxed behavior API.
- Shapes are limited to a small preset list, which compresses variety.
- Attack effects are basic (particles only).
- No support for continuous damage, spray patterns, or complex multi-part weapons.

## Strategy
1. Evolve BotDefinition into a compositional "Bot Blueprint v2" (components + joints + weapon modules).
2. Decouple render geometry (unlimited-ish) from physics colliders (constrained + validated).
3. Replace most freeform behavior code with data-driven AI (Behavior Tree / Utility AI config).
4. Add a first-class EffectsSystem (particles, trails, decals, hit-stop, recoil, **continuous damage zones**).
5. **Add constraint validation and auto-correction** for extreme edge cases.

## Key Edge Cases to Solve

### 1. Very Long Arms/Weapons
**Problem**: Long arms can:
- Break physics (high moment of inertia, unstable joints).
- Look ridiculous if not clamped.
- Create unfair reach advantages.

**Solution**:
- Max arm length constraint (e.g., 120px from pivot).
- Multi-segment arms (chain multiple rigid bodies with constraints).
- Physics stabilization: damping, angular limits, and spring constraints.
- Visual vs physics split: arm can *render* longer with a decorative trail, but collider is clamped.

### 2. Fast Spinning Weapons
**Problem**: High angular velocity can:
- Break the physics engine (tunneling, jitter).
- Make hitbox detection unreliable.
- Create unfair instant-kill scenarios.

**Solution**:
- Cap angular velocity (e.g., max 20 rad/s).
- Use continuous collision detection (CCD) for fast-moving parts.
- Damage scales with *accumulated* spin-up time, not just raw speed.
- Visual effects (motion blur, trail, glow intensity) scale with spin speed.
- Introduce "spin-up" and "spin-down" phases (acceleration curves).

### 3. Spray/Cone Weapons (Flamethrower, Acid, Water)
**Problem**: Spray damage is continuous and area-based, not discrete hit-based.
- How to represent damage over time?
- How to show visual feedback for "being sprayed"?
- How to make LLM understand it needs different animation logic?

**Solution**:
- Add `WeaponMode` enum: `"instant" | "continuous" | "projectile"`.
- Continuous weapons:
  - Create a cone/ray hitbox each frame while active.
  - Apply damage per tick (e.g., 0.5 dmg/tick = 15 dmg/sec at 30 FPS).
  - Render animated particles flowing from nozzle to impact point.
  - Add heat/burn/DoT visual overlay on victim (screen tint, burn marks).
- LLM prompt includes weapon mode and requires `sprayPattern` config for continuous weapons.

### 4. Multi-Part/Articulated Weapons
**Problem**: Chainsaw arms, segmented whips, rotating turrets.
- Requires joint constraints (revolute, prismatic).
- Must prevent self-collision.
- Needs synchronized animation.

**Solution**:
- Part attachment system with joint types: `fixed | revolute | prismatic`.
- Joint limits: angle constraints, motorization, damping.
- Collision filtering: parts of the same bot ignore each other.
- Animation system tracks joint angles and applies them to render and physics sync'd.

---

## Implementation Priority
1. **Phase 1**: Schema v2 + edge case constraints.
2. **Phase 2**: Multi-part physics + joints.
3. **Phase 3**: Continuous damage + spray weapons.
4. **Phase 4**: Effects system + visual feedback.
5. **Phase 5**: AI variety + balance tuning.
