/**
 * Attack Effects — Weapon-specific visual animation renderers.
 *
 * Each weapon type has a dedicated renderer that reads the bot's
 * AttackEffect params (color, intensity, particleShape, trailLength)
 * to produce unique visuals per bot.
 */
import { BotState, AttackEffect, WeaponType, ParticleShape } from "@/lib/types/bot";

// ── Effect Particle ───────────────────────────────────────
export interface EffectParticle {
    x: number;
    y: number;
    vx: number;
    vy: number;
    life: number;
    maxLife: number;
    color: string;
    size: number;
    shape: ParticleShape;
    rotation: number;
    rotationSpeed: number;
}

// ── Default effects per weapon type ───────────────────────
export function getDefaultAttackEffect(weaponType: WeaponType, botColor: string): AttackEffect {
    const defaults: Record<WeaponType, AttackEffect> = {
        spinner: {
            color: "#FFD700",
            secondaryColor: "#FFA500",
            particleShape: "spark",
            intensity: 3,
            trailLength: 2,
        },
        flipper: {
            color: "#44DDFF",
            secondaryColor: "#2288FF",
            particleShape: "star",
            intensity: 4,
            trailLength: 1,
        },
        hammer: {
            color: "#FF6633",
            secondaryColor: "#CC3300",
            particleShape: "square",
            intensity: 5,
            trailLength: 1,
        },
        saw: {
            color: "#FFEE44",
            secondaryColor: "#FF8800",
            particleShape: "spark",
            intensity: 3,
            trailLength: 3,
        },
        lance: {
            color: "#AAEEFF",
            secondaryColor: "#6699FF",
            particleShape: "circle",
            intensity: 2,
            trailLength: 5,
        },
        flamethrower: {
            color: "#FF4400",
            secondaryColor: "#FFAA00",
            particleShape: "circle",
            intensity: 5,
            trailLength: 4,
        },
    };

    const effect = { ...defaults[weaponType] };
    // If bot has a distinct color, tint the secondary with it
    if (botColor && botColor !== "#888888") {
        effect.secondaryColor = botColor;
    }
    return effect;
}

// ── Particle drawing helpers ──────────────────────────────

export function drawParticleShape(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    size: number,
    shape: ParticleShape,
    rotation: number
) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rotation);

    switch (shape) {
        case "circle":
            ctx.beginPath();
            ctx.arc(0, 0, size, 0, Math.PI * 2);
            ctx.fill();
            break;
        case "spark": {
            // Diamond / elongated shape
            ctx.beginPath();
            ctx.moveTo(0, -size * 1.5);
            ctx.lineTo(size * 0.5, 0);
            ctx.lineTo(0, size * 1.5);
            ctx.lineTo(-size * 0.5, 0);
            ctx.closePath();
            ctx.fill();
            break;
        }
        case "star": {
            const spikes = 4;
            const outerR = size;
            const innerR = size * 0.4;
            ctx.beginPath();
            for (let i = 0; i < spikes * 2; i++) {
                const r = i % 2 === 0 ? outerR : innerR;
                const a = (i * Math.PI) / spikes - Math.PI / 2;
                if (i === 0) ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
                else ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
            }
            ctx.closePath();
            ctx.fill();
            break;
        }
        case "square":
            ctx.fillRect(-size, -size, size * 2, size * 2);
            break;
    }

    ctx.restore();
}

// ── Weapon-specific attack renderers ──────────────────────

/** Spinner: rotating arc ring with motion blur trails and additive glow */
function renderSpinner(
    ctx: CanvasRenderingContext2D,
    bot: BotState,
    radius: number,
    effect: AttackEffect,
    tick: number
) {
    const ringRadius = radius + 12;
    const spinAngle = (tick * 0.35) % (Math.PI * 2);

    // Motion blur trails (3 afterimages at previous positions)
    for (let trail = 3; trail >= 1; trail--) {
        const trailAngle = spinAngle - trail * 0.15;
        ctx.strokeStyle = effect.color;
        ctx.lineWidth = 3 - trail * 0.5;
        ctx.globalAlpha = 0.15 / trail;
        for (let i = 0; i < 3; i++) {
            const startAngle = trailAngle + (i * Math.PI * 2) / 3;
            ctx.beginPath();
            ctx.arc(0, 0, ringRadius, startAngle, startAngle + 0.8);
            ctx.stroke();
        }
    }
    ctx.globalAlpha = 1;

    // Main rotating energy arcs with additive glow
    ctx.globalCompositeOperation = "lighter";
    ctx.strokeStyle = effect.color;
    ctx.lineWidth = 3.5;
    ctx.shadowColor = effect.color;
    ctx.shadowBlur = 12 * effect.intensity;

    for (let i = 0; i < 3; i++) {
        const startAngle = spinAngle + (i * Math.PI * 2) / 3;
        ctx.beginPath();
        ctx.arc(0, 0, ringRadius, startAngle, startAngle + 0.8);
        ctx.stroke();
    }

    // Pulsing energy ring
    const ringPulse = 0.3 + 0.2 * Math.sin(tick * 0.12);
    ctx.strokeStyle = effect.secondaryColor;
    ctx.lineWidth = 1;
    ctx.globalAlpha = ringPulse;
    ctx.beginPath();
    ctx.arc(0, 0, ringRadius + 4, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;

    ctx.globalCompositeOperation = "source-over";

    // Flying sparks with neon glow
    ctx.fillStyle = effect.secondaryColor;
    ctx.shadowColor = effect.secondaryColor;
    ctx.shadowBlur = 6;
    for (let i = 0; i < effect.intensity * 2; i++) {
        const a = spinAngle + (i * Math.PI * 2) / (effect.intensity * 2);
        const sx = Math.cos(a) * ringRadius;
        const sy = Math.sin(a) * ringRadius;
        drawParticleShape(ctx, sx, sy, 2.5 + effect.intensity * 0.5, effect.particleShape, a);
    }

    ctx.shadowBlur = 0;
}

/** Flipper: upward arc sweep with afterimage trail and additive glow shockwave */
function renderFlipper(
    ctx: CanvasRenderingContext2D,
    bot: BotState,
    radius: number,
    effect: AttackEffect,
) {
    const frame = bot.attackAnimationFrame;
    const progress = Math.min(frame / 8, 1);

    // Afterimage sweep trails
    for (let trail = 3; trail >= 1; trail--) {
        const tp = Math.max(0, progress - trail * 0.08);
        const trailSweep = tp * Math.PI;
        ctx.strokeStyle = effect.color;
        ctx.lineWidth = 4 - trail;
        ctx.globalAlpha = 0.1 / trail;
        ctx.beginPath();
        ctx.arc(radius * 0.5, 0, radius * 0.8, -trailSweep / 2, trailSweep / 2);
        ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // Main sweeping arc with glow
    ctx.globalCompositeOperation = "lighter";
    ctx.strokeStyle = effect.color;
    ctx.lineWidth = 4.5;
    ctx.shadowColor = effect.color;
    ctx.shadowBlur = 15 * effect.intensity;

    const sweepAngle = progress * Math.PI;
    ctx.beginPath();
    ctx.arc(radius * 0.5, 0, radius * 0.8, -sweepAngle / 2, sweepAngle / 2);
    ctx.stroke();

    // Shockwave ring (expands outward with gradient fade)
    if (progress > 0.3) {
        const shockRadius = radius + (progress - 0.3) * 45 * effect.intensity;
        const shockAlpha = (1 - progress) * 0.6;

        // Outer glow ring
        ctx.strokeStyle = effect.secondaryColor;
        ctx.globalAlpha = shockAlpha;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(radius * 0.7, 0, shockRadius, -0.6, 0.6);
        ctx.stroke();

        // Inner bright ring
        ctx.strokeStyle = "#FFFFFF";
        ctx.globalAlpha = shockAlpha * 0.5;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(radius * 0.7, 0, shockRadius * 0.7, -0.4, 0.4);
        ctx.stroke();

        // Launch particles
        ctx.fillStyle = effect.color;
        ctx.globalAlpha = shockAlpha;
        for (let i = 0; i < effect.intensity; i++) {
            const pa = -0.5 + (i / effect.intensity);
            const pd = shockRadius * (0.5 + Math.random() * 0.5);
            drawParticleShape(ctx, radius * 0.7 + Math.cos(pa) * pd, Math.sin(pa) * pd, 2, effect.particleShape, pa);
        }
    }

    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
    ctx.shadowBlur = 0;
}

/** Hammer: overhead slam with additive glow impact, ground cracks, cinematic shockwave */
function renderHammer(
    ctx: CanvasRenderingContext2D,
    bot: BotState,
    radius: number,
    effect: AttackEffect,
) {
    const frame = bot.attackAnimationFrame;
    const progress = Math.min(frame / 10, 1);

    // Hammer head with gradient
    const hammerOffset = progress < 0.5
        ? radius + 5 + (progress * 2) * 15
        : radius + 5 + (1 - (progress - 0.5) * 2) * 15;

    ctx.shadowColor = effect.color;
    ctx.shadowBlur = 8 * effect.intensity;
    ctx.fillStyle = effect.color;
    ctx.fillRect(hammerOffset - 5, -11, 14, 22);
    // Hammer highlight
    ctx.fillStyle = effect.secondaryColor;
    ctx.globalAlpha = 0.4;
    ctx.fillRect(hammerOffset - 3, -9, 10, 4);
    ctx.globalAlpha = 1;

    // Shaft with gradient
    ctx.strokeStyle = effect.secondaryColor;
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.moveTo(radius, 0);
    ctx.lineTo(hammerOffset - 5, 0);
    ctx.stroke();

    // Cinematic ground impact effect
    if (progress > 0.5) {
        const impactProgress = (progress - 0.5) * 2;
        const impactRadius = 12 + impactProgress * 30 * effect.intensity;

        ctx.globalCompositeOperation = "lighter";

        // Screen flash (large glow behind impact)
        ctx.fillStyle = effect.color;
        ctx.globalAlpha = (1 - impactProgress) * 0.2;
        ctx.beginPath();
        ctx.arc(hammerOffset + 6, 0, impactRadius * 2, 0, Math.PI * 2);
        ctx.fill();

        // Outer shockwave ring
        ctx.strokeStyle = effect.color;
        ctx.globalAlpha = (1 - impactProgress) * 0.8;
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(hammerOffset + 6, 0, impactRadius, 0, Math.PI * 2);
        ctx.stroke();

        // Inner hot ring
        ctx.strokeStyle = "#FFFFFF";
        ctx.globalAlpha = (1 - impactProgress) * 0.4;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(hammerOffset + 6, 0, impactRadius * 0.5, 0, Math.PI * 2);
        ctx.stroke();

        ctx.globalCompositeOperation = "source-over";

        // Ground crack lines radiating from impact
        ctx.strokeStyle = effect.secondaryColor;
        ctx.globalAlpha = (1 - impactProgress) * 0.7;
        ctx.lineWidth = 1.5;
        const crackCount = 6 + effect.intensity;
        for (let i = 0; i < crackCount; i++) {
            const a = (i / crackCount) * Math.PI * 2;
            const crackLen = impactRadius * (0.5 + Math.random() * 0.6);
            ctx.beginPath();
            ctx.moveTo(hammerOffset + 6, 0);
            ctx.lineTo(
                hammerOffset + 6 + Math.cos(a) * crackLen,
                Math.sin(a) * crackLen
            );
            ctx.stroke();
        }

        // Impact sparks
        ctx.fillStyle = effect.secondaryColor;
        ctx.globalAlpha = 1 - impactProgress;
        const sparkCount = effect.intensity * 4;
        for (let i = 0; i < sparkCount; i++) {
            const a = (i / sparkCount) * Math.PI * 2;
            const dist = impactRadius * (0.5 + Math.random() * 0.5);
            drawParticleShape(
                ctx,
                hammerOffset + 6 + Math.cos(a) * dist,
                Math.sin(a) * dist,
                2.5 + effect.intensity * 0.6,
                effect.particleShape,
                a
            );
        }
        ctx.globalAlpha = 1;
    }

    ctx.shadowBlur = 0;
}

/** Saw: spinning blade disc with gradient glow, additive teeth, and directional metal sparks */
function renderSaw(
    ctx: CanvasRenderingContext2D,
    _bot: BotState,
    radius: number,
    effect: AttackEffect,
    tick: number
) {
    const sawX = radius + 14;
    const sawRadius = 11 + effect.intensity;
    const spinAngle = (tick * 0.5) % (Math.PI * 2);

    // Blade glow aura
    ctx.globalCompositeOperation = "lighter";
    const bladeGlow = ctx.createRadialGradient(sawX, 0, 0, sawX, 0, sawRadius + 6);
    bladeGlow.addColorStop(0, effect.color);
    bladeGlow.addColorStop(1, "transparent");
    ctx.fillStyle = bladeGlow;
    ctx.globalAlpha = 0.25 + 0.1 * Math.sin(tick * 0.15);
    ctx.beginPath();
    ctx.arc(sawX, 0, sawRadius + 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";

    // Outer ring with glow
    ctx.strokeStyle = effect.color;
    ctx.lineWidth = 2.5;
    ctx.shadowColor = effect.color;
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.arc(sawX, 0, sawRadius, 0, Math.PI * 2);
    ctx.stroke();

    // Inner hub
    ctx.fillStyle = effect.secondaryColor;
    ctx.globalAlpha = 0.5;
    ctx.beginPath();
    ctx.arc(sawX, 0, sawRadius * 0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;

    // Teeth (rotating) with glow
    const teeth = 8;
    ctx.strokeStyle = effect.color;
    ctx.lineWidth = 2;
    for (let i = 0; i < teeth; i++) {
        const a = spinAngle + (i * Math.PI * 2) / teeth;
        const innerDist = sawRadius * 0.5;
        const outerDist = sawRadius + 3;
        ctx.beginPath();
        ctx.moveTo(sawX + Math.cos(a) * innerDist, Math.sin(a) * innerDist);
        ctx.lineTo(sawX + Math.cos(a) * outerDist, Math.sin(a) * outerDist);
        ctx.stroke();
    }

    // Directional metal sparks (fly off tangentially)
    ctx.fillStyle = effect.secondaryColor;
    ctx.shadowColor = effect.secondaryColor;
    ctx.shadowBlur = 4;
    for (let i = 0; i < effect.intensity * 3; i++) {
        const sparkAngle = spinAngle + (i * 1.1);
        // Sparks fly tangentially outward
        const sparkDist = sawRadius + 4 + (i * 3) % 10;
        const tangentOffset = (i * 2.5) % 8;
        const sx = sawX + Math.cos(sparkAngle) * sparkDist + Math.cos(sparkAngle + Math.PI / 2) * tangentOffset;
        const sy = Math.sin(sparkAngle) * sparkDist + Math.sin(sparkAngle + Math.PI / 2) * tangentOffset;
        ctx.globalAlpha = 0.8 - (tangentOffset / 8) * 0.6;
        drawParticleShape(ctx, sx, sy, 1.5 + Math.random() * 2, effect.particleShape, sparkAngle);
    }
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
}

/** Lance: thrust with energy charge-up, speed lines, gradient tip, and impact flash */
function renderLance(
    ctx: CanvasRenderingContext2D,
    bot: BotState,
    radius: number,
    effect: AttackEffect,
) {
    const frame = bot.attackAnimationFrame;
    const progress = Math.min(frame / 8, 1);
    const thrustDist = radius + progress * (bot.definition.weapon.range * 0.7);

    // Energy charge-up glow at base
    if (progress < 0.3) {
        ctx.globalCompositeOperation = "lighter";
        const chargeGlow = ctx.createRadialGradient(radius, 0, 0, radius, 0, 15);
        chargeGlow.addColorStop(0, "#FFFFFF");
        chargeGlow.addColorStop(0.5, effect.color);
        chargeGlow.addColorStop(1, "transparent");
        ctx.fillStyle = chargeGlow;
        ctx.globalAlpha = (progress / 0.3) * 0.6;
        ctx.beginPath();
        ctx.arc(radius, 0, 15, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = "source-over";
    }

    // Lance shaft with glow
    ctx.strokeStyle = effect.color;
    ctx.lineWidth = 3.5;
    ctx.shadowColor = effect.color;
    ctx.shadowBlur = 8 * effect.intensity;
    ctx.beginPath();
    ctx.moveTo(radius, 0);
    ctx.lineTo(thrustDist, 0);
    ctx.stroke();

    // Lance tip with gradient
    const tipGrad = ctx.createLinearGradient(thrustDist - 6, 0, thrustDist + 10, 0);
    tipGrad.addColorStop(0, effect.color);
    tipGrad.addColorStop(1, "#FFFFFF");
    ctx.fillStyle = tipGrad;
    ctx.beginPath();
    ctx.moveTo(thrustDist + 10, 0);
    ctx.lineTo(thrustDist - 6, -6);
    ctx.lineTo(thrustDist - 6, 6);
    ctx.closePath();
    ctx.fill();

    // Additive speed lines
    ctx.globalCompositeOperation = "lighter";
    ctx.strokeStyle = effect.secondaryColor;
    ctx.lineWidth = 1;
    for (let i = 0; i < effect.trailLength + 2; i++) {
        const spread = (i + 1) * 4;
        const trailAlpha = 0.4 / (i + 1);
        ctx.globalAlpha = trailAlpha;
        ctx.beginPath();
        ctx.moveTo(radius, -spread);
        ctx.lineTo(thrustDist * 0.6, -spread * 0.3);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(radius, spread);
        ctx.lineTo(thrustDist * 0.6, spread * 0.3);
        ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // Impact flash at full extension
    if (progress > 0.8) {
        const flashAlpha = (1 - progress) * 4;
        ctx.fillStyle = "#FFFFFF";
        ctx.globalAlpha = flashAlpha * 0.5;
        ctx.beginPath();
        ctx.arc(thrustDist + 8, 0, 8 * effect.intensity, 0, Math.PI * 2);
        ctx.fill();
    }

    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
    ctx.shadowBlur = 0;
}

/** Flamethrower: gradient fire cone with additive heat bloom, smoke, and multi-colored particles */
function renderFlamethrower(
    ctx: CanvasRenderingContext2D,
    _bot: BotState,
    radius: number,
    effect: AttackEffect,
    tick: number
) {
    const weaponRange = 65 + effect.trailLength * 12;
    const coneHalfAngle = 0.35 + effect.intensity * 0.07;

    // Heat wobble
    const wobble = Math.sin(tick * 0.4) * 0.03 * effect.intensity;
    ctx.save();
    ctx.rotate(wobble);

    // Additive heat bloom (wide soft glow behind flames)
    ctx.globalCompositeOperation = "lighter";
    const heatGlow = ctx.createRadialGradient(radius + weaponRange * 0.4, 0, 0, radius + weaponRange * 0.4, 0, weaponRange * 0.6);
    heatGlow.addColorStop(0, effect.color);
    heatGlow.addColorStop(1, "transparent");
    ctx.fillStyle = heatGlow;
    ctx.globalAlpha = 0.15 + effect.intensity * 0.04;
    ctx.beginPath();
    ctx.arc(radius + weaponRange * 0.4, 0, weaponRange * 0.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";

    // Outer fire cone with gradient
    const coneGrad = ctx.createLinearGradient(radius, 0, radius + weaponRange, 0);
    coneGrad.addColorStop(0, effect.secondaryColor);
    coneGrad.addColorStop(0.3, effect.color);
    coneGrad.addColorStop(0.7, effect.color);
    coneGrad.addColorStop(1, "rgba(100,50,0,0.1)");
    ctx.fillStyle = coneGrad;
    ctx.globalAlpha = 0.3 + effect.intensity * 0.06;
    ctx.shadowColor = effect.color;
    ctx.shadowBlur = 20;
    ctx.beginPath();
    ctx.moveTo(radius, 0);
    ctx.lineTo(
        radius + weaponRange * Math.cos(-coneHalfAngle),
        weaponRange * Math.sin(-coneHalfAngle)
    );
    ctx.lineTo(
        radius + weaponRange * Math.cos(coneHalfAngle),
        weaponRange * Math.sin(coneHalfAngle)
    );
    ctx.closePath();
    ctx.fill();

    // Inner bright hot core
    const innerAngle = coneHalfAngle * 0.35;
    const coreGrad = ctx.createLinearGradient(radius, 0, radius + weaponRange * 0.5, 0);
    coreGrad.addColorStop(0, "#FFFFFF");
    coreGrad.addColorStop(0.5, effect.secondaryColor);
    coreGrad.addColorStop(1, "transparent");
    ctx.fillStyle = coreGrad;
    ctx.globalAlpha = 0.2;
    ctx.beginPath();
    ctx.moveTo(radius, 0);
    ctx.lineTo(
        radius + weaponRange * 0.5 * Math.cos(-innerAngle),
        weaponRange * 0.5 * Math.sin(-innerAngle)
    );
    ctx.lineTo(
        radius + weaponRange * 0.5 * Math.cos(innerAngle),
        weaponRange * 0.5 * Math.sin(innerAngle)
    );
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;

    // Multi-colored fire particles with additive glow
    ctx.globalCompositeOperation = "lighter";
    const particleCount = effect.intensity * 7;
    for (let i = 0; i < particleCount; i++) {
        const t = (i + tick * 0.25) % particleCount;
        const dist = radius + (t / particleCount) * weaponRange;
        const spread = (t / particleCount) * coneHalfAngle;
        const angle = (Math.random() - 0.5) * spread * 2;
        const px = dist * Math.cos(angle);
        const py = dist * Math.sin(angle);
        const alpha = 1 - t / particleCount;
        const size = 2 + (t / particleCount) * 6 * (effect.intensity / 3);

        // Color variation: primary, secondary, white flash, orange
        const colorIdx = i % 5;
        ctx.fillStyle = colorIdx === 0 ? effect.secondaryColor
            : colorIdx === 3 ? "#FFFFFF"
                : colorIdx === 4 ? "#FF8800"
                    : effect.color;
        ctx.globalAlpha = alpha * (colorIdx === 3 ? 0.3 : 0.7);
        drawParticleShape(ctx, px, py, size, effect.particleShape, tick * 0.15 + i);
    }
    ctx.globalCompositeOperation = "source-over";

    // Smoke particles at flame tips (fading to gray)
    ctx.fillStyle = "#444444";
    for (let i = 0; i < 3; i++) {
        const smokeT = (tick * 0.1 + i * 1.5) % 3;
        const smokeDist = weaponRange * (0.8 + smokeT * 0.12);
        const smokeAngle = (Math.random() - 0.5) * coneHalfAngle * 1.5;
        const smokeX = radius + smokeDist * Math.cos(smokeAngle);
        const smokeY = smokeDist * Math.sin(smokeAngle);
        ctx.globalAlpha = 0.15 - smokeT * 0.04;
        ctx.beginPath();
        ctx.arc(smokeX, smokeY, 4 + smokeT * 3, 0, Math.PI * 2);
        ctx.fill();
    }

    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
    ctx.restore();
}

// ── Main dispatcher ───────────────────────────────────────

const RENDERERS: Record<
    WeaponType,
    (ctx: CanvasRenderingContext2D, bot: BotState, radius: number, effect: AttackEffect, tick: number) => void
> = {
    spinner: renderSpinner,
    flipper: renderFlipper,
    hammer: renderHammer,
    saw: renderSaw,
    lance: renderLance,
    flamethrower: renderFlamethrower,
};

/**
 * Render a weapon attack effect for a bot.
 * Call this inside ctx.save/restore while translated+rotated to the bot's position.
 */
export function renderAttackEffect(
    ctx: CanvasRenderingContext2D,
    bot: BotState,
    radius: number,
    tick: number
) {
    const effect = bot.definition.attackEffect;
    const weaponType = bot.definition.weapon.type;
    const renderer = RENDERERS[weaponType];

    if (renderer) {
        renderer(ctx, bot, radius, effect, tick);
    }
}

/**
 * Spawn weapon-specific particles from an attack.
 * Returns particles colored by the attacker's attack effect.
 */
export function spawnAttackParticles(
    bot: BotState,
    targetX: number,
    targetY: number,
    damage: number
): EffectParticle[] {
    const effect = bot.definition.attackEffect;
    const count = Math.ceil(damage * effect.intensity * 0.8);
    const particles: EffectParticle[] = [];

    for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 1 + Math.random() * 3;
        particles.push({
            x: targetX,
            y: targetY,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            life: 15 + Math.random() * 20,
            maxLife: 35,
            color: i % 2 === 0 ? effect.color : effect.secondaryColor,
            size: 2 + Math.random() * 3,
            shape: effect.particleShape,
            rotation: Math.random() * Math.PI * 2,
            rotationSpeed: (Math.random() - 0.5) * 0.2,
        });
    }

    return particles;
}

// ── Weapon idle animations ────────────────────────────────

const IDLE_RENDERERS: Record<
    WeaponType,
    (ctx: CanvasRenderingContext2D, radius: number, effect: AttackEffect, tick: number) => void
> = {
    spinner: (ctx, radius, effect, tick) => {
        // Slowly rotating arc segments with glow
        const spinAngle = tick * 0.03;
        ctx.globalCompositeOperation = "lighter";
        ctx.strokeStyle = effect.color;
        ctx.shadowColor = effect.color;
        ctx.shadowBlur = 6;
        ctx.lineWidth = 1.5;
        ctx.globalAlpha = 0.35 + Math.sin(tick * 0.05) * 0.15;
        for (let i = 0; i < 2; i++) {
            const a = spinAngle + i * Math.PI;
            ctx.beginPath();
            ctx.arc(0, 0, radius + 7, a, a + 0.6);
            ctx.stroke();
        }
        ctx.shadowBlur = 0;
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = "source-over";
    },
    flipper: (ctx, radius, effect, tick) => {
        // Pulsing neon bar at front
        const pulse = 0.3 + Math.sin(tick * 0.06) * 0.15;
        ctx.globalCompositeOperation = "lighter";
        ctx.fillStyle = effect.color;
        ctx.shadowColor = effect.color;
        ctx.shadowBlur = 8;
        ctx.globalAlpha = pulse;
        ctx.fillRect(radius + 2, -9, 5, 18);
        ctx.shadowBlur = 0;
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = "source-over";
    },
    hammer: (ctx, radius, effect, tick) => {
        // Swaying hammer head with glow
        const bob = Math.sin(tick * 0.04) * 3;
        ctx.shadowColor = effect.color;
        ctx.shadowBlur = 5;
        ctx.fillStyle = effect.color;
        ctx.globalAlpha = 0.4;
        ctx.fillRect(radius + 4, -7 + bob, 10, 14);
        // Shaft
        ctx.strokeStyle = effect.secondaryColor;
        ctx.lineWidth = 2;
        ctx.globalAlpha = 0.3;
        ctx.beginPath();
        ctx.moveTo(radius, 0);
        ctx.lineTo(radius + 4, bob * 0.3);
        ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.globalAlpha = 1;
    },
    saw: (ctx, radius, effect, tick) => {
        // Slowly spinning blade with teeth
        const sawX = radius + 10;
        const sawR = 9;
        const spinAngle = tick * 0.1;
        ctx.strokeStyle = effect.color;
        ctx.shadowColor = effect.color;
        ctx.shadowBlur = 4;
        ctx.globalAlpha = 0.45;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(sawX, 0, sawR, 0, Math.PI * 2);
        ctx.stroke();
        ctx.lineWidth = 1;
        for (let i = 0; i < 6; i++) {
            const a = spinAngle + (i * Math.PI) / 3;
            ctx.beginPath();
            ctx.moveTo(sawX + Math.cos(a) * sawR * 0.4, Math.sin(a) * sawR * 0.4);
            ctx.lineTo(sawX + Math.cos(a) * (sawR + 2), Math.sin(a) * (sawR + 2));
            ctx.stroke();
        }
        ctx.shadowBlur = 0;
        ctx.globalAlpha = 1;
    },
    lance: (ctx, radius, effect, tick) => {
        // Pulsing charged tip with energy ring
        const pulse = 0.3 + Math.sin(tick * 0.07) * 0.2;
        ctx.globalCompositeOperation = "lighter";
        ctx.fillStyle = effect.color;
        ctx.shadowColor = effect.color;
        ctx.shadowBlur = 8;
        ctx.globalAlpha = pulse;
        ctx.beginPath();
        ctx.arc(radius + 10, 0, 4, 0, Math.PI * 2);
        ctx.fill();
        // Tiny energy ring
        ctx.strokeStyle = effect.color;
        ctx.lineWidth = 0.8;
        ctx.globalAlpha = pulse * 0.5;
        ctx.beginPath();
        ctx.arc(radius + 10, 0, 7, 0, Math.PI * 2);
        ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = "source-over";
    },
    flamethrower: (ctx, radius, effect, tick) => {
        // Flickering embers at nozzle with tiny smoke
        ctx.globalCompositeOperation = "lighter";
        for (let i = 0; i < 2; i++) {
            const flicker = 0.3 + Math.random() * 0.25;
            const jitter = (Math.random() - 0.5) * 4;
            ctx.fillStyle = i === 0 ? effect.color : effect.secondaryColor;
            ctx.shadowColor = effect.color;
            ctx.shadowBlur = 4;
            ctx.globalAlpha = flicker;
            ctx.beginPath();
            ctx.arc(radius + 5 + jitter, jitter * 0.5, 2.5 + Math.sin(tick * 0.2 + i) * 1, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.shadowBlur = 0;
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = "source-over";
    },
};

/**
 * Render a subtle weapon idle animation when the bot is NOT attacking.
 * Call inside ctx.save/restore while translated+rotated to the bot's position.
 */
export function renderWeaponIdle(
    ctx: CanvasRenderingContext2D,
    bot: BotState,
    radius: number,
    tick: number
) {
    const effect = bot.definition.attackEffect;
    const weaponType = bot.definition.weapon.type;
    const renderer = IDLE_RENDERERS[weaponType];
    if (renderer) {
        renderer(ctx, radius, effect, tick);
    }
}
