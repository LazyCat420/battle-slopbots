# Edge Case: Spray Weapons (Flamethrower, Acid, Water, etc.)

## Problem Statement
When a user asks for "a flamethrower" or "acid spray" or "water cannon," the current hit-based damage model breaks:
- **Current model**: Single hit on cooldown.
- **Spray reality**: Continuous damage over time while in cone/beam.
- **LLM confusion**: Model doesn't know it needs continuous animation, not discrete attack.
- **Physics**: How to represent a "spray hitbox" that changes shape/size?

## Requirements
- Damage per tick (not per cooldown).
- Cone or beam-shaped hitbox.
- Animated particles flowing from source to target.
- Visual feedback on victim (burning, melting, wet effect).
- LLM understands this is a different weapon mode.

---

## Solution 1: Weapon Mode System

### Extend WeaponConfig
```typescript
type WeaponMode = 'instant' | 'continuous' | 'projectile';

interface WeaponConfig {
  type: WeaponType;
  mode: WeaponMode;         // NEW: determines damage delivery
  damage: number;           // For continuous: damage per second
  cooldown: number;         // For continuous: activation cooldown (can spray for N seconds)
  range: number;
  
  // Continuous-specific
  continuous?: ContinuousWeaponConfig;
  
  // Projectile-specific
  projectile?: ProjectileWeaponConfig;
}

interface ContinuousWeaponConfig {
  shape: 'cone' | 'beam' | 'ray';
  width: number;           // Cone angle (degrees) or beam width (pixels)
  duration: number;        // Max spray duration per activation (ms)
  tickDamage: number;      // Damage per tick (calculated from damage / tickRate)
  particleRate: number;    // Particles spawned per tick (visual density)
  dotDuration?: number;    // If > 0, applies DoT after spray ends (ms)
  dotTickDamage?: number;  // Damage per tick while DoT is active
}
```

### Example: Flamethrower
```json
{
  "weapon": {
    "type": "flamethrower",
    "mode": "continuous",
    "damage": 12,
    "cooldown": 3000,
    "range": 80,
    "continuous": {
      "shape": "cone",
      "width": 45,
      "duration": 1500,
      "particleRate": 8,
      "dotDuration": 2000,
      "dotTickDamage": 0.1
    }
  },
  "attackEffect": {
    "color": "#ff6600",
    "secondaryColor": "#ffaa00",
    "particleShape": "circle",
    "intensity": 5,
    "trailLength": 3
  }
}
```

---

## Solution 2: Cone Hitbox (Continuous Damage)

### Physics Implementation
```typescript
interface SprayState {
  isActive: boolean;        // Currently spraying?
  remainingDuration: number; // Time left in current spray (ms)
  hitTargets: Set<string>;  // Track which bots are currently being hit
}

function tickContinuousWeapon(attacker: BotState, target: BotState, dt: number): number {
  const weapon = attacker.definition.weapon;
  if (weapon.mode !== 'continuous' || !weapon.continuous) return 0;
  
  const sprayState = attacker.sprayState;
  if (!sprayState.isActive) return 0;
  
  // Check if target is in cone
  const inCone = isInSprayCone(
    attacker.position,
    attacker.angle,
    target.position,
    weapon.range,
    weapon.continuous.width
  );
  
  if (!inCone) {
    sprayState.hitTargets.delete(target.id);
    return 0;
  }
  
  // Apply continuous damage
  sprayState.hitTargets.add(target.id);
  const tickDamage = weapon.continuous.tickDamage || (weapon.damage / 30); // 30 FPS
  
  // Reduce remaining duration
  sprayState.remainingDuration -= dt;
  if (sprayState.remainingDuration <= 0) {
    sprayState.isActive = false;
    sprayState.hitTargets.clear();
  }
  
  return tickDamage;
}

function isInSprayCone(
  source: Vec2,
  sourceAngle: number,
  target: Vec2,
  range: number,
  coneAngle: number // degrees
): boolean {
  const dx = target.x - source.x;
  const dy = target.y - source.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  
  // Out of range?
  if (dist > range) return false;
  
  // Check angle
  const angleToTarget = Math.atan2(dy, dx);
  let angleDiff = Math.abs(angleToTarget - sourceAngle);
  
  // Normalize to [0, PI]
  if (angleDiff > Math.PI) angleDiff = 2 * Math.PI - angleDiff;
  
  const coneRad = (coneAngle * Math.PI / 180) / 2;
  return angleDiff <= coneRad;
}
```

### Behavior API Extension
```typescript
interface BehaviorAPI {
  startSpraying(): void;    // Begin continuous weapon
  stopSpraying(): void;     // Stop spraying (manual)
  isSpraying(): boolean;    // Is weapon currently active?
  getSprayTimeLeft(): number; // Remaining spray duration (0-1)
}
```

---

## Solution 3: DoT (Damage over Time) System

For weapons that apply burn/poison/corrosion after spray ends:

```typescript
interface DotEffect {
  type: 'burn' | 'poison' | 'corrosion' | 'frost';
  tickDamage: number;      // Damage per tick
  duration: number;        // Total duration (ms)
  remainingDuration: number; // Time left
  sourceId: string;        // Who applied it
  color: string;           // Visual effect color
}

interface BotState {
  // ... existing fields
  dotEffects: DotEffect[]; // Active DoT effects
}

function tickDotEffects(bot: BotState, dt: number): number {
  let totalDamage = 0;
  
  for (let i = bot.dotEffects.length - 1; i >= 0; i--) {
    const dot = bot.dotEffects[i];
    
    // Apply damage
    totalDamage += dot.tickDamage;
    
    // Reduce duration
    dot.remainingDuration -= dt;
    
    // Remove expired DoT
    if (dot.remainingDuration <= 0) {
      bot.dotEffects.splice(i, 1);
    }
  }
  
  return totalDamage;
}

function applyDotOnSprayHit(attacker: BotState, target: BotState) {
  const weapon = attacker.definition.weapon;
  if (!weapon.continuous?.dotDuration) return;
  
  // Check if DoT already exists from this attacker
  const existing = target.dotEffects.find(
    (dot) => dot.sourceId === attacker.id && dot.type === weapon.type
  );
  
  if (existing) {
    // Refresh duration
    existing.remainingDuration = weapon.continuous.dotDuration;
  } else {
    // Add new DoT
    target.dotEffects.push({
      type: weapon.type as any,
      tickDamage: weapon.continuous.dotTickDamage || 0.1,
      duration: weapon.continuous.dotDuration,
      remainingDuration: weapon.continuous.dotDuration,
      sourceId: attacker.id,
      color: attacker.definition.attackEffect.color
    });
  }
}
```

---

## Solution 4: Spray Particle System

### Flowing Particles (Source → Target)
```typescript
interface SprayParticle extends EffectParticle {
  targetX: number;         // Final destination X
  targetY: number;         // Final destination Y
  progress: number;        // 0-1 interpolation
  speed: number;           // How fast it travels
}

function spawnSprayParticles(attacker: BotState, tick: number): SprayParticle[] {
  const weapon = attacker.definition.weapon;
  if (!weapon.continuous) return [];
  
  const particles: SprayParticle[] = [];
  const rate = weapon.continuous.particleRate;
  
  for (let i = 0; i < rate; i++) {
    // Random spread within cone
    const spreadAngle = (Math.random() - 0.5) * weapon.continuous.width * (Math.PI / 180);
    const angle = attacker.angle + spreadAngle;
    const dist = weapon.range * (0.7 + Math.random() * 0.3);
    
    const targetX = attacker.position.x + Math.cos(angle) * dist;
    const targetY = attacker.position.y + Math.sin(angle) * dist;
    
    particles.push({
      x: attacker.position.x + Math.cos(attacker.angle) * 20, // Start from nozzle
      y: attacker.position.y + Math.sin(attacker.angle) * 20,
      vx: 0,
      vy: 0,
      targetX,
      targetY,
      progress: 0,
      speed: 0.05 + Math.random() * 0.05, // 5-10% per frame
      life: 20,
      maxLife: 20,
      size: 3 + Math.random() * 2,
      color: attacker.definition.attackEffect.color,
      shape: attacker.definition.attackEffect.particleShape,
      rotation: 0,
      rotationSpeed: 0.1
    });
  }
  
  return particles;
}

function updateSprayParticle(p: SprayParticle) {
  // Interpolate toward target
  p.progress += p.speed;
  
  if (p.progress >= 1) {
    p.life = 0; // Expire on arrival
    return;
  }
  
  // Lerp position
  const startX = p.x;
  const startY = p.y;
  p.x = startX + (p.targetX - startX) * p.progress;
  p.y = startY + (p.targetY - startY) * p.progress;
  
  // Slight turbulence
  p.x += (Math.random() - 0.5) * 2;
  p.y += (Math.random() - 0.5) * 2;
}
```

### Render Spray Cone (Debug/Visual Aid)
```typescript
function renderSprayCone(ctx: CanvasRenderingContext2D, attacker: BotState) {
  const weapon = attacker.definition.weapon;
  if (!weapon.continuous) return;
  
  const coneAngle = weapon.continuous.width * (Math.PI / 180);
  const range = weapon.range;
  
  ctx.save();
  ctx.translate(attacker.position.x, attacker.position.y);
  ctx.rotate(attacker.angle);
  
  // Semi-transparent cone
  ctx.fillStyle = `${attacker.definition.attackEffect.color}33`; // 20% opacity
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.arc(0, 0, range, -coneAngle / 2, coneAngle / 2);
  ctx.closePath();
  ctx.fill();
  
  // Cone outline
  ctx.strokeStyle = attacker.definition.attackEffect.color;
  ctx.lineWidth = 1;
  ctx.stroke();
  
  ctx.restore();
}
```

---

## Solution 5: Victim Visual Feedback

### Burn/DoT Overlay
```typescript
function renderDotEffects(ctx: CanvasRenderingContext2D, bot: BotState, radius: number) {
  if (bot.dotEffects.length === 0) return;
  
  for (const dot of bot.dotEffects) {
    const progress = 1 - (dot.remainingDuration / dot.duration);
    
    switch (dot.type) {
      case 'burn':
        // Fire particles rising from bot
        ctx.fillStyle = dot.color;
        for (let i = 0; i < 3; i++) {
          const x = (Math.random() - 0.5) * radius;
          const y = -radius - Math.random() * 10;
          ctx.globalAlpha = 0.6 - progress * 0.4;
          ctx.beginPath();
          ctx.arc(x, y, 2 + Math.random() * 2, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
        break;
        
      case 'poison':
        // Pulsing green glow
        ctx.shadowColor = dot.color;
        ctx.shadowBlur = 10 + Math.sin(progress * Math.PI * 4) * 5;
        ctx.strokeStyle = `${dot.color}66`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, radius + 3, 0, Math.PI * 2);
        ctx.stroke();
        ctx.shadowBlur = 0;
        break;
        
      case 'corrosion':
        // Bubbling effect
        ctx.fillStyle = `${dot.color}99`;
        for (let i = 0; i < 2; i++) {
          const x = (Math.random() - 0.5) * radius * 1.5;
          const y = (Math.random() - 0.5) * radius * 1.5;
          const size = 1 + Math.random() * 2;
          ctx.beginPath();
          ctx.arc(x, y, size, 0, Math.PI * 2);
          ctx.fill();
        }
        break;
    }
  }
}
```

### Screen Tint (When Being Sprayed)
```typescript
function renderSprayVictimFeedback(ctx: CanvasRenderingContext2D, bot: BotState, radius: number) {
  if (!bot.isBeingSprayed) return;
  
  // Pulsing overlay
  const pulse = Math.sin(Date.now() * 0.01) * 0.2 + 0.3; // 0.3-0.5
  ctx.fillStyle = `${bot.spraySource.attackEffect.color}${Math.floor(pulse * 255).toString(16)}`;
  ctx.beginPath();
  ctx.arc(0, 0, radius + 5, 0, Math.PI * 2);
  ctx.fill();
}
```

---

## Solution 6: LLM Prompt Integration

```markdown
### Continuous/Spray Weapons

For weapons that spray continuously (flamethrower, acid, water, etc.):
- Set `mode: "continuous"`.
- Configure `continuous` object with cone shape, duration, and particle rate.
- Damage is applied **per tick** while target is in cone.
- Optional: Add DoT (damage over time) that persists after spray ends.

**Example**:
```json
{
  "weapon": {
    "type": "flamethrower",
    "mode": "continuous",
    "damage": 15,
    "cooldown": 4000,
    "range": 80,
    "continuous": {
      "shape": "cone",
      "width": 40,
      "duration": 2000,
      "particleRate": 10,
      "dotDuration": 3000,
      "dotTickDamage": 0.2
    }
  },
  "attackEffect": {
    "color": "#ff4400",
    "secondaryColor": "#ff8800",
    "particleShape": "circle",
    "intensity": 5
  }
}
```

**Behavior**:
```javascript
function behavior(api, tick) {
  const dist = api.getDistanceToEnemy();
  const angle = api.angleTo(api.getEnemyPosition());
  
  // Face enemy
  api.rotateTo(angle);
  
  // Spray if in range
  if (dist < 100) {
    api.startSpraying();
    api.moveToward(api.getEnemyPosition(), 2); // Slow advance
  } else {
    api.stopSpraying();
    api.moveToward(api.getEnemyPosition());
  }
}
```
```

---

## Validation Rules

```typescript
function validateContinuousWeapon(weapon: WeaponConfig): ValidationResult {
  if (!weapon.continuous) {
    return { valid: false, error: 'Continuous weapon missing "continuous" config.' };
  }
  
  if (weapon.continuous.width > 90) {
    return { valid: false, error: 'Cone width too large. Max 90 degrees.' };
  }
  
  if (weapon.continuous.duration > 3000) {
    return { valid: false, error: 'Spray duration too long. Max 3 seconds per burst.' };
  }
  
  if (weapon.continuous.dotDuration && weapon.continuous.dotDuration > 5000) {
    return { valid: false, error: 'DoT duration too long. Max 5 seconds.' };
  }
  
  return { valid: true };
}
```

---

## Summary

| Weapon Type | Mode | Hitbox | Damage Model | Visual Feedback |
|-------------|------|--------|--------------|------------------|
| Flamethrower | continuous | Cone (40°) | 0.5 dmg/tick + DoT | Fire particles + burn overlay |
| Acid Spray | continuous | Cone (30°) | 0.4 dmg/tick + corrosion | Green bubbles + glow |
| Water Cannon | continuous | Beam (10px wide) | 0.3 dmg/tick | Blue stream + splash |
| Freeze Ray | continuous | Ray (single target) | 0.2 dmg/tick + slow | Ice crystals + tint |

Now the LLM can build spray weapons that:
- Apply continuous damage (not burst).
- Have appropriate physics (cone/beam hitboxes).
- Display correct animations (flowing particles).
- Provide clear feedback (DoT overlays).
