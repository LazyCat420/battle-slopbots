# LLM Reasoning & Design Logic

## Purpose

This document teaches the LLM **how to think** about bot design — not just what JSON fields to fill. The LLM should reason through tradeoffs, understand why certain combinations work or fail, and produce bots that are **mechanically coherent** and **strategically interesting**.

---

## 1. The Design Thinking Process

The LLM should follow this mental model when generating a bot:

```
User Intent  →  Strategy  →  Archetype  →  Shape  →  Weight Budget  →  Stats  →  Behavior  →  Validate
```

### Step 1: Interpret Intent

**What does the user actually want?** Not just the literal words, but the *vibe*.

| User Says | Actual Intent | Key Constraint |
|-----------|--------------|----------------|
| "A really fast bot" | Speed is #1 priority | Light build, sacrifice armor |
| "An unstoppable tank" | Survivability + pushing power | Heavy, slow, high armor |
| "A tricky bot" | Unpredictable, strategic | Unusual weapon combo, evasion |
| "The strongest bot possible" | Max damage output | Heavy weapon, enough chassis to support it |
| "A defensive bot" | Outlast the opponent | High armor, moderate weapon, reactive strategy |
| "Something creative" | Novelty and surprise | Unusual archetype combo |

### Step 2: Choose a Strategy

Every bot needs a **win condition** — how does it plan to win the match?

| Strategy | How It Wins | Key Stats | Weapon Archetype |
|----------|------------|-----------|-----------------|
| **Aggro Rush** | Close distance fast, deal burst damage | High speed, moderate damage | Impact, Spinner |
| **Kite & Poke** | Stay at range, chip away | High speed, ranged weapon | Projectile, Reach |
| **Zone Control** | Deny area, force bad approaches | Spray weapon, moderate speed | Spray |
| **Attrition** | Outlast via armor + DoT | High armor, low damage but DoT | Spray (with DoT), Passive |
| **Ram & Smash** | Use mass as a weapon | Heavy, high traction | Passive/Ram, Treads |
| **Hit & Run** | Strike, retreat, repeat | High speed + accel, impact/reach | Impact, Reach |

### Step 3: Select Weapon Archetype

Match the weapon to the strategy (see `04-weapon-archetypes.md`).

**Key rule**: The weapon should be the *best tool for the strategy*, not just the coolest-sounding option.

### Step 4: Select Shape

Match the shape to the weapon (see `02-bot-assembly-logic.md` compatibility matrix).

**Key rule**: Shape isn't cosmetic. A circle spinner plays differently than a rectangle spinner.

### Step 5: Allocate Weight Budget

Spend 100 WU across chassis, armor, weapon, and drive. **Always calculate this explicitly.**

### Step 6: Generate Stats & Config

Fill in the JSON following the archetype template.

### Step 7: Write Behavior Code

Match behavior to the strategy. A kite bot shouldn't charge. A ram bot shouldn't hang back.

### Step 8: Validate

Run all constraints. Auto-correct if needed. Report corrections.

---

## 2. Common Design Mistakes (Anti-Patterns)

The LLM must avoid these traps:

### ❌ "Max Everything"

```
speed: 10, armor: 10, weapon damage: 10
```

**Why it fails**: Exceeds weight budget. Gets auto-corrected to mediocre everything.

**Fix**: Pick 1-2 stats to maximize. Accept weakness elsewhere.

### ❌ "Random Assembly"

```
shape: circle, weapon: lance, drive: treads
```

**Why it fails**: Circle has no flat face for lance mount (poor compatibility). Treads are slow but lances need kiting distance. Nothing synergizes.

**Fix**: Choose shape and drive that support the weapon. Lance → rectangle (flat mount) + wheels (maintain distance).

### ❌ "Giant Weapon, Tiny Bot"

```
size: 1, weapon damage: 10
```

**Why it fails**: Chassis too small to mount a damage-10 weapon (min size = ceil(10/3)+1 = 5). Fails validation.

**Fix**: Match weapon size to bot size. Big weapons need big bots.

### ❌ "Armor Tank with No Offense"

```
armor: 10, weapon damage: 1, speed: 1
```

**Why it fails**: Can't kill anything. Match goes to time, loses on damage dealt. No pressure.

**Fix**: Even defensive bots need viable offense. Minimum damage 4-5 to threaten.

### ❌ "Wrong Behavior for Weapon"

```
weapon: flamethrower (continuous)
behavior: api.attack() (instant)
```

**Why it fails**: Flamethrower needs `api.startSpraying()`/`api.stopSpraying()`, not `api.attack()`. Bot will never use its weapon correctly.

**Fix**: Match behavior API calls to weapon archetype (see templates in each archetype doc).

### ❌ "Stationary Turret"

```
speed: 1, weapon: gun (projectile)
behavior: just shoot, never move
```

**Why it fails**: Easy target. Any melee bot walks up and destroys it.

**Fix**: Even slow bots need positioning logic. At minimum: back away from approaching enemies.

---

## 3. Coherence Checklist

Before finalizing a bot, the LLM should mentally verify:

- [ ] **Weight budget**: Total WU ≤ 100?
- [ ] **Shape-weapon compatibility**: Good or acceptable fit?
- [ ] **Size supports weapon**: Chassis big enough for this weapon?
- [ ] **Speed makes sense for strategy**: Fast bot isn't overloaded with armor?
- [ ] **Behavior matches weapon**: Correct API calls for the archetype?
- [ ] **Win condition exists**: How does this bot actually win?
- [ ] **Weakness is acknowledged**: Strategy description explains the tradeoff?
- [ ] **Visually distinct**: Colors, draw code, effects aren't default?

---

## 4. The "Explain Your Reasoning" Requirement

The LLM must include a `strategyDescription` that explains its design choices:

### Good Example

```
"Mjolnir is a rectangular chassis designed for hit-and-run hammer strikes. 
The flat front face provides a stable mount for the heavy hammer (damage 8). 
Speed 7 with standard wheels gives good closing speed, but armor is only 4 — 
the strategy is to strike hard and retreat before taking damage. 
The behavior orbits at range until an opening appears, then charges for 
a single devastating hammer blow before pulling back."
```

### Bad Example

```
"A hammer bot that attacks enemies."
```

The good example shows *reasoning*: why rectangle, why speed 7, why low armor, what the win condition is. This forces the LLM to think coherently.

---

## 5. Counter-Design Reasoning

When generating a bot to fight a *specific* opponent, the LLM should reason about counters:

| Opponent Type | Counter Strategy | Why |
|--------------|-----------------|-----|
| Fast spinner | Heavy wedge/ram | Wedge deflects spinner, mass absorbs impact |
| Flame sprayer | Fast circle + projectile | Stay out of cone range, chip from distance |
| Heavy rammer | Omni-wheel kiter | Strafe away, never let it make contact |
| Long lance | Close-range spinner | Get inside lance range where it can't hit |
| Projectile bot | Fast dasher with armor | Close distance quickly, tank a few shots |
| Passive spike ball | Spray/DoT | Apply damage without making contact |

---

## 6. Design Variety Rules

To prevent the LLM from generating the same bot every time:

### Temperature Injection

Inject randomness into the prompt:

```
"Generate a bot with these constraints:
- Must use weapon archetype: [random from: impact, spinner, spray, projectile, reach, passive]
- Must use shape: [random from: circle, rectangle, triangle, pentagon, hexagon]
- Must prioritize: [random from: speed, armor, damage]
- Theme: [random from: medieval, sci-fi, nature, industrial, mythological]"
```

### Counter-Sampling

Track recently generated bots and bias against repeats:

```typescript
function injectVarietyConstraints(
  recentBots: BotDefinition[],
  prompt: string
): string {
  const recentWeapons = recentBots.map(b => b.weapon.type);
  const recentShapes = recentBots.map(b => b.shape);
  
  return prompt + `
VARIETY RULES:
- AVOID these recently used weapons: ${recentWeapons.join(', ')}
- AVOID these recently used shapes: ${recentShapes.join(', ')}
- Try something the audience hasn't seen yet.
`;
}
```

---

## 7. Prompt Structure for Optimal Reasoning

The system prompt should be structured to guide the LLM's thinking:

```markdown
# Bot Generation System Prompt

## Your Role
You are a combat robot engineer. Design a bot that is mechanically coherent, 
strategically sound, and visually interesting.

## Design Process (follow this order)
1. **Read the user's request** — what do they want?
2. **Choose a strategy** — how will this bot win?
3. **Select weapon archetype** — what weapon fits the strategy?
4. **Select shape** — what shape supports the weapon?
5. **Allocate weight budget** — spend 100 WU wisely.
6. **Check interdependencies** — does speed match mass? Does size fit weapon?
7. **Write behavior** — match API calls to weapon archetype.
8. **Describe your reasoning** — explain tradeoffs in strategyDescription.

## Constraint Reference
[Include tables from 02-bot-assembly-logic.md, 04-weapon-archetypes.md, etc.]

## Examples
[Include 3 diverse complete examples with reasoning]
```

This structure turns the LLM from a "fill in the JSON" machine into a **reasoning engine** that produces bots that make mechanical sense.
