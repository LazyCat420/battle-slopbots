# Universal Weapon Archetypes

## Overview

Every weapon in the game fits one of six archetypes. Each archetype defines: damage delivery, physics requirements, animation style, behavior API calls, and LLM generation constraints. The LLM must identify which archetype matches the user's intent before generating the bot JSON.

---

## Archetype Classification

The LLM classifies weapons by user intent keywords:

| Archetype | Keywords | Damage Model | Physics Needs |
|-----------|----------|-------------|---------------|
| **Impact** | hammer, bat, flipper, slam, smash, crush, axe | Single hit on cooldown | Swing arc, recoil |
| **Spinner** | spin, blade, saw, drill, rotate, grinder | Continuous on contact while spinning | Angular velocity, CCD |
| **Spray** | flame, fire, acid, water, gas, ice, frost | Damage per tick in cone/beam | Cone hitbox, DoT |
| **Projectile** | gun, shoot, cannon, missile, bullet, turret | Per-projectile on hit | Spawned entities, lifetime |
| **Reach** | lance, spear, whip, arm, extend, poke | Single hit at long range | Multi-segment joints |
| **Passive** | spike, ram, wedge, shield, wall | Damage on collision | Body shape, mass, restitution |

---

## Archetype 1: Impact Weapons

**Examples**: Hammer, axe, bat, flipper, crusher

### Mechanics

- Single high-damage hit per activation.
- Swing animation over 200-500ms with an arc (90°-180°).
- Cooldown after each swing (800-2000ms).
- Recoil: attacker pushed back slightly on hit.
- Knockback: target pushed based on mass ratio.

### Schema

```json
{
  "weapon": {
    "type": "hammer",
    "mode": "instant",
    "damage": 8,
    "cooldown": 1200,
    "range": 50,
    "animation": {
      "type": "swing",
      "duration": 300,
      "arc": 120
    }
  }
}
```

### Physics Constraints

- Weapon mass adds to total bot mass.
- Swing creates angular momentum — light bots rotate during swing.
- Heavy weapons on light bots = self-knockback on miss.

### Behavior API

```javascript
api.attack();           // Trigger swing
api.isAttacking();      // Check if mid-swing
api.getCooldownLeft();  // Time until next attack
```

---

## Archetype 2: Spinner Weapons

**Examples**: Horizontal spinner, vertical spinner, saw blade, drill, full-body spinner

### Mechanics

- Weapon must **spin up** before dealing full damage (0.5-2s ramp).
- Damage scales with current spin speed.
- Contact damage: applies each frame while touching AND spinning.
- Gyroscopic effect: spinning weapons resist being turned.
- Spin-down on impact: big hits slow the spinner.

### Schema

```json
{
  "weapon": {
    "type": "spinner",
    "mode": "instant",
    "damage": 7,
    "cooldown": 400,
    "range": 35,
    "spinner": {
      "targetSpeed": 9,
      "spinUpRate": 0.7,
      "bladeRadius": 30,
      "bladeCount": 4,
      "spinDown": 0.2
    }
  }
}
```

### Physics Constraints

- Max angular velocity: 20 rad/s.
- CCD required (fast-moving edges tunnel through bodies at high speed).
- Spin momentum: hitting a target transfers angular energy → spinner slows, target gets knocked.
- Full-body spinners: the chassis IS the weapon. Drive system must decouple from spin.

### Behavior API

```javascript
api.startSpinning();    // Begin spin-up
api.stopSpinning();     // Begin spin-down
api.getSpinSpeed();     // Current speed (0-1)
api.isAtMaxSpin();      // True when fully spun up
```

---

## Archetype 3: Spray Weapons

**Examples**: Flamethrower, acid sprayer, water cannon, ice beam, gas cloud

### Mechanics

- Continuous damage per tick while spraying.
- Cone or beam-shaped hitbox projects from nozzle.
- Limited spray duration per activation before cooldown/refuel.
- Optional DoT (damage over time) after spray ends (burn, corrosion, freeze).
- Particle system: flowing particles from nozzle to impact area.

### Schema

```json
{
  "weapon": {
    "type": "flamethrower",
    "mode": "continuous",
    "damage": 12,
    "cooldown": 4000,
    "range": 80,
    "continuous": {
      "shape": "cone",
      "width": 45,
      "duration": 2000,
      "particleRate": 10,
      "dotDuration": 3000,
      "dotTickDamage": 0.2
    }
  }
}
```

### Physics Constraints

- Spray doesn't push target (no physical impulse, just damage).
- Fuel weight adds to bot mass.
- Cone angle limited to 90° max.
- Spray duration limited to 3000ms per burst.
- DoT duration limited to 5000ms.

### Behavior API

```javascript
api.startSpraying();     // Begin spray
api.stopSpraying();      // End spray
api.isSpraying();        // Check active
api.getSprayTimeLeft();  // Remaining duration (0-1)
```

---

## Archetype 4: Projectile Weapons

**Examples**: Gun, cannon, missile launcher, nail gun, railgun

### Mechanics

- Fires a discrete projectile entity per shot.
- Projectile travels at set speed with a lifetime (despawns after max range).
- Hit detection: projectile collides with target body.
- Options: piercing (passes through), explosive (AoE on hit), bouncing (ricochets off walls).
- Muzzle flash + tracer particles follow the projectile.

### Schema

```json
{
  "weapon": {
    "type": "gun",
    "mode": "projectile",
    "damage": 5,
    "cooldown": 600,
    "range": 200,
    "projectile": {
      "speed": 8,
      "size": 4,
      "lifetime": 60,
      "piercing": false,
      "explosive": false,
      "explosionRadius": 0,
      "bounces": 0
    }
  }
}
```

### Physics Constraints

- Projectiles have their own physics bodies (small circle colliders).
- Max 3 active projectiles per bot (prevent bullet spam).
- Projectile speed capped at 12 px/frame (prevent tunneling).
- Explosive radius capped at 60px.
- Ammo weight adds to bot mass.

### Behavior API

```javascript
api.attack();              // Fire projectile
api.getActiveProjectiles(); // Count of live projectiles
```

---

## Archetype 5: Reach Weapons

**Examples**: Lance, spear, whip, telescoping arm, piston

### Mechanics

- Long-range single hit.
- Multi-segment arms for lengths > 100px (see `07-edge-cases-long-arms.md`).
- Tip collider is the damage zone.
- Swing creates an arc — hit region is the tip's travel path.
- Retraction after strike (attack-and-pull-back).

### Schema

```json
{
  "weapon": {
    "type": "lance",
    "mode": "instant",
    "damage": 7,
    "cooldown": 1400,
    "range": 150,
    "segments": [
      { "length": 50, "width": 8, "angleLimit": { "min": -45, "max": 90 } },
      { "length": 50, "width": 6, "angleLimit": { "min": -30, "max": 30 } },
      { "length": 50, "width": 4, "angleLimit": { "min": -20, "max": 20 } }
    ],
    "tipCollider": { "type": "circle", "radius": 12 }
  }
}
```

### Physics Constraints

- Max single segment: 60px.
- Max total reach: 180px.
- Max 4 segments.
- Each segment connected by revolute joint with angle limits.
- Mass decreases toward tip (stability).

### Behavior API

```javascript
api.attack();              // Trigger thrust/swing
api.extendArm(speed);      // For telescoping types
api.getArmExtension();     // Current extension (0-1)
```

---

## Archetype 6: Passive/Ram Weapons

**Examples**: Spike armor, ram wedge, shield, body slam, reactive armor

### Mechanics

- No active attack action required.
- Damage dealt on **collision** based on speed and mass.
- Spikes: add collision damage multiplier.
- Wedges: deflect incoming bots upward/sideways.
- Shields: reduce damage taken from one direction.

### Schema

```json
{
  "weapon": {
    "type": "ram",
    "mode": "passive",
    "damage": 0,
    "cooldown": 0,
    "range": 0,
    "passive": {
      "collisionDamageMultiplier": 2.0,
      "deflectionAngle": 30,
      "spikeCount": 6,
      "armorBonus": 2
    }
  }
}
```

### Physics Constraints

- No free lunch: spike armor adds weight.
- Collision damage still follows the ram damage formula (see `03-collision-weight-shape.md`).
- Deflection angle affects restitution on the equipped face.
- Shield direction: only protects one arc (e.g., front 90°).

### Behavior API

```javascript
api.moveToward(target);  // Just ram into them
api.attack();            // Optional: triggers a "boost ram" with brief speed burst
```

---

## Universal Constraints (All Archetypes)

| Constraint | Value | Reason |
|-----------|-------|--------|
| Max weapon damage | 10 | Balance cap |
| Min cooldown | 200ms | Prevent spam |
| Max cooldown | 2000ms | Keep action flowing |
| Max weapon range | 250px | Arena is ~600px wide |
| Max projectile speed | 12 px/frame | Prevent tunneling |
| Max spin speed | 20 rad/s | Physics stability |
| Max spray duration | 3000ms | Balance |
| Max spray cone | 90° | Balance |
| Max arm segments | 4 | Physics stability |
| Max arm reach | 180px | Balance |
| Max active projectiles | 3 | Performance + balance |

---

## LLM Decision Flow

```
User says: "Make me a bot with a [weapon description]"
                    │
     ┌──────────────▼──────────────────┐
     │  1. Classify weapon archetype   │
     │     (keyword matching)          │
     └──────────────┬──────────────────┘
                    │
     ┌──────────────▼──────────────────┐
     │  2. Select compatible chassis   │
     │     shape from compatibility    │
     │     matrix (02-bot-assembly)    │
     └──────────────┬──────────────────┘
                    │
     ┌──────────────▼──────────────────┐
     │  3. Allocate weight budget      │
     │     (weapon + chassis + armor   │
     │      + drive ≤ 100 WU)          │
     └──────────────┬──────────────────┘
                    │
     ┌──────────────▼──────────────────┐
     │  4. Generate archetype-specific │
     │     weapon config + behavior    │
     └──────────────┬──────────────────┘
                    │
     ┌──────────────▼──────────────────┐
     │  5. Validate all constraints    │
     │     → auto-correct if needed    │
     └────────────────────────────────-┘
```
