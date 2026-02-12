# Edge Case: Fast Spinning Weapons

## Problem Statement
When a user asks for "a bot that spins really fast" or "super fast blade," several issues arise:
- **Physics tunneling**: Fast-moving colliders can pass through enemies between frames.
- **Engine instability**: High angular velocity causes jitter and energy buildup.
- **Unfair advantage**: Instant max-damage on contact.
- **Visual clarity**: Users can't see what's happening.

## Constraints
- Max angular velocity: **20 rad/s** (~190 RPM, ~3.2 rev/sec).
- Spin-up time: minimum **0.5 seconds** to reach max speed.
- Damage scales with spin duration, not just speed.

---

## Solution 1: Angular Velocity Clamping + CCD

### Physics Implementation
```typescript
const MAX_ANGULAR_VELOCITY = 20; // rad/s
const SPIN_UP_ACCELERATION = 5;  // rad/s² per tick
const SPIN_DOWN_FRICTION = 0.95; // Decay multiplier

interface SpinnerWeapon {
  type: 'spinner' | 'saw' | 'drill';
  targetSpeed: number;      // Desired speed (1-10, mapped to 5-20 rad/s)
  currentSpeed: number;     // Actual current angular velocity
  spinUpRate: number;       // Acceleration (0.1-1.0)
  bladeRadius: number;      // Size of spinning part
  bladeCount: number;       // Number of blades (1-6)
  damageMult: number;       // Damage = baseDamage * (currentSpeed / maxSpeed) * damageMult
}
```

### Tick Loop: Clamp Angular Velocity
```typescript
function tickSpinner(bot: BotState, body: Matter.Body, dt: number) {
  const weapon = bot.definition.weapon as SpinnerWeapon;
  
  // Map target speed (1-10) to angular velocity (5-20 rad/s)
  const targetAngVel = 5 + (weapon.targetSpeed / 10) * 15;
  
  // Spin up gradually
  if (weapon.currentSpeed < targetAngVel) {
    weapon.currentSpeed += weapon.spinUpRate * dt;
    weapon.currentSpeed = Math.min(weapon.currentSpeed, targetAngVel);
  }
  
  // Apply friction when not actively spinning
  if (!bot.isSpinning) {
    weapon.currentSpeed *= SPIN_DOWN_FRICTION;
  }
  
  // Clamp to max safe velocity
  weapon.currentSpeed = Math.min(weapon.currentSpeed, MAX_ANGULAR_VELOCITY);
  
  // Set body angular velocity
  Matter.Body.setAngularVelocity(body, weapon.currentSpeed);
}
```

### Continuous Collision Detection (CCD)
Enable CCD for fast-moving spinner parts to prevent tunneling:

```typescript
function createSpinnerBody(config: SpinnerWeapon): Matter.Body {
  const body = Matter.Bodies.circle(0, 0, config.bladeRadius, {
    mass: 2,
    friction: 0.05,
    restitution: 0.4,
    // Enable CCD for fast-moving bodies
    isSleeping: false,
    plugin: {
      ccd: {
        enabled: true,
        offset: { x: 0, y: 0 },
        velocityThreshold: 5 // rad/s
      }
    }
  });
  
  return body;
}
```

**Note**: Matter.js doesn't have native CCD. You need to:
1. Use `matter-plugin-ccd` or similar.
2. Implement swept collision checks manually.
3. Reduce physics timestep (increase tick rate locally for spinner).

---

## Solution 2: Damage Scaling with Spin-Up

Instead of instant max damage, scale damage based on how long the weapon has been spinning:

```typescript
interface SpinState {
  spinDuration: number;    // Frames spent spinning
  minSpinFrames: number;   // Frames to reach full damage (e.g., 15 = 0.5s at 30fps)
  damageScale: number;     // Current damage multiplier (0-1)
}

function calculateSpinDamage(weapon: SpinnerWeapon, spinState: SpinState): number {
  const baseDamage = weapon.damage;
  
  // Scale with spin duration (0-1 over minSpinFrames)
  const spinProgress = Math.min(spinState.spinDuration / spinState.minSpinFrames, 1);
  
  // Scale with current speed (0-1 relative to target)
  const speedProgress = weapon.currentSpeed / (5 + (weapon.targetSpeed / 10) * 15);
  
  // Combined scaling
  spinState.damageScale = spinProgress * speedProgress;
  
  return baseDamage * spinState.damageScale * weapon.damageMult;
}
```

### Visual Feedback for Spin-Up
```typescript
function renderSpinnerWithFeedback(ctx: CanvasRenderingContext2D, bot: BotState, tick: number) {
  const weapon = bot.definition.weapon as SpinnerWeapon;
  const spinProgress = weapon.currentSpeed / MAX_ANGULAR_VELOCITY;
  
  // Glow intensity increases with speed
  ctx.shadowBlur = 10 + spinProgress * 20;
  ctx.shadowColor = bot.definition.attackEffect.color;
  
  // Motion blur trail
  const trailLength = spinProgress * 8; // 0-8 trail copies
  for (let i = 0; i < trailLength; i++) {
    const alpha = 0.3 * (1 - i / trailLength);
    const angle = (tick * weapon.currentSpeed / 10) - (i * 0.3);
    
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.rotate(angle);
    drawBlades(ctx, weapon);
    ctx.restore();
  }
  
  // Main blade (full opacity)
  ctx.globalAlpha = 1;
  drawBlades(ctx, weapon);
}

function drawBlades(ctx: CanvasRenderingContext2D, weapon: SpinnerWeapon) {
  for (let i = 0; i < weapon.bladeCount; i++) {
    const angle = (i * 2 * Math.PI) / weapon.bladeCount;
    ctx.save();
    ctx.rotate(angle);
    
    // Blade shape (simple rect)
    ctx.fillStyle = weapon.color;
    ctx.fillRect(0, -2, weapon.bladeRadius, 4);
    ctx.restore();
  }
}
```

---

## Solution 3: Motorized Spin Control

Give LLM control over when to spin up/down:

```typescript
interface BehaviorAPI {
  startSpinning(): void;    // Begin spin-up
  stopSpinning(): void;     // Begin spin-down
  getSpinSpeed(): number;   // Current angular velocity (0-1 normalized)
  isAtMaxSpin(): boolean;   // True when fully spun up
}

function executeBehavior(bot: BotState, api: BehaviorAPI, tick: number) {
  // Example: Only spin when close to enemy
  if (api.getDistanceToEnemy() < 100) {
    api.startSpinning();
    
    // Only attack once at max spin
    if (api.isAtMaxSpin()) {
      api.attack();
    }
  } else {
    api.stopSpinning();
  }
}
```

---

## Solution 4: Multi-Part Spinner (Shell + Core)

For "entire bot spins" vs "weapon spins":

### Core-Shell Design
```typescript
interface SpinningBot {
  core: Matter.Body;        // Main body (does NOT spin)
  shell: Matter.Body;       // Spinning outer shell
  motor: Matter.Constraint; // Rotates shell relative to core
}

function createSpinningBot(def: BotDefinition): SpinningBot {
  const core = Matter.Bodies.circle(0, 0, 15, { mass: 5, isStatic: false });
  const shell = Matter.Bodies.circle(0, 0, 25, { mass: 2, isSensor: false });
  
  // Motor constraint: rotates shell around core
  const motor = Matter.Constraint.create({
    bodyA: core,
    bodyB: shell,
    pointA: { x: 0, y: 0 },
    pointB: { x: 0, y: 0 },
    stiffness: 1,
    length: 0
  });
  
  // Apply angular velocity to shell only
  Matter.Body.setAngularVelocity(shell, def.weapon.targetSpeed);
  
  return { core, shell, motor };
}
```

**Benefits**:
- Core moves normally (user-controlled).
- Shell spins independently (weapon).
- Prevents whole-bot jitter.

---

## Solution 5: Visual Effects for Speed

### Motion Blur
```typescript
function renderMotionBlur(ctx: CanvasRenderingContext2D, weapon: SpinnerWeapon, tick: number) {
  const speed = weapon.currentSpeed / MAX_ANGULAR_VELOCITY;
  const blurCopies = Math.floor(speed * 6); // 0-6 copies
  
  for (let i = 0; i < blurCopies; i++) {
    const alpha = 0.4 * (1 - i / blurCopies);
    const offsetAngle = -(i * speed * 0.5);
    
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.rotate(offsetAngle);
    drawBlades(ctx, weapon);
    ctx.restore();
  }
}
```

### Glow Pulse
```typescript
function renderSpinGlow(ctx: CanvasRenderingContext2D, weapon: SpinnerWeapon, tick: number) {
  const speed = weapon.currentSpeed / MAX_ANGULAR_VELOCITY;
  const pulse = Math.sin(tick * 0.2) * 0.3 + 0.7; // 0.7-1.0 pulse
  
  ctx.shadowColor = weapon.attackEffect.color;
  ctx.shadowBlur = speed * 30 * pulse;
  ctx.strokeStyle = weapon.attackEffect.color;
  ctx.lineWidth = 2 + speed * 3;
  ctx.globalAlpha = speed * 0.8;
  
  ctx.beginPath();
  ctx.arc(0, 0, weapon.bladeRadius + 5, 0, Math.PI * 2);
  ctx.stroke();
}
```

### Impact Sparks (on hit)
```typescript
function onSpinnerHit(position: Vec2, weapon: SpinnerWeapon): EffectParticle[] {
  const speed = weapon.currentSpeed / MAX_ANGULAR_VELOCITY;
  const particleCount = Math.floor(5 + speed * 15); // 5-20 particles
  const particles: EffectParticle[] = [];
  
  for (let i = 0; i < particleCount; i++) {
    const angle = Math.random() * Math.PI * 2;
    const velocity = 1 + speed * 3; // Faster spin = faster sparks
    
    particles.push({
      x: position.x,
      y: position.y,
      vx: Math.cos(angle) * velocity,
      vy: Math.sin(angle) * velocity,
      life: 15 + Math.random() * 10,
      maxLife: 25,
      size: 2 + Math.random() * 2,
      color: weapon.attackEffect.color,
      shape: 'spark',
      rotation: angle,
      rotationSpeed: 0.2
    });
  }
  
  return particles;
}
```

---

## LLM Prompt Integration

```markdown
### Fast Spinning Weapons

If the user wants a "fast spinning" weapon:
- Set `weapon.targetSpeed` between 1-10 (10 = max safe speed).
- Damage scales with spin-up duration (0.5s to reach full power).
- Visual effects (glow, motion blur) intensify with speed.
- Cannot spin instantly to prevent physics bugs.

**Example**:
```json
{
  "weapon": {
    "type": "spinner",
    "targetSpeed": 9,
    "spinUpRate": 0.7,
    "bladeRadius": 30,
    "bladeCount": 4,
    "damage": 7,
    "cooldown": 500
  },
  "attackEffect": {
    "color": "#ff3366",
    "intensity": 5,
    "trailLength": 4,
    "particleShape": "spark"
  }
}
```

**Behavior API**:
```javascript
function behavior(api, tick) {
  if (api.getDistanceToEnemy() < 120) {
    api.startSpinning();
    if (api.isAtMaxSpin()) {
      api.moveToward(api.getEnemyPosition());
      api.attack();
    }
  } else {
    api.stopSpinning();
  }
}
```
```

---

## Validation Rules

```typescript
function validateSpinner(weapon: SpinnerWeapon): ValidationResult {
  if (weapon.targetSpeed > 10) {
    return { valid: false, error: 'Target speed cannot exceed 10. Clamping to 10.' };
  }
  
  if (weapon.bladeRadius > 40) {
    return { valid: false, error: 'Blade radius too large. Max 40px.' };
  }
  
  if (weapon.bladeCount > 6) {
    return { valid: false, error: 'Max 6 blades allowed.' };
  }
  
  return { valid: true };
}
```

---

## Summary

| Feature | Implementation | Benefit |
|---------|----------------|----------|
| Angular velocity cap | 20 rad/s max | Prevents tunneling |
| Spin-up mechanic | 0.5s to max speed | Prevents instant-kill |
| Damage scaling | Multiplies by spin% | Rewards strategic timing |
| Motion blur | 0-6 trail copies | Clear visual feedback |
| Glow intensity | Scales with speed | Shows "danger level" |
| Impact sparks | More at high speed | Satisfying feedback |
| CCD | Swept collision | Reliable hits |

Fast spinning is now safe, balanced, and visually spectacular.
