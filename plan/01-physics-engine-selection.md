# Physics Engine Selection Guide

## Requirements for BattleBots

Our top-down BattleBots arena needs a 2D physics engine that supports:

1. **Rigid-body dynamics** — Bots are collections of rigid bodies (chassis, weapons, armor plates).
2. **Collision detection** — Accurate shape-vs-shape detection for circles, rectangles, convex polygons.
3. **Constraints/Joints** — Revolute (hinge), prismatic (slider), and fixed joints for multi-part bots.
4. **Collision filtering** — Parts on the same bot must not collide with each other.
5. **Mass-based interactions** — Heavier bots should push lighter bots. Knockback scales with mass ratio.
6. **Continuous Collision Detection (CCD)** — Fast-moving weapons (spinners) must not tunnel through targets.
7. **Stability** — Joints shouldn't explode. Stacking should work. Energy shouldn't accumulate spuriously.
8. **Performance** — Must run 30+ FPS with 2 multi-part bots + projectiles + particles.

---

## Engine Comparison

### Matter.js

| Aspect | Details |
|--------|---------|
| **Type** | Pure JavaScript 2D rigid-body engine |
| **NPM** | `matter-js` (725KB) |
| **Shapes** | Circle, rectangle, convex polygon, compound bodies |
| **Joints** | Constraint-based (stiffness + damping), no native revolute/prismatic |
| **CCD** | ❌ Not built-in (requires plugin or manual swept checks) |
| **Collision Filtering** | ✅ Category/mask system + collision groups |
| **Mass/Density** | ✅ Full support (mass, density, inertia, friction, restitution) |
| **Docs** | ✅ Excellent — interactive demos, detailed API reference |
| **Community** | ✅ Large — 16k+ GitHub stars, active ecosystem |
| **Performance** | ⚠️ ~40% of Box2D speed. Fine for 2 bots, may struggle with 50+ bodies |
| **Integration** | ✅ Already used in our codebase (`game-engine.ts`) |

**Pros**: Already integrated, great docs, easy to prototype.  
**Cons**: No native CCD, joints are soft-constraint only (can be wobbly), lower performance ceiling.

---

### Planck.js

| Aspect | Details |
|--------|---------|
| **Type** | JavaScript rewrite of Box2D |
| **NPM** | `planck-js` (280KB) |
| **Shapes** | Circle, polygon, edge, chain |
| **Joints** | ✅ Full Box2D joint set: revolute, prismatic, distance, weld, rope, gear, motor, wheel |
| **CCD** | ✅ Built-in continuous collision detection |
| **Collision Filtering** | ✅ Category/mask/group system |
| **Mass/Density** | ✅ Full support with automatic inertia calculation |
| **Docs** | ⚠️ Decent — follows Box2D patterns, less interactive than Matter.js |
| **Community** | ⚠️ Smaller (3k stars) but stable, well-maintained |
| **Performance** | ✅ Better than Matter.js, proven Box2D algorithms |
| **Integration** | ⚠️ Requires migration from Matter.js API |

**Pros**: Native CCD, proper joint types, proven algorithms, lighter weight.  
**Cons**: Requires API migration, smaller community, less beginner-friendly.

---

### Rapier.js (WASM)

| Aspect | Details |
|--------|---------|
| **Type** | Rust physics engine compiled to WebAssembly |
| **NPM** | `@dimforge/rapier2d` (WASM bundle ~600KB) |
| **Shapes** | Ball, cuboid, convex polygon, compound shapes |
| **Joints** | ✅ Full set: revolute, prismatic, fixed, spring, rope |
| **CCD** | ✅ Built-in, per-body toggleable |
| **Collision Filtering** | ✅ Group/mask system |
| **Mass/Density** | ✅ Full support with automatic mass properties |
| **Docs** | ✅ Excellent — modern, well-organized |
| **Community** | ⚠️ Growing (4k stars), active development |
| **Performance** | ✅✅ 5-8x faster than JS engines. Handles 15000+ bodies |
| **Integration** | ⚠️ Requires full rewrite + WASM loading setup |
| **Special** | Cross-platform determinism, serialization/snapshotting |

**Pros**: Massively faster, native CCD, proper joints, modern API, deterministic replays.  
**Cons**: WASM loading overhead, async initialization, biggest migration effort, newer ecosystem.

---

## Recommendation

### Short-term: Keep Matter.js (Current)

We already use Matter.js. For the immediate goals (weight system, collision improvements, weapon archetypes), Matter.js is sufficient. We should:

1. Add a CCD plugin or manual swept collision for spinners.
2. Implement soft-joint angle limits manually (we already have this pattern in `07-edge-cases-long-arms.md`).
3. Use collision filtering groups for multi-part bot self-collision prevention.

### Medium-term: Evaluate Planck.js Migration

If Matter.js joints become too unstable for multi-segment weapons or complex bot designs:

1. Planck.js has native revolute/prismatic joints with motor support.
2. Built-in CCD eliminates the spinner tunneling problem entirely.
3. The Box2D algorithms are battle-tested in thousands of games.
4. API is similar enough that migration is incremental (body creation, constraint → joint).

### Long-term: Consider Rapier.js for Scale

If we expand to tournaments (4+ bots simultaneously) or add complex arena hazards:

1. WASM performance handles the Body count.
2. Deterministic replays enable spectator/replay features.
3. Serialization enables save/load of match states.

---

## Physics Engine Abstraction Layer

Regardless of engine choice, we should build an abstraction so swapping engines doesn't break the game:

```typescript
interface PhysicsWorld {
  // World management
  createWorld(gravity: Vec2): void;
  step(dt: number): void;
  
  // Body management
  createBody(config: BodyConfig): BodyHandle;
  removeBody(handle: BodyHandle): void;
  setPosition(handle: BodyHandle, pos: Vec2): void;
  getPosition(handle: BodyHandle): Vec2;
  setAngle(handle: BodyHandle, angle: number): void;
  getAngle(handle: BodyHandle): number;
  setVelocity(handle: BodyHandle, vel: Vec2): void;
  getVelocity(handle: BodyHandle): Vec2;
  applyForce(handle: BodyHandle, force: Vec2): void;
  applyImpulse(handle: BodyHandle, impulse: Vec2): void;
  
  // Joint management
  createRevoluteJoint(config: RevoluteJointConfig): JointHandle;
  createPrismaticJoint(config: PrismaticJointConfig): JointHandle;
  createFixedJoint(config: FixedJointConfig): JointHandle;
  removeJoint(handle: JointHandle): void;
  
  // Collision queries
  onCollision(callback: (a: BodyHandle, b: BodyHandle, info: CollisionInfo) => void): void;
  raycast(origin: Vec2, direction: Vec2, maxDist: number): RaycastHit | null;
  queryArea(aabb: AABB): BodyHandle[];
}

interface CollisionInfo {
  normal: Vec2;         // Collision normal
  depth: number;        // Penetration depth
  impulse: number;      // Collision impulse magnitude
  contactPoint: Vec2;   // Point of contact
}
```

This abstraction maps cleanly to all three engines and allows the game logic to remain engine-agnostic.

---

## Decision Matrix

| Feature | Matter.js | Planck.js | Rapier.js |
|---------|-----------|-----------|-----------|
| Already integrated | ✅ | ❌ | ❌ |
| CCD (spinner safety) | ❌ (plugin) | ✅ | ✅ |
| Joint quality | ⚠️ Soft | ✅ Rigid | ✅ Rigid |
| Performance (2 bots) | ✅ Fine | ✅ Fine | ✅ Overkill |
| Performance (8+ bots) | ⚠️ Risky | ✅ Good | ✅✅ Great |
| Learning curve | ✅ Low | ⚠️ Med | ⚠️ Med |
| Migration effort | ✅ None | ⚠️ Moderate | ❌ Full rewrite |
| Deterministic replay | ❌ | ❌ | ✅ |

**Verdict**: Start with Matter.js. Build the abstraction layer. Migrate to Planck.js when joint stability becomes a problem. Consider Rapier.js for tournament scale.
