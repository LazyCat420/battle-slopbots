# Bot Assembly & Physical Coherence

## Core Principle: A Bot Is a Machine, Not a Stat Sheet

The LLM must think of each bot as a **real machine** with physical constraints. Every design choice has consequences:

- **Heavy armor** → slower movement, more collision mass, harder to push.
- **Big weapon** → needs a bigger chassis to mount, eats weight budget.
- **Fast speed** → requires lighter build, less armor, smaller weapon.

The goal is **physical coherence**: a bot should "look like it works" even in a top-down 2D game.

---

## Weight Budget System

Every bot has a **total weight budget** of **100 weight units (WU)**. Every component consumes WU:

### Weight Costs

| Component | Cost Formula | Example |
|-----------|-------------|---------|
| **Chassis** | `shape_base + (size × 5)` | Circle size 3 = 10 + 15 = 25 WU |
| **Armor** | `armor_level × 4` | Armor 7 = 28 WU |
| **Weapon** | `base_cost + (damage × 2)` | Hammer dmg 8 = 10 + 16 = 26 WU |
| **Drive System** | `speed × 2` | Speed 6 = 12 WU |
| **Fuel/Ammo** | `weapon-specific` | Flamethrower = +5 WU for fuel |

### Shape Base Weights

| Shape | Base WU | Why |
|-------|---------|-----|
| Circle | 10 | Minimal material, efficient |
| Rectangle | 12 | More structural material |
| Triangle | 11 | Wedge shape, moderate |
| Pentagon | 13 | More sides = more material |
| Hexagon | 14 | Heaviest simple shape |

### Weight Budget Validation

```typescript
interface WeightBudget {
  total: 100;                    // Max weight units
  chassis: number;               // Shape base + size scaling
  armor: number;                 // Protection weight
  weapon: number;                // Weapon + ammo/fuel
  drive: number;                 // Motor/wheel weight
  remaining: number;             // Must be >= 0
}

function calculateWeightBudget(def: BotDefinition): WeightBudget {
  const shapeBase = SHAPE_WEIGHTS[def.shape];
  const chassis = shapeBase + (def.size * 5);
  const armor = def.armor * 4;
  const weapon = WEAPON_BASE_COSTS[def.weapon.type] + (def.weapon.damage * 2);
  const drive = def.speed * 2;
  
  const used = chassis + armor + weapon + drive;
  return {
    total: 100,
    chassis,
    armor,
    weapon,
    drive,
    remaining: 100 - used
  };
}
```

### Over-Budget Auto-Correction

If the LLM exceeds the budget, the validator auto-corrects by reducing stats proportionally:

1. **First**: Reduce speed by 1 (lightweight savings, minor gameplay impact).
2. **Then**: Reduce armor by 1.
3. **Then**: Reduce weapon damage by 1.
4. **Repeat** until within budget.
5. **Log** all corrections so the LLM can learn.

---

## Shape-Weapon Compatibility Matrix

Not every weapon works well on every shape. The LLM should consider mounting constraints:

| Shape | Best Weapons | Acceptable | Poor Fit | Why |
|-------|-------------|------------|----------|-----|
| **Circle** | Spinner, Saw | Flamethrower | Hammer, Lance | No flat face to mount long weapons. Ideal for full-body spin. |
| **Rectangle** | Hammer, Lance, Flipper | Flamethrower, Saw | — | Flat faces provide stable weapon mounts. Long axis supports reach weapons. |
| **Triangle** | Lance, Flipper | Hammer | Spinner | Wedge front is natural ram/lance mount. Point concentrates force. |
| **Pentagon** | Hammer, Saw | Spinner, Flamethrower | Lance | Multiple faces for side-mounted weapons. |
| **Hexagon** | Spinner, Flamethrower | Hammer, Saw | Lance | Symmetric shape good for turret-mount or full-body spin. |

### Compatibility Enforcement

Poor fits aren't *banned* — they get a **penalty**:

- **Poor fit**: Weapon damage reduced by 15%, cooldown increased by 20%.
- **Good fit**: No modification.
- **Best fit**: Weapon cooldown reduced by 10% (bonus).

The LLM should be told about these modifiers so it can reason about optimal pairings.

---

## Stat Interdependency Rules

Stats aren't independent. Changing one affects others:

### Speed vs Mass

```
effective_speed = base_speed × (80 / total_mass)
```

A heavy bot (total_mass = 100 WU) with speed 10 moves at: `10 × (80/100) = 8 effective speed`.

A light bot (total_mass = 50 WU) with speed 5 moves at: `5 × (80/50) = 8 effective speed`.

**Takeaway**: Light bots get more speed per point. Heavy bots pay a speed tax.

### Armor vs Speed

Heavy armor literally weighs the bot down:

```
speed_penalty = max(0, (armor - 5) × 0.5)
effective_speed = base_speed - speed_penalty
```

Armor 8 → speed penalty of 1.5. A speed-7 bot becomes effectively speed 5.5.

### Weapon Size vs Chassis Size

Large weapons need large chassis to mount:

```
min_chassis_size = ceil(weapon.damage / 3) + 1
```

A damage-9 weapon needs at least size 4 chassis. Putting it on a size-2 bot fails validation.

---

## How the LLM Should Reason About Assembly

### Step 1: Understand the User's Intent

"Make me a fast bot with a big hammer" → **Fast movement + heavy weapon = tension**. The LLM must negotiate the tradeoff.

### Step 2: Choose Shape Based on Weapon

Hammer → needs a flat mounting face → **rectangle** or **pentagon**.

### Step 3: Allocate Weight Budget

- Chassis (rectangle, size 3): 12 + 15 = 27 WU
- Weapon (hammer, damage 7): 10 + 14 = 24 WU
- Speed 7: 14 WU
- Armor: remaining = 100 - 27 - 24 - 14 = 35 WU → armor = 35/4 = 8 (capped at 8)

### Step 4: Check Interdependencies

- Speed penalty from armor 8: (8-5) × 0.5 = 1.5 → effective speed = 5.5
- Bot is technically speed 7 but moves at 5.5. The user said "fast" — maybe sacrifice some armor.

### Step 5: Iterate — Reduce Armor, Increase Speed

- Armor 5 (penalty 0), Speed 8:
  - Chassis: 27, Weapon: 24, Speed: 16, Armor: 20 → Total: 87 WU ✅
  - Effective speed = 8 × (80/87) = 7.4 Actual fast bot!

### Step 6: Report the Reasoning

```
"I designed 'Mjolnir' as a rectangle (good hammer mount) with:
- Speed 8 (effective 7.4 after mass adjustment)
- Armor 5 (light enough to stay fast)
- Hammer damage 7 (big hit, 1.2s cooldown)
- Strategy: Hit-and-run — charge in, swing, retreat while on cooldown."
```

---

## Assembly Examples

### Example A: Heavy Bruiser

**Design Goal**: Slow, tanky, crushes on contact.

| Stat | Value | WU Cost |
|------|-------|---------|
| Shape | Hexagon | 14 |
| Size | 5 | 25 → chassis = 39 |
| Armor | 9 | 36 |
| Speed | 2 | 4 |
| Weapon | Saw, damage 3 | 10 + 6 = 16 |
| **Total** | | **95 WU** ✅ |

Physics: Mass = 95. This bot barely moves, but anything that hits it bounces. Its saw is weak but it doesn't need to chase — it's a wall.

### Example B: Glass Cannon

**Design Goal**: Fragile but devastating ranged attacker.

| Stat | Value | WU Cost |
|------|-------|---------|
| Shape | Triangle | 11 |
| Size | 2 | 10 → chassis = 21 |
| Armor | 2 | 8 |
| Speed | 8 | 16 |
| Weapon | Lance, damage 9 | 10 + 18 = 28 |
| **Total** | | **73 WU** ✅ |

Physics: Mass = 73. Very fast. One good lance hit is devastating. But one hit back and it's in trouble.

### Example C: Mid-Range Controller

**Design Goal**: Spray weapon that controls space, medium everything.

| Stat | Value | WU Cost |
|------|-------|---------|
| Shape | Rectangle | 12 |
| Size | 3 | 15 → chassis = 27 |
| Armor | 5 | 20 |
| Speed | 5 | 10 |
| Weapon | Flamethrower, damage 6 | 12 + 12 + 5 (fuel) = 29 |
| **Total** | | **86 WU** ✅ |

Physics: Mass = 86. Balanced. Uses flame cone to deny area and force the enemy to approach on bad angles.

---

## Key Takeaways for LLM Prompt

1. **Always calculate weight budget** before finalizing stats.
2. **Pick shape to match weapon** — don't randomly assign both.
3. **Acknowledge tradeoffs** in strategy description.
4. **Check interdependencies** — heavy armor makes you slow.
5. **Large weapons need large chassis** — validate min size.
6. **Report your reasoning** — explain *why* this build works.
