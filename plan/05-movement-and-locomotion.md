# Movement & Locomotion

## Core Principle

How a bot moves is as important as how it fights. A fast circle that zips around is fundamentally different from a heavy rectangle that bulldozes forward. Movement isn't just a "speed" number — it's a system of drive type, acceleration, turning, traction, and weight.

---

## Drive Types

The LLM can select a drive system. Each creates different movement feel:

### Standard Wheels (Default)

- **Turn style**: Tank-turn (rotate in place) + forward/back.
- **Acceleration**: Moderate ramp-up.
- **Traction**: Good. Proportional to mass.
- **Best for**: General purpose, hammer bots, ranged bots.

### Omni-Wheels

- **Turn style**: Can strafe sideways without rotating.
- **Acceleration**: Quick (light wheels).
- **Traction**: Lower (rollers slip more).
- **Weight cost**: +5 WU (extra motors).
- **Best for**: Evasive bots, projectile bots that need to dodge while aiming.

### Treads

- **Turn style**: Slow rotation, smooth forward.
- **Acceleration**: Slow ramp-up but high top push force.
- **Traction**: Excellent (large contact area).
- **Weight cost**: +8 WU (heavy treads).
- **Best for**: Rams, pushers, heavy bruisers.

### Shuffler / Walking

- **Turn style**: Step-based rotation.
- **Acceleration**: Very slow.
- **Traction**: Variable (lifts feet between steps).
- **Weight bonus**: -10 WU (walker bonus, like real BattleBots).
- **Best for**: Heavy weapon bots that need the weight savings.

---

## Movement Parameters

```typescript
interface DriveConfig {
  type: 'wheels' | 'omni' | 'treads' | 'walker';
  
  // Derived from bot stats + drive type
  maxSpeed: number;         // px/frame at full throttle
  acceleration: number;     // px/frame² ramp-up
  deceleration: number;     // px/frame² slow-down (braking)
  turnRate: number;         // rad/frame rotation speed
  traction: number;         // grip multiplier (0-2)
  strafeSpeed?: number;     // px/frame sideways (omni only)
}
```

### Speed Calculation

```
maxSpeed = (base_speed × SPEED_SCALE) × (drive_modifier) × (mass_penalty)

where:
  SPEED_SCALE = 0.5       (normalize speed stat to px/frame)
  drive_modifier:
    wheels = 1.0
    omni   = 1.1           (slightly faster)
    treads = 0.7           (slow tracked vehicle)
    walker = 0.5           (very slow)
  mass_penalty = 80 / total_mass  (lighter = faster)
```

### Turn Rate Calculation

```
turnRate = (BASE_TURN × drive_turn_modifier) / inertia_factor

where:
  BASE_TURN = 0.08 rad/frame
  drive_turn_modifier:
    wheels = 1.0
    omni   = 1.3             (nimble turning)
    treads = 0.6             (sluggish turning)
    walker = 0.4             (step-based)
  inertia_factor = shape_inertia / base_inertia  (from 03-collision doc)
```

---

## Acceleration Model

Bots don't move at full speed instantly. They accelerate and decelerate:

```typescript
function updateBotMovement(bot: BotState, targetVelocity: Vec2, dt: number): void {
  const drive = bot.driveConfig;
  const diff = subtractVec2(targetVelocity, bot.velocity);
  const diffMag = magnitude(diff);
  
  if (diffMag < 0.1) {
    // Close enough — snap to target
    bot.velocity = targetVelocity;
    return;
  }
  
  // Choose accel or decel rate
  const isAccelerating = magnitude(targetVelocity) > magnitude(bot.velocity);
  const rate = isAccelerating ? drive.acceleration : drive.deceleration;
  
  // Apply rate toward target velocity
  const step = Math.min(rate * dt, diffMag);
  const direction = normalizeVec2(diff);
  
  bot.velocity = {
    x: bot.velocity.x + direction.x * step,
    y: bot.velocity.y + direction.y * step,
  };
}
```

---

## Collision Impact on Movement

When a bot gets hit, it affects movement:

### Stagger

Heavy hits cause a brief movement penalty:

```typescript
interface StaggerState {
  duration: number;      // frames remaining
  speedMultiplier: number; // 0.0-1.0 (0 = frozen)
  turnMultiplier: number;  // 0.0-1.0
}

function applyStagger(bot: BotState, impactForce: number): void {
  const staggerThreshold = bot.totalMass * 0.5;
  
  if (impactForce > staggerThreshold) {
    const severity = Math.min(impactForce / (staggerThreshold * 2), 1);
    bot.stagger = {
      duration: Math.floor(10 + severity * 20), // 10-30 frames
      speedMultiplier: 1 - severity * 0.7,       // 30-100% speed loss
      turnMultiplier: 1 - severity * 0.5,         // 0-50% turn loss
    };
  }
}
```

### Knockback Recovery

After being knocked back, bots need to recover momentum:

- **Heavy bots**: Recover quickly (high traction, resist sliding).
- **Light bots**: Slide further before regaining control.
- **Treads**: Best recovery (high traction).
- **Omni wheels**: Worst recovery (low traction, slide on rollers).

---

## Arena Boundary Behavior

How bots interact with arena walls:

```typescript
function handleWallCollision(bot: BotState, wallNormal: Vec2): void {
  const drive = bot.driveConfig;
  
  // Bounce based on restitution
  const bounce = 0.3 * drive.traction; // Higher traction = less bounce
  reflectVelocity(bot.velocity, wallNormal, bounce);
  
  // Wall slide: bots can move along walls
  const slideSpeed = dot(bot.velocity, perpendicular(wallNormal));
  bot.velocity = scaleVec2(perpendicular(wallNormal), slideSpeed * 0.8);
}
```

---

## LLM Reasoning About Movement

The LLM should consider movement when designing a bot:

### "Make me a fast dodging bot"

→ **Omni wheels** (strafe), **low mass** (speed bonus), **circle shape** (low inertia for quick turns).

### "Make me an unstoppable tank"

→ **Treads** (high traction, push force), **heavy mass** (hard to push), **hexagon** (high stability).

### "Make me a hit-and-run bot"

→ **Standard wheels** (balanced), **light build** (fast accel), **triangle** (wedge front for approach angle).

### "Make me a heavy weapon bot"

→ **Walker** (weight bonus frees WU for bigger weapon), **slow but devastating** hits, **rectangle** (stable platform for big swings).

---

## Summary

| Drive Type | Max Speed | Turn Rate | Traction | Weight Cost | Best Strategy |
|-----------|-----------|-----------|----------|-------------|---------------|
| Wheels | 1.0× | 1.0× | Good | 0 | Balanced |
| Omni | 1.1× | 1.3× | Low | +5 WU | Evasion/Kiting |
| Treads | 0.7× | 0.6× | Excellent | +8 WU | Ramming/Pushing |
| Walker | 0.5× | 0.4× | Variable | -10 WU bonus | Heavy weapon |
