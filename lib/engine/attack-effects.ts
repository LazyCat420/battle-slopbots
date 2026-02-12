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

/** Spinner: physical metal blade bar spinning with motion blur + glow */
function renderSpinner(
    ctx: CanvasRenderingContext2D,
    bot: BotState,
    radius: number,
    effect: AttackEffect,
    tick: number
) {
    const ringRadius = radius + 12;
    const spinAngle = (tick * 0.35) % (Math.PI * 2);
    const bladeLen = ringRadius + 4;

    // ── Physical blade body ──────────────────────────────
    ctx.save();
    ctx.rotate(spinAngle);

    // Blade bar (metallic gradient)
    const bladeGrad = ctx.createLinearGradient(0, -5, 0, 5);
    bladeGrad.addColorStop(0, "#E0E0E0");
    bladeGrad.addColorStop(0.3, "#B0B0B0");
    bladeGrad.addColorStop(1, "#606060");
    ctx.fillStyle = bladeGrad;
    ctx.strokeStyle = "#333";
    ctx.lineWidth = 1;

    // Two blades (opposite sides)
    for (let side = 0; side < 2; side++) {
        const dir = side === 0 ? 1 : -1;
        ctx.beginPath();
        ctx.moveTo(dir * 6, -4);
        ctx.lineTo(dir * bladeLen, -5);
        ctx.lineTo(dir * (bladeLen + 3), 0);
        ctx.lineTo(dir * bladeLen, 5);
        ctx.lineTo(dir * 6, 4);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
    }

    // Center hub / axle
    ctx.fillStyle = "#888";
    ctx.strokeStyle = "#444";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(0, 0, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.restore();

    // ── Motion blur trails (afterimages) ─────────────────
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

    // ── Additive glow arcs ───────────────────────────────
    ctx.globalCompositeOperation = "lighter";
    ctx.strokeStyle = effect.color;
    ctx.lineWidth = 2;
    ctx.shadowColor = effect.color;
    ctx.shadowBlur = 10 * effect.intensity;

    for (let i = 0; i < 3; i++) {
        const startAngle = spinAngle + (i * Math.PI * 2) / 3;
        ctx.beginPath();
        ctx.arc(0, 0, ringRadius, startAngle, startAngle + 0.6);
        ctx.stroke();
    }

    ctx.globalCompositeOperation = "source-over";

    // Flying sparks
    ctx.fillStyle = effect.secondaryColor;
    ctx.shadowColor = effect.secondaryColor;
    ctx.shadowBlur = 4;
    for (let i = 0; i < effect.intensity * 2; i++) {
        const a = spinAngle + (i * Math.PI * 2) / (effect.intensity * 2);
        const sx = Math.cos(a) * ringRadius;
        const sy = Math.sin(a) * ringRadius;
        drawParticleShape(ctx, sx, sy, 2 + effect.intensity * 0.3, effect.particleShape, a);
    }

    ctx.shadowBlur = 0;
}

/** Flipper: physical wedge plate with hydraulic arm + shockwave */
function renderFlipper(
    ctx: CanvasRenderingContext2D,
    bot: BotState,
    radius: number,
    effect: AttackEffect,
) {
    const frame = bot.attackAnimationFrame;
    const progress = Math.min(frame / 8, 1);
    const liftAngle = progress * -0.7; // Wedge lifts upward

    // ── Physical wedge plate ─────────────────────────────
    ctx.save();

    // Hydraulic piston (behind wedge)
    const pistonGrad = ctx.createLinearGradient(radius - 8, -2, radius - 8, 2);
    pistonGrad.addColorStop(0, "#C0C0C0");
    pistonGrad.addColorStop(1, "#707070");
    ctx.fillStyle = pistonGrad;
    ctx.strokeStyle = "#444";
    ctx.lineWidth = 1;
    const pistonExtend = progress * 6;
    ctx.fillRect(radius - 10, -2, 12 + pistonExtend, 4);
    ctx.strokeRect(radius - 10, -2, 12 + pistonExtend, 4);

    // Hinge point
    ctx.fillStyle = "#666";
    ctx.beginPath();
    ctx.arc(radius + 2, 0, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#333";
    ctx.stroke();

    // Wedge plate (rotates around hinge)
    ctx.save();
    ctx.translate(radius + 2, 0);
    ctx.rotate(liftAngle);

    const wedgeGrad = ctx.createLinearGradient(0, -10, 0, 10);
    wedgeGrad.addColorStop(0, "#D0D0D0");
    wedgeGrad.addColorStop(0.4, "#A0A0A0");
    wedgeGrad.addColorStop(1, "#606060");
    ctx.fillStyle = wedgeGrad;
    ctx.strokeStyle = "#333";
    ctx.lineWidth = 1;

    ctx.beginPath();
    ctx.moveTo(0, -10);
    ctx.lineTo(18, -6);
    ctx.lineTo(22, 0);
    ctx.lineTo(18, 6);
    ctx.moveTo(0, 10);
    ctx.lineTo(0, -10);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Edge highlight
    ctx.strokeStyle = "rgba(255,255,255,0.3)";
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(1, -9);
    ctx.lineTo(17, -5);
    ctx.stroke();

    ctx.restore();
    ctx.restore();

    // ── Afterimage sweep trails ──────────────────────────
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

    // ── Additive glow arc ────────────────────────────────
    ctx.globalCompositeOperation = "lighter";
    ctx.strokeStyle = effect.color;
    ctx.lineWidth = 3;
    ctx.shadowColor = effect.color;
    ctx.shadowBlur = 10 * effect.intensity;

    const sweepAngle = progress * Math.PI;
    ctx.beginPath();
    ctx.arc(radius * 0.5, 0, radius * 0.8, -sweepAngle / 2, sweepAngle / 2);
    ctx.stroke();

    // Shockwave ring
    if (progress > 0.3) {
        const shockRadius = radius + (progress - 0.3) * 40 * effect.intensity;
        const shockAlpha = (1 - progress) * 0.5;

        ctx.strokeStyle = effect.secondaryColor;
        ctx.globalAlpha = shockAlpha;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(radius * 0.7, 0, shockRadius, -0.5, 0.5);
        ctx.stroke();

        // Launch particles
        ctx.fillStyle = effect.color;
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

/** Hammer: heavy physical hammer with overhead slam + shockwave */
function renderHammer(
    ctx: CanvasRenderingContext2D,
    bot: BotState,
    radius: number,
    effect: AttackEffect,
) {
    const frame = bot.attackAnimationFrame;
    const progress = Math.min(frame / 10, 1);

    // Hammer offset: windup → slam
    const hammerOffset = progress < 0.5
        ? radius + 5 + (progress * 2) * 15
        : radius + 5 + (1 - (progress - 0.5) * 2) * 15;

    // ── Physical hammer body ─────────────────────────────

    // Shaft (metallic cylinder)
    const shaftGrad = ctx.createLinearGradient(radius, -2, radius, 2);
    shaftGrad.addColorStop(0, "#B0A080");
    shaftGrad.addColorStop(0.5, "#8B7355");
    shaftGrad.addColorStop(1, "#6B5335");
    ctx.fillStyle = shaftGrad;
    ctx.strokeStyle = "#444";
    ctx.lineWidth = 0.8;
    ctx.fillRect(radius, -3, hammerOffset - radius - 3, 6);
    ctx.strokeRect(radius, -3, hammerOffset - radius - 3, 6);

    // Hammer head (heavy block with gradient)
    const headGrad = ctx.createLinearGradient(hammerOffset - 6, -13, hammerOffset - 6, 13);
    headGrad.addColorStop(0, "#C8C8C8");
    headGrad.addColorStop(0.3, "#A0A0A0");
    headGrad.addColorStop(0.7, "#707070");
    headGrad.addColorStop(1, "#505050");
    ctx.fillStyle = headGrad;
    ctx.strokeStyle = "#333";
    ctx.lineWidth = 1;

    // Main head block
    ctx.beginPath();
    ctx.rect(hammerOffset - 6, -13, 16, 26);
    ctx.fill();
    ctx.stroke();

    // Face plate (striking surface, slightly lighter)
    ctx.fillStyle = "#B8B8B8";
    ctx.fillRect(hammerOffset + 8, -11, 3, 22);

    // Bevel highlight on top edge
    ctx.strokeStyle = "rgba(255,255,255,0.3)";
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(hammerOffset - 5, -12);
    ctx.lineTo(hammerOffset + 9, -12);
    ctx.stroke();

    // Shaft collar (where shaft meets head)
    ctx.fillStyle = "#666";
    ctx.fillRect(hammerOffset - 7, -5, 3, 10);

    // ── Cinematic impact effects ─────────────────────────
    if (progress > 0.5) {
        const impactProgress = (progress - 0.5) * 2;
        const impactRadius = 12 + impactProgress * 28 * effect.intensity;

        ctx.globalCompositeOperation = "lighter";

        // Screen flash
        ctx.fillStyle = effect.color;
        ctx.globalAlpha = (1 - impactProgress) * 0.15;
        ctx.beginPath();
        ctx.arc(hammerOffset + 6, 0, impactRadius * 1.8, 0, Math.PI * 2);
        ctx.fill();

        // Shockwave ring
        ctx.strokeStyle = effect.color;
        ctx.globalAlpha = (1 - impactProgress) * 0.7;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(hammerOffset + 6, 0, impactRadius, 0, Math.PI * 2);
        ctx.stroke();

        ctx.globalCompositeOperation = "source-over";

        // Ground crack lines
        ctx.strokeStyle = effect.secondaryColor;
        ctx.globalAlpha = (1 - impactProgress) * 0.6;
        ctx.lineWidth = 1.5;
        const crackCount = 5 + effect.intensity;
        for (let i = 0; i < crackCount; i++) {
            const a = (i / crackCount) * Math.PI * 2;
            const crackLen = impactRadius * (0.4 + Math.random() * 0.5);
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
        const sparkCount = effect.intensity * 3;
        for (let i = 0; i < sparkCount; i++) {
            const a = (i / sparkCount) * Math.PI * 2;
            const dist = impactRadius * (0.4 + Math.random() * 0.5);
            drawParticleShape(
                ctx,
                hammerOffset + 6 + Math.cos(a) * dist,
                Math.sin(a) * dist,
                2 + effect.intensity * 0.4,
                effect.particleShape,
                a
            );
        }
        ctx.globalAlpha = 1;
    }

    ctx.shadowBlur = 0;
}

/** Saw: physical serrated disc with triangular teeth + sparks */
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

    // ── Mounting arm ─────────────────────────────────────
    const armGrad = ctx.createLinearGradient(radius, -2, radius, 2);
    armGrad.addColorStop(0, "#A0A0A0");
    armGrad.addColorStop(1, "#606060");
    ctx.fillStyle = armGrad;
    ctx.strokeStyle = "#444";
    ctx.lineWidth = 0.8;
    ctx.fillRect(radius, -3, sawX - radius - sawRadius * 0.5, 6);
    ctx.strokeRect(radius, -3, sawX - radius - sawRadius * 0.5, 6);

    // ── Physical saw disc ────────────────────────────────
    ctx.save();
    ctx.translate(sawX, 0);
    ctx.rotate(spinAngle);

    // Disc body (metallic gradient)
    const discGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, sawRadius);
    discGrad.addColorStop(0, "#D0D0D0");
    discGrad.addColorStop(0.6, "#A0A0A0");
    discGrad.addColorStop(1, "#707070");
    ctx.fillStyle = discGrad;
    ctx.strokeStyle = "#444";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(0, 0, sawRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Triangular teeth around the rim
    const teeth = 10;
    const toothInner = sawRadius - 2;
    const toothOuter = sawRadius + 4;
    ctx.fillStyle = "#909090";
    ctx.strokeStyle = "#555";
    ctx.lineWidth = 0.5;
    for (let i = 0; i < teeth; i++) {
        const a = (i * Math.PI * 2) / teeth;
        const halfTooth = Math.PI / teeth * 0.5;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a - halfTooth) * toothInner, Math.sin(a - halfTooth) * toothInner);
        ctx.lineTo(Math.cos(a) * toothOuter, Math.sin(a) * toothOuter);
        ctx.lineTo(Math.cos(a + halfTooth) * toothInner, Math.sin(a + halfTooth) * toothInner);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
    }

    // Inner hub (dark center)
    ctx.fillStyle = "#555";
    ctx.strokeStyle = "#333";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(0, 0, sawRadius * 0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Axle dot
    ctx.fillStyle = "#888";
    ctx.beginPath();
    ctx.arc(0, 0, 2, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();

    // ── Blade glow aura ──────────────────────────────────
    ctx.globalCompositeOperation = "lighter";
    const bladeGlow = ctx.createRadialGradient(sawX, 0, 0, sawX, 0, sawRadius + 6);
    bladeGlow.addColorStop(0, effect.color);
    bladeGlow.addColorStop(1, "transparent");
    ctx.fillStyle = bladeGlow;
    ctx.globalAlpha = 0.2 + 0.08 * Math.sin(tick * 0.15);
    ctx.beginPath();
    ctx.arc(sawX, 0, sawRadius + 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";

    // ── Directional metal sparks ─────────────────────────
    ctx.fillStyle = effect.secondaryColor;
    ctx.shadowColor = effect.secondaryColor;
    ctx.shadowBlur = 3;
    for (let i = 0; i < effect.intensity * 3; i++) {
        const sparkAngle = spinAngle + (i * 1.1);
        const sparkDist = sawRadius + 4 + (i * 3) % 10;
        const tangentOffset = (i * 2.5) % 8;
        const sx = sawX + Math.cos(sparkAngle) * sparkDist + Math.cos(sparkAngle + Math.PI / 2) * tangentOffset;
        const sy = Math.sin(sparkAngle) * sparkDist + Math.sin(sparkAngle + Math.PI / 2) * tangentOffset;
        ctx.globalAlpha = 0.7 - (tangentOffset / 8) * 0.5;
        drawParticleShape(ctx, sx, sy, 1.5 + Math.random() * 1.5, effect.particleShape, sparkAngle);
    }
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
}

/** Lance: physical tapered spear with guard ring + speed lines */
function renderLance(
    ctx: CanvasRenderingContext2D,
    bot: BotState,
    radius: number,
    effect: AttackEffect,
) {
    const frame = bot.attackAnimationFrame;
    const progress = Math.min(frame / 8, 1);
    const thrustDist = radius + progress * (bot.definition.weapon.range * 0.7);

    // ── Physical lance body ──────────────────────────────

    // Shaft (tapered metallic gradient)
    const shaftGrad = ctx.createLinearGradient(radius, -4, radius, 4);
    shaftGrad.addColorStop(0, "#C8C8C8");
    shaftGrad.addColorStop(0.3, "#909090");
    shaftGrad.addColorStop(1, "#606060");
    ctx.fillStyle = shaftGrad;
    ctx.strokeStyle = "#444";
    ctx.lineWidth = 0.8;

    // Tapered shaft shape
    ctx.beginPath();
    ctx.moveTo(radius, -4);
    ctx.lineTo(thrustDist - 8, -3);
    ctx.lineTo(thrustDist - 8, 3);
    ctx.lineTo(radius, 4);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Guard ring (at base of lance)
    ctx.fillStyle = "#777";
    ctx.strokeStyle = "#444";
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.ellipse(radius + 3, 0, 2, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Pointed tip (metallic triangular head)
    const tipGrad = ctx.createLinearGradient(thrustDist - 8, -6, thrustDist + 12, 0);
    tipGrad.addColorStop(0, "#B0B0B0");
    tipGrad.addColorStop(0.5, "#D8D8D8");
    tipGrad.addColorStop(1, "#F0F0F0");
    ctx.fillStyle = tipGrad;
    ctx.strokeStyle = "#555";
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(thrustDist + 12, 0);
    ctx.lineTo(thrustDist - 8, -6);
    ctx.lineTo(thrustDist - 6, 0);
    ctx.lineTo(thrustDist - 8, 6);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Highlight edge on tip
    ctx.strokeStyle = "rgba(255,255,255,0.4)";
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(thrustDist - 7, -5);
    ctx.lineTo(thrustDist + 11, 0);
    ctx.stroke();

    // ── Additive speed lines ─────────────────────────────
    ctx.globalCompositeOperation = "lighter";
    ctx.strokeStyle = effect.secondaryColor;
    ctx.lineWidth = 1;
    for (let i = 0; i < effect.trailLength + 2; i++) {
        const spread = (i + 1) * 4;
        const trailAlpha = 0.3 / (i + 1);
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
        ctx.globalAlpha = flashAlpha * 0.4;
        ctx.beginPath();
        ctx.arc(thrustDist + 10, 0, 6 * effect.intensity, 0, Math.PI * 2);
        ctx.fill();
    }

    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
    ctx.shadowBlur = 0;
}

/** Flamethrower: physical nozzle barrel + fire cone with particles */
function renderFlamethrower(
    ctx: CanvasRenderingContext2D,
    _bot: BotState,
    radius: number,
    effect: AttackEffect,
    tick: number
) {
    const nozzleLen = 18;
    const nozzleTip = radius + nozzleLen;
    const weaponRange = 55 + effect.trailLength * 12;
    const coneHalfAngle = 0.35 + effect.intensity * 0.07;

    // ── Physical nozzle barrel ────────────────────────────

    // Fuel tank (small cylinder behind nozzle)
    const tankGrad = ctx.createLinearGradient(radius - 6, -5, radius - 6, 5);
    tankGrad.addColorStop(0, "#A08050");
    tankGrad.addColorStop(0.5, "#806030");
    tankGrad.addColorStop(1, "#604020");
    ctx.fillStyle = tankGrad;
    ctx.strokeStyle = "#444";
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.ellipse(radius - 2, 0, 5, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Nozzle barrel (tapered metallic tube)
    const nozzleGrad = ctx.createLinearGradient(radius, -4, radius, 4);
    nozzleGrad.addColorStop(0, "#B0B0B0");
    nozzleGrad.addColorStop(0.3, "#808080");
    nozzleGrad.addColorStop(1, "#505050");
    ctx.fillStyle = nozzleGrad;
    ctx.strokeStyle = "#333";
    ctx.lineWidth = 0.8;

    ctx.beginPath();
    ctx.moveTo(radius, -4);
    ctx.lineTo(nozzleTip, -3);
    ctx.lineTo(nozzleTip, 3);
    ctx.lineTo(radius, 4);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Nozzle tip opening (dark circle for the barrel)
    ctx.fillStyle = "#222";
    ctx.beginPath();
    ctx.ellipse(nozzleTip, 0, 1.5, 3, 0, 0, Math.PI * 2);
    ctx.fill();

    // Barrel highlight
    ctx.strokeStyle = "rgba(255,255,255,0.2)";
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(radius + 2, -3.5);
    ctx.lineTo(nozzleTip - 1, -2.5);
    ctx.stroke();

    // ── Fire effects (originate from nozzle tip) ─────────
    const wobble = Math.sin(tick * 0.4) * 0.03 * effect.intensity;
    ctx.save();
    ctx.translate(nozzleTip, 0);
    ctx.rotate(wobble);

    // Heat bloom glow
    ctx.globalCompositeOperation = "lighter";
    const heatGlow = ctx.createRadialGradient(weaponRange * 0.35, 0, 0, weaponRange * 0.35, 0, weaponRange * 0.5);
    heatGlow.addColorStop(0, effect.color);
    heatGlow.addColorStop(1, "transparent");
    ctx.fillStyle = heatGlow;
    ctx.globalAlpha = 0.12 + effect.intensity * 0.03;
    ctx.beginPath();
    ctx.arc(weaponRange * 0.35, 0, weaponRange * 0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";

    // Outer fire cone
    const coneGrad = ctx.createLinearGradient(0, 0, weaponRange, 0);
    coneGrad.addColorStop(0, effect.secondaryColor);
    coneGrad.addColorStop(0.3, effect.color);
    coneGrad.addColorStop(0.7, effect.color);
    coneGrad.addColorStop(1, "rgba(100,50,0,0.1)");
    ctx.fillStyle = coneGrad;
    ctx.globalAlpha = 0.3 + effect.intensity * 0.05;
    ctx.shadowColor = effect.color;
    ctx.shadowBlur = 15;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(
        weaponRange * Math.cos(-coneHalfAngle),
        weaponRange * Math.sin(-coneHalfAngle)
    );
    ctx.lineTo(
        weaponRange * Math.cos(coneHalfAngle),
        weaponRange * Math.sin(coneHalfAngle)
    );
    ctx.closePath();
    ctx.fill();

    // Inner hot core
    const innerAngle = coneHalfAngle * 0.35;
    const coreGrad = ctx.createLinearGradient(0, 0, weaponRange * 0.4, 0);
    coreGrad.addColorStop(0, "#FFFFFF");
    coreGrad.addColorStop(0.5, effect.secondaryColor);
    coreGrad.addColorStop(1, "transparent");
    ctx.fillStyle = coreGrad;
    ctx.globalAlpha = 0.18;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(
        weaponRange * 0.4 * Math.cos(-innerAngle),
        weaponRange * 0.4 * Math.sin(-innerAngle)
    );
    ctx.lineTo(
        weaponRange * 0.4 * Math.cos(innerAngle),
        weaponRange * 0.4 * Math.sin(innerAngle)
    );
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;

    // Fire particles
    ctx.globalCompositeOperation = "lighter";
    const particleCount = effect.intensity * 6;
    for (let i = 0; i < particleCount; i++) {
        const t = (i + tick * 0.25) % particleCount;
        const dist = (t / particleCount) * weaponRange;
        const spread = (t / particleCount) * coneHalfAngle;
        const angle = (Math.random() - 0.5) * spread * 2;
        const px = dist * Math.cos(angle);
        const py = dist * Math.sin(angle);
        const alpha = 1 - t / particleCount;
        const size = 2 + (t / particleCount) * 5 * (effect.intensity / 3);

        const colorIdx = i % 5;
        ctx.fillStyle = colorIdx === 0 ? effect.secondaryColor
            : colorIdx === 3 ? "#FFFFFF"
                : colorIdx === 4 ? "#FF8800"
                    : effect.color;
        ctx.globalAlpha = alpha * (colorIdx === 3 ? 0.25 : 0.6);
        drawParticleShape(ctx, px, py, size, effect.particleShape, tick * 0.15 + i);
    }
    ctx.globalCompositeOperation = "source-over";

    // Smoke at flame tips
    ctx.fillStyle = "#444444";
    for (let i = 0; i < 3; i++) {
        const smokeT = (tick * 0.1 + i * 1.5) % 3;
        const smokeDist = weaponRange * (0.8 + smokeT * 0.12);
        const smokeAngle = (Math.random() - 0.5) * coneHalfAngle * 1.5;
        const smokeX = smokeDist * Math.cos(smokeAngle);
        const smokeY = smokeDist * Math.sin(smokeAngle);
        ctx.globalAlpha = 0.12 - smokeT * 0.03;
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
    spinner: (ctx, radius, _effect, tick) => {
        // Slowly rotating physical blade
        const ringRadius = radius + 12;
        const bladeLen = ringRadius + 4;
        const spinAngle = tick * 0.03;

        ctx.save();
        ctx.rotate(spinAngle);

        const bladeGrad = ctx.createLinearGradient(0, -5, 0, 5);
        bladeGrad.addColorStop(0, "#D0D0D0");
        bladeGrad.addColorStop(0.3, "#A0A0A0");
        bladeGrad.addColorStop(1, "#606060");
        ctx.fillStyle = bladeGrad;
        ctx.strokeStyle = "#444";
        ctx.lineWidth = 0.8;
        ctx.globalAlpha = 0.6;

        for (let side = 0; side < 2; side++) {
            const dir = side === 0 ? 1 : -1;
            ctx.beginPath();
            ctx.moveTo(dir * 6, -3);
            ctx.lineTo(dir * bladeLen, -4);
            ctx.lineTo(dir * (bladeLen + 2), 0);
            ctx.lineTo(dir * bladeLen, 4);
            ctx.lineTo(dir * 6, 3);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
        }

        // Hub
        ctx.fillStyle = "#777";
        ctx.beginPath();
        ctx.arc(0, 0, 4, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
        ctx.globalAlpha = 1;
    },
    flipper: (ctx, radius, _effect, _tick) => {
        // Wedge plate at rest
        ctx.globalAlpha = 0.6;

        // Piston
        const pistonGrad = ctx.createLinearGradient(radius - 8, -2, radius - 8, 2);
        pistonGrad.addColorStop(0, "#B0B0B0");
        pistonGrad.addColorStop(1, "#707070");
        ctx.fillStyle = pistonGrad;
        ctx.fillRect(radius - 8, -2, 10, 4);

        // Hinge
        ctx.fillStyle = "#666";
        ctx.beginPath();
        ctx.arc(radius + 2, 0, 2.5, 0, Math.PI * 2);
        ctx.fill();

        // Wedge plate
        const wedgeGrad = ctx.createLinearGradient(0, -8, 0, 8);
        wedgeGrad.addColorStop(0, "#C0C0C0");
        wedgeGrad.addColorStop(1, "#606060");
        ctx.fillStyle = wedgeGrad;
        ctx.strokeStyle = "#444";
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.moveTo(radius + 2, -8);
        ctx.lineTo(radius + 18, -5);
        ctx.lineTo(radius + 20, 0);
        ctx.lineTo(radius + 18, 5);
        ctx.lineTo(radius + 2, 8);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        ctx.globalAlpha = 1;
    },
    hammer: (ctx, radius, _effect, tick) => {
        // Resting hammer with gentle bob
        const bob = Math.sin(tick * 0.04) * 1.5;
        ctx.globalAlpha = 0.6;

        // Shaft
        const shaftGrad = ctx.createLinearGradient(radius, -1.5, radius, 1.5);
        shaftGrad.addColorStop(0, "#B0A080");
        shaftGrad.addColorStop(1, "#6B5335");
        ctx.fillStyle = shaftGrad;
        ctx.fillRect(radius, -2, 12, 4);

        // Head
        const headGrad = ctx.createLinearGradient(radius + 11, -10, radius + 11, 10);
        headGrad.addColorStop(0, "#C0C0C0");
        headGrad.addColorStop(0.5, "#888");
        headGrad.addColorStop(1, "#555");
        ctx.fillStyle = headGrad;
        ctx.strokeStyle = "#444";
        ctx.lineWidth = 0.8;
        ctx.fillRect(radius + 11, -10 + bob, 12, 20);
        ctx.strokeRect(radius + 11, -10 + bob, 12, 20);

        ctx.globalAlpha = 1;
    },
    saw: (ctx, radius, _effect, tick) => {
        // Slowly spinning serrated disc
        const sawX = radius + 12;
        const sawR = 8;
        const spinAngle = tick * 0.08;

        // Mounting arm
        ctx.globalAlpha = 0.6;
        ctx.fillStyle = "#888";
        ctx.fillRect(radius, -2, sawX - radius - sawR * 0.4, 4);

        ctx.save();
        ctx.translate(sawX, 0);
        ctx.rotate(spinAngle);

        // Disc
        const discGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, sawR);
        discGrad.addColorStop(0, "#C0C0C0");
        discGrad.addColorStop(1, "#707070");
        ctx.fillStyle = discGrad;
        ctx.strokeStyle = "#555";
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.arc(0, 0, sawR, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // Teeth
        const teeth = 8;
        ctx.fillStyle = "#888";
        for (let i = 0; i < teeth; i++) {
            const a = (i * Math.PI * 2) / teeth;
            const ht = Math.PI / teeth * 0.4;
            ctx.beginPath();
            ctx.moveTo(Math.cos(a - ht) * (sawR - 1), Math.sin(a - ht) * (sawR - 1));
            ctx.lineTo(Math.cos(a) * (sawR + 3), Math.sin(a) * (sawR + 3));
            ctx.lineTo(Math.cos(a + ht) * (sawR - 1), Math.sin(a + ht) * (sawR - 1));
            ctx.closePath();
            ctx.fill();
        }

        // Hub
        ctx.fillStyle = "#555";
        ctx.beginPath();
        ctx.arc(0, 0, sawR * 0.25, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
        ctx.globalAlpha = 1;
    },
    lance: (ctx, radius, _effect, _tick) => {
        // Resting lance
        ctx.globalAlpha = 0.6;

        // Shaft
        const shaftGrad = ctx.createLinearGradient(radius, -3, radius, 3);
        shaftGrad.addColorStop(0, "#B0B0B0");
        shaftGrad.addColorStop(1, "#606060");
        ctx.fillStyle = shaftGrad;
        ctx.beginPath();
        ctx.moveTo(radius, -3);
        ctx.lineTo(radius + 18, -2);
        ctx.lineTo(radius + 18, 2);
        ctx.lineTo(radius, 3);
        ctx.closePath();
        ctx.fill();

        // Guard
        ctx.fillStyle = "#777";
        ctx.beginPath();
        ctx.ellipse(radius + 2, 0, 1.5, 4.5, 0, 0, Math.PI * 2);
        ctx.fill();

        // Tip
        const tipGrad = ctx.createLinearGradient(radius + 18, -4, radius + 28, 0);
        tipGrad.addColorStop(0, "#B0B0B0");
        tipGrad.addColorStop(1, "#E0E0E0");
        ctx.fillStyle = tipGrad;
        ctx.beginPath();
        ctx.moveTo(radius + 28, 0);
        ctx.lineTo(radius + 18, -4);
        ctx.lineTo(radius + 18, 4);
        ctx.closePath();
        ctx.fill();

        ctx.globalAlpha = 1;
    },
    flamethrower: (ctx, radius, effect, tick) => {
        // Nozzle barrel at rest + pilot light
        ctx.globalAlpha = 0.6;

        // Fuel tank
        ctx.fillStyle = "#704020";
        ctx.beginPath();
        ctx.ellipse(radius - 1, 0, 4, 5, 0, 0, Math.PI * 2);
        ctx.fill();

        // Barrel
        const nozzleGrad = ctx.createLinearGradient(radius, -3, radius, 3);
        nozzleGrad.addColorStop(0, "#A0A0A0");
        nozzleGrad.addColorStop(1, "#505050");
        ctx.fillStyle = nozzleGrad;
        ctx.strokeStyle = "#444";
        ctx.lineWidth = 0.6;
        ctx.beginPath();
        ctx.moveTo(radius, -3);
        ctx.lineTo(radius + 14, -2.5);
        ctx.lineTo(radius + 14, 2.5);
        ctx.lineTo(radius, 3);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        ctx.globalAlpha = 1;

        // Pilot light (tiny flicker)
        ctx.globalCompositeOperation = "lighter";
        const flicker = 0.25 + Math.random() * 0.15;
        ctx.fillStyle = effect.color;
        ctx.shadowColor = effect.color;
        ctx.shadowBlur = 3;
        ctx.globalAlpha = flicker;
        ctx.beginPath();
        ctx.arc(radius + 15, 0, 2 + Math.sin(tick * 0.2) * 0.5, 0, Math.PI * 2);
        ctx.fill();
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
