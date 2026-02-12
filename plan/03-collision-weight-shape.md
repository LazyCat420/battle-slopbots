# Collision, Weight & Shape Systems

## Core Concept

In real BattleBots, when a 250-pound wedge hits a 200-pound spinner, **the lighter bot gets pushed**. When a circle hits a flat surface, it **deflects and rolls**. When two heavy bots slam head-on, they **both recoil**.

Our collision system must model these interactions. Shape and weight aren't cosmetic — they determine what happens when bots make contact.

---

## 1. Mass-Based Collision Resolution

### Knockback Formula

When bot A collides with bot B, knockback on each bot depends on their **mass ratio**:

```
knockback_on_A = collision_impulse × (mass_B / (mass_A + mass_B))
knockback_on_B = collision_impulse × (mass_A / (mass_A + mass_B))
```

**Example**:

- Bot A (mass 90) hits Bot B (mass 50).
- Total collision impulse = 100.
- Knockback on A: `100 × (50/140) = 35.7` — light push.
- Knockback on B: `100 × (90/140) = 64.3` — strong push.

The heavy bot barely flinches. The light bot gets launched.

### Implementation

```typescript
function resolveCollisionKnockback(
  bodyA: PhysicsBody,
  bodyB: PhysicsBody,
  collisionNormal: Vec2,
  collisionImpulse: number
): void {
  const totalMass = bodyA.mass + bodyB.mass;
  
  const knockbackA = collisionImpulse * (bodyB.mass / totalMass);
  const knockbackB = collisionImpulse * (bodyA.mass / totalMass);
  
  // Apply impulse along collision normal
  applyImpulse(bodyA, {
    x: -collisionNormal.x * knockbackA,
    y: -collisionNormal.y * knockbackA
  });
  
  applyImpulse(bodyB, {
    x: collisionNormal.x * knockbackB,
    y: collisionNormal.y * knockbackB
  });
}
```

---

## 2. Shape-Specific Collision Behaviors

Different shapes have fundamentally different collision characteristics:

### Circle

- **Deflection**: Hits glance off the curved surface. No flat face to "catch" impacts.
- **Rolling**: After collision, circles tend to roll/spin rather than stop dead.
- **Restitution bonus**: +20% bounciness (energy retained in collisions).
- **Best for**: Spinners (full-body rotation), evasive bots, hit-and-deflect strategies.

```typescript
const CIRCLE_COLLISION_PROPS = {
  restitution: 0.5,  // Bouncy
  friction: 0.3,     // Moderate grip
  frictionAir: 0.02, // Low air drag (rolls freely)
};
```

### Rectangle

- **Flat catch**: Flat faces absorb impacts head-on. More momentum transfer.
- **Edge hits**: Corner impacts are unpredictable — can rotate the bot.
- **Stability**: Wide base = harder to tip (not relevant in 2D, but wider = harder to push sideways).
- **Best for**: Rammers, hammer/flipper mounts, defensive wedges.

```typescript
const RECTANGLE_COLLISION_PROPS = {
  restitution: 0.2,   // Low bounce (absorbs impact)
  friction: 0.6,      // High grip
  frictionAir: 0.05,  // More air drag (flat surfaces)
};
```

### Triangle

- **Wedge deflection**: The angled front face redirects incoming force. Bots hitting the wedge get launched upward (in real BattleBots) or deflected sideways (in our 2D game).
- **Point strikes**: The leading point concentrates force. Ramming with the point is like a battering ram.
- **Vulnerable rear**: The flat back face is exposed. Getting hit from behind is worst-case.

```typescript
const TRIANGLE_COLLISION_PROPS = {
  restitution: 0.35,  // Moderate bounce
  friction: 0.4,      // Moderate grip
  frictionAir: 0.03,  // Aerodynamic front
  
  // Special: incoming collisions on the angled face
  // deflect sideways instead of pushing straight back
  wedgeDeflection: true,
  deflectionAngle: 30, // degrees from surface normal
};
```

### Pentagon / Hexagon

- **Multi-face**: Multiple flat faces mean consistent behavior from any angle.
- **Fortress**: No weak sides. Good for turret-style bots.
- **Higher inertia**: More mass distributed further from center = harder to spin but harder to stop.

```typescript
const POLYGON_COLLISION_PROPS = {
  restitution: 0.25,  // Low-moderate bounce
  friction: 0.5,      // Good grip
  frictionAir: 0.04,  // Moderate air drag
};
```

---

## 3. Collision Damage System

Beyond knockback, collisions can deal **ram damage** based on relative velocity and mass:

### Ram Damage Formula

```
ram_damage = (relative_velocity × mass_ratio × RAM_DAMAGE_SCALE) - DAMAGE_THRESHOLD
```

Where:

- `relative_velocity` = speed of approach at moment of impact
- `mass_ratio` = attacker_mass / defender_mass (capped at 2.0)
- `RAM_DAMAGE_SCALE` = 0.3 (tuning constant)
- `DAMAGE_THRESHOLD` = 2.0 (ignore light taps)

### Implementation

```typescript
const RAM_DAMAGE_SCALE = 0.3;
const DAMAGE_THRESHOLD = 2.0;

function calculateRamDamage(
  attackerMass: number,
  defenderMass: number,
  relativeVelocity: number,
  defenderArmor: number
): number {
  const massRatio = Math.min(attackerMass / defenderMass, 2.0);
  const rawDamage = relativeVelocity * massRatio * RAM_DAMAGE_SCALE;
  
  // Subtract threshold (light bumps do nothing)
  const netDamage = rawDamage - DAMAGE_THRESHOLD;
  if (netDamage <= 0) return 0;
  
  // Armor reduces ram damage
  const armorReduction = defenderArmor * 0.08; // 8% per armor point
  return Math.max(0, netDamage * (1 - armorReduction));
}
```

---

## 4. Friction & Traction

Bot weight affects how well it grips the arena floor:

### Traction Model

```
traction = base_friction × (mass / 80) × surface_modifier
```

- **Heavy bots**: Better traction. Harder to push around. Better at ramming.
- **Light bots**: Slide more on impact. Can be pushed out of position.
- **Surface modifiers**: Arena hazard zones can have different friction (oil slick = 0.3, normal = 1.0, sticky = 1.5).

### Pushing mechanic

When bots are in sustained contact (not just a collision):

```typescript
function calculatePushForce(
  pusherMass: number,
  pusherSpeed: number,
  resistorMass: number,
  resistorTraction: number
): Vec2 {
  const pushStrength = pusherMass * pusherSpeed;
  const resistance = resistorMass * resistorTraction;
  
  const netForce = pushStrength - resistance;
  if (netForce <= 0) return { x: 0, y: 0 }; // Resistor holds ground
  
  // Lighter bot gets pushed
  return scaleVec2(pushDirection, netForce / resistorMass);
}
```

---

## 5. Stability & Spin Resistance

A bot's shape affects how easily it gets spun around by impacts:

### Moment of Inertia by Shape

| Shape | Relative Inertia | Spin Resistance | Note |
|-------|-------------------|-----------------|------|
| Circle | Low (1.0×) | Low | Spins easily — good for spinners, bad for stability |
| Rectangle | High (1.8×) | High | Flat sides resist rotation — stable platform |
| Triangle | Medium (1.3×) | Medium | Moderate, but off-center hits can spin it |
| Pentagon | High (1.6×) | High | Well-distributed mass, good stability |
| Hexagon | Highest (2.0×) | Highest | Most stable shape, hardest to rotate |

### Implementation

```typescript
const SHAPE_INERTIA_MULTIPLIER: Record<BodyShape, number> = {
  circle: 1.0,
  triangle: 1.3,
  pentagon: 1.6,
  rectangle: 1.8,
  hexagon: 2.0,
};

function calculateInertia(shape: BodyShape, mass: number, size: number): number {
  const baseInertia = mass * size * size;
  return baseInertia * SHAPE_INERTIA_MULTIPLIER[shape];
}
```

---

## 6. Weapon-on-Body Collision Interactions

When a **weapon** hits a **body**, the collision type matters:

### Spinner vs. Target

| Target Shape | Interaction |
|-------------|-------------|
| Circle | Glancing blow — spinner deflects, partial damage |
| Rectangle (flat face) | Full impact — maximum damage, spinner may slow down |
| Triangle (wedge) | Deflection — spinner gets redirected, partial damage |
| Pentagon/Hexagon | Depends on angle — flat face = full hit, edge = deflect |

### Hammer vs. Target

| Target Shape | Interaction |
|-------------|-------------|
| Circle | Point impact — full damage but target rolls away |
| Rectangle | Full slam — maximum damage, target barely moves |
| Triangle (point) | Concentrates on point — devastating hit |
| Pentagon/Hexagon | Distributed impact — moderate damage |

---

## 7. Arena Boundary Collisions

Bots colliding with arena walls should feel different from bot-vs-bot:

```typescript
const WALL_PROPERTIES = {
  restitution: 0.6,      // Walls are bouncy
  friction: 0.8,         // High friction against walls
  mass: Infinity,        // Walls don't move
  damageScale: 0.5,      // Wall collisions deal half ram-damage
  cornerDamageBonus: 1.5, // Getting pinned in corner = extra damage
};
```

---

## Summary Table

| Mechanic | What It Does | Affected By |
|----------|-------------|-------------|
| **Knockback** | How far a bot gets pushed on impact | Mass ratio |
| **Ram damage** | Damage from high-speed collisions | Velocity, mass, armor |
| **Deflection** | Whether bots bounce or catch on impact | Shape (circle = deflect, rect = catch) |
| **Traction** | Resistance to being pushed while in contact | Mass, friction, surface |
| **Spin resistance** | How hard it is to rotate the bot from impacts | Shape inertia, mass |
| **Weapon-body interaction** | How weapon hits resolve against different shapes | Weapon type, target shape |

These systems together make every collision **meaningful**. A circle spinner plays completely differently from a rectangular hammer bot, not just because of their weapons, but because of how they *collide*.
