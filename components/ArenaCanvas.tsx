"use client";

/**
 * Arena Canvas — 2D top-down battle arena renderer.
 *
 * Renders bot shapes, weapon attack effects (via attack-effects.ts),
 * health bars, damage particles, and arena borders on an HTML5 canvas.
 */
import { useRef, useEffect, useCallback } from "react";
import { GameState, BotState, DamageEvent } from "@/lib/types/bot";
import { ARENA_WIDTH, ARENA_HEIGHT } from "@/lib/engine/game-engine";
import { renderAttackEffect, renderWeaponIdle, spawnAttackParticles, drawParticleShape, EffectParticle } from "@/lib/engine/attack-effects";

interface ArenaCanvasProps {
    gameState: GameState | null;
    countdown?: number;
}

const SIZE_TO_RADIUS: Record<number, number> = {
    1: 15,
    2: 20,
    3: 25,
    4: 30,
    5: 35,
};

// ── Compiled drawCode cache ──────────────────────────────
// Maps drawCode string → compiled Function (or null if compilation failed).
// Avoids re-compiling every frame.
const drawCodeCache = new Map<string, ((ctx: CanvasRenderingContext2D, size: number, color: string, tick: number) => void) | null>();

function getCompiledDrawCode(code: string): ((ctx: CanvasRenderingContext2D, size: number, color: string, tick: number) => void) | null {
    if (drawCodeCache.has(code)) return drawCodeCache.get(code)!;
    try {
        const fn = new Function("ctx", "size", "color", "tick", code) as (ctx: CanvasRenderingContext2D, size: number, color: string, tick: number) => void;
        drawCodeCache.set(code, fn);
        return fn;
    } catch {
        console.warn("[ArenaCanvas] drawCode compilation failed, using fallback");
        drawCodeCache.set(code, null);
        return null;
    }
}

// ── Color utility — lighten/darken a hex color ───────────
function shadeColor(hex: string, percent: number): string {
    const num = parseInt(hex.replace("#", ""), 16);
    const r = Math.min(255, Math.max(0, ((num >> 16) & 0xff) + Math.round(255 * percent)));
    const g = Math.min(255, Math.max(0, ((num >> 8) & 0xff) + Math.round(255 * percent)));
    const b = Math.min(255, Math.max(0, (num & 0xff) + Math.round(255 * percent)));
    return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

export default function ArenaCanvas({ gameState, countdown }: ArenaCanvasProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const particlesRef = useRef<EffectParticle[]>([]);
    const animFrameRef = useRef<number>(0);
    const tickRef = useRef<number>(0);

    // Spawn particles from damage events using attacker's effect colors
    const spawnDamageParticles = useCallback((events: DamageEvent[], bots: [BotState, BotState]) => {
        for (const event of events) {
            const attacker = bots.find((b) => b.id === event.attackerId);
            if (attacker) {
                const newParticles = spawnAttackParticles(
                    attacker,
                    event.position.x,
                    event.position.y,
                    event.damage
                );
                particlesRef.current.push(...newParticles);
            }
        }
    }, []);

    // Draw a bot shape
    const drawBot = useCallback(
        (ctx: CanvasRenderingContext2D, bot: BotState, playerIndex: number, tick: number) => {
            const { position, angle, definition, isAttacking } = bot;
            const radius = SIZE_TO_RADIUS[Math.round(definition.size)] || 25;

            // ── Hover shadow (drawn before bot for depth) ────
            ctx.save();
            ctx.translate(position.x, position.y + radius * 0.6);
            ctx.scale(1, 0.3);
            const shadowGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, radius * 1.2);
            shadowGrad.addColorStop(0, 'rgba(0,0,0,0.25)');
            shadowGrad.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = shadowGrad;
            ctx.beginPath();
            ctx.arc(0, 0, radius * 1.2, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();

            ctx.save();
            ctx.translate(position.x, position.y);

            // ── Breathing pulse (subtle scale oscillation) ───
            const breathe = 1 + Math.sin(tick * 0.04 + playerIndex * Math.PI) * 0.025;
            ctx.scale(breathe, breathe);

            ctx.rotate(angle);

            // Glow effect when attacking — uses attackEffect colors
            if (isAttacking) {
                ctx.shadowColor = definition.attackEffect.color;
                ctx.shadowBlur = 15 + definition.attackEffect.intensity * 3;
            }

            // ── Try LLM drawCode first ───────────────────────
            let drawCodeRendered = false;
            if (definition.drawCode) {
                const fn = getCompiledDrawCode(definition.drawCode);
                if (fn) {
                    try {
                        ctx.save();
                        fn(ctx, radius, definition.color, tick);
                        ctx.restore();
                        drawCodeRendered = true;
                        // Log once on first successful render
                        if (tick === 1) console.log(`[ArenaCanvas] ✅ drawCode rendering for "${definition.name}"`);
                    } catch (e) {
                        // Runtime error — fall through to built-in renderer
                        ctx.restore();
                        if (tick === 1) console.warn(`[ArenaCanvas] ❌ drawCode runtime error for "${definition.name}":`, e);
                    }
                } else if (tick === 1) {
                    console.warn(`[ArenaCanvas] ❌ drawCode compilation failed for "${definition.name}", using fallback`);
                }
            } else if (tick === 1) {
                console.log(`[ArenaCanvas] ⚠️ No drawCode for "${definition.name}", using built-in renderer`);
            }

            // ── Premium fallback shape renderer ──────────────
            if (!drawCodeRendered) {
                const color = definition.color;
                const lighter = shadeColor(color, 0.25);
                const darker = shadeColor(color, -0.25);

                // Radial gradient fill
                const grad = ctx.createRadialGradient(0, -radius * 0.2, radius * 0.15, 0, 0, radius);
                grad.addColorStop(0, lighter);
                grad.addColorStop(0.6, color);
                grad.addColorStop(1, darker);
                ctx.fillStyle = grad;

                // Metallic rim
                ctx.strokeStyle = shadeColor(color, 0.4);
                ctx.lineWidth = 2.5;

                // Draw shape path
                ctx.beginPath();
                switch (definition.shape) {
                    case "circle":
                        ctx.arc(0, 0, radius, 0, Math.PI * 2);
                        break;
                    case "rectangle":
                        ctx.rect(-radius, -radius * 0.8, radius * 2, radius * 1.6);
                        break;
                    case "triangle":
                        for (let i = 0; i < 3; i++) {
                            const a = (i * 2 * Math.PI) / 3 - Math.PI / 2;
                            if (i === 0) ctx.moveTo(Math.cos(a) * radius, Math.sin(a) * radius);
                            else ctx.lineTo(Math.cos(a) * radius, Math.sin(a) * radius);
                        }
                        ctx.closePath();
                        break;
                    case "pentagon":
                        for (let i = 0; i < 5; i++) {
                            const a = (i * 2 * Math.PI) / 5 - Math.PI / 2;
                            if (i === 0) ctx.moveTo(Math.cos(a) * radius, Math.sin(a) * radius);
                            else ctx.lineTo(Math.cos(a) * radius, Math.sin(a) * radius);
                        }
                        ctx.closePath();
                        break;
                    case "hexagon":
                        for (let i = 0; i < 6; i++) {
                            const a = (i * 2 * Math.PI) / 6;
                            if (i === 0) ctx.moveTo(Math.cos(a) * radius, Math.sin(a) * radius);
                            else ctx.lineTo(Math.cos(a) * radius, Math.sin(a) * radius);
                        }
                        ctx.closePath();
                        break;
                }
                ctx.fill();
                ctx.stroke();

                // Inner panel details (shape-specific structural lines)
                ctx.strokeStyle = `rgba(255,255,255,0.12)`;
                ctx.lineWidth = 1;
                switch (definition.shape) {
                    case "circle": {
                        // Concentric inner ring + cross hatch
                        ctx.beginPath();
                        ctx.arc(0, 0, radius * 0.55, 0, Math.PI * 2);
                        ctx.stroke();
                        ctx.beginPath();
                        ctx.moveTo(-radius * 0.4, 0);
                        ctx.lineTo(radius * 0.4, 0);
                        ctx.moveTo(0, -radius * 0.4);
                        ctx.lineTo(0, radius * 0.4);
                        ctx.stroke();
                        break;
                    }
                    case "rectangle": {
                        // Armor plate seams
                        ctx.beginPath();
                        ctx.moveTo(-radius * 0.3, -radius * 0.8);
                        ctx.lineTo(-radius * 0.3, radius * 0.8);
                        ctx.moveTo(radius * 0.3, -radius * 0.8);
                        ctx.lineTo(radius * 0.3, radius * 0.8);
                        ctx.moveTo(-radius, 0);
                        ctx.lineTo(radius, 0);
                        ctx.stroke();
                        // Bolt dots
                        ctx.fillStyle = "rgba(255,255,255,0.2)";
                        for (const bx of [-radius * 0.7, radius * 0.7]) {
                            for (const by of [-radius * 0.5, radius * 0.5]) {
                                ctx.beginPath();
                                ctx.arc(bx, by, 2, 0, Math.PI * 2);
                                ctx.fill();
                            }
                        }
                        break;
                    }
                    case "triangle": {
                        // Inner chevron
                        ctx.beginPath();
                        ctx.moveTo(0, -radius * 0.35);
                        ctx.lineTo(-radius * 0.3, radius * 0.2);
                        ctx.lineTo(radius * 0.3, radius * 0.2);
                        ctx.closePath();
                        ctx.stroke();
                        break;
                    }
                    case "pentagon": {
                        // Star pattern inside
                        ctx.beginPath();
                        for (let i = 0; i < 5; i++) {
                            const a1 = (i * 2 * Math.PI) / 5 - Math.PI / 2;
                            const a2 = (((i + 2) % 5) * 2 * Math.PI) / 5 - Math.PI / 2;
                            ctx.moveTo(Math.cos(a1) * radius * 0.5, Math.sin(a1) * radius * 0.5);
                            ctx.lineTo(Math.cos(a2) * radius * 0.5, Math.sin(a2) * radius * 0.5);
                        }
                        ctx.stroke();
                        break;
                    }
                    case "hexagon": {
                        // Inner hexagon + center dot
                        ctx.beginPath();
                        for (let i = 0; i < 6; i++) {
                            const a = (i * 2 * Math.PI) / 6;
                            if (i === 0) ctx.moveTo(Math.cos(a) * radius * 0.5, Math.sin(a) * radius * 0.5);
                            else ctx.lineTo(Math.cos(a) * radius * 0.5, Math.sin(a) * radius * 0.5);
                        }
                        ctx.closePath();
                        ctx.stroke();
                        ctx.fillStyle = lighter;
                        ctx.globalAlpha = 0.3;
                        ctx.beginPath();
                        ctx.arc(0, 0, radius * 0.12, 0, Math.PI * 2);
                        ctx.fill();
                        ctx.globalAlpha = 1;
                        break;
                    }
                }

                // Weapon mount indicator at front
                ctx.fillStyle = shadeColor(color, 0.5);
                ctx.beginPath();
                ctx.arc(radius * 0.75, 0, radius * 0.12, 0, Math.PI * 2);
                ctx.fill();
            }

            ctx.shadowBlur = 0;

            // ── Energy aura (HP-based glow ring) ─────────────
            const hpFraction = bot.health / 100;
            const auraAlpha = 0.12 + hpFraction * 0.15;
            const auraPulse = 1 + Math.sin(tick * 0.06) * 0.08;
            ctx.globalCompositeOperation = 'lighter';
            const auraGrad = ctx.createRadialGradient(0, 0, radius * 0.8, 0, 0, radius * 1.4 * auraPulse);
            auraGrad.addColorStop(0, 'transparent');
            auraGrad.addColorStop(0.6, definition.color);
            auraGrad.addColorStop(1, 'transparent');
            ctx.fillStyle = auraGrad;
            ctx.globalAlpha = auraAlpha;
            ctx.beginPath();
            ctx.arc(0, 0, radius * 1.4 * auraPulse, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = 1;
            ctx.globalCompositeOperation = 'source-over';

            // Direction indicator (front arrow)
            ctx.fillStyle = "rgba(255,255,255,0.8)";
            ctx.beginPath();
            ctx.moveTo(radius + 5, 0);
            ctx.lineTo(radius - 3, -5);
            ctx.lineTo(radius - 3, 5);
            ctx.closePath();
            ctx.fill();

            // Weapon attack effect or idle animation
            if (isAttacking) {
                renderAttackEffect(ctx, bot, radius, tick);
            } else {
                renderWeaponIdle(ctx, bot, radius, tick);
            }

            ctx.restore();

            // Player label above bot
            ctx.fillStyle = "#fff";
            ctx.font = "bold 11px Inter, system-ui, sans-serif";
            ctx.textAlign = "center";
            ctx.fillText(
                `P${playerIndex + 1}: ${definition.name}`,
                position.x,
                position.y - radius - 18
            );

            // Health bar above bot
            const barWidth = 50;
            const barHeight = 5;
            const barX = position.x - barWidth / 2;
            const barY = position.y - radius - 12;
            const healthPct = bot.health / bot.maxHealth;

            ctx.fillStyle = "rgba(0,0,0,0.6)";
            ctx.fillRect(barX - 1, barY - 1, barWidth + 2, barHeight + 2);

            const healthColor =
                healthPct > 0.6 ? "#22c55e" : healthPct > 0.3 ? "#eab308" : "#ef4444";
            ctx.fillStyle = healthColor;
            ctx.fillRect(barX, barY, barWidth * healthPct, barHeight);
        },
        []
    );

    // Main render loop
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        const render = () => {
            tickRef.current++;
            const tick = tickRef.current;

            // Clear
            ctx.clearRect(0, 0, ARENA_WIDTH, ARENA_HEIGHT);

            // Arena background
            const bgGrad = ctx.createRadialGradient(
                ARENA_WIDTH / 2,
                ARENA_HEIGHT / 2,
                0,
                ARENA_WIDTH / 2,
                ARENA_HEIGHT / 2,
                ARENA_WIDTH * 0.6
            );
            bgGrad.addColorStop(0, "#1a1a2e");
            bgGrad.addColorStop(1, "#0a0a16");
            ctx.fillStyle = bgGrad;
            ctx.fillRect(0, 0, ARENA_WIDTH, ARENA_HEIGHT);

            // Pulsing grid lines
            const gridPulse = 0.03 + Math.sin(tick * 0.02) * 0.01;
            ctx.strokeStyle = `rgba(74, 158, 255, ${gridPulse})`;
            ctx.lineWidth = 1;
            for (let x = 0; x < ARENA_WIDTH; x += 40) {
                ctx.beginPath();
                ctx.moveTo(x, 0);
                ctx.lineTo(x, ARENA_HEIGHT);
                ctx.stroke();
            }
            for (let y = 0; y < ARENA_HEIGHT; y += 40) {
                ctx.beginPath();
                ctx.moveTo(0, y);
                ctx.lineTo(ARENA_WIDTH, y);
                ctx.stroke();
            }

            // Arena border with double glow
            ctx.strokeStyle = "#4a9eff";
            ctx.lineWidth = 3;
            ctx.shadowColor = "#4a9eff";
            ctx.shadowBlur = 15;
            ctx.strokeRect(2, 2, ARENA_WIDTH - 4, ARENA_HEIGHT - 4);
            // Second pass for brighter inner glow
            ctx.globalAlpha = 0.3;
            ctx.strokeRect(2, 2, ARENA_WIDTH - 4, ARENA_HEIGHT - 4);
            ctx.globalAlpha = 1;
            ctx.shadowBlur = 0;

            // Pulsing center circle decoration
            const centerPulse = 0.15 + Math.sin(tick * 0.03) * 0.05;
            ctx.strokeStyle = `rgba(74, 158, 255, ${centerPulse})`;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.arc(ARENA_WIDTH / 2, ARENA_HEIGHT / 2, 80, 0, Math.PI * 2);
            ctx.stroke();
            // Inner ring
            ctx.strokeStyle = `rgba(74, 158, 255, ${centerPulse * 0.5})`;
            ctx.beginPath();
            ctx.arc(ARENA_WIDTH / 2, ARENA_HEIGHT / 2, 40, 0, Math.PI * 2);
            ctx.stroke();
            // Center dot
            ctx.beginPath();
            ctx.arc(ARENA_WIDTH / 2, ARENA_HEIGHT / 2, 3, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(74, 158, 255, ${centerPulse * 2})`;
            ctx.fill();

            // Vignette overlay (darker edges for dramatic focus)
            const vignetteGrad = ctx.createRadialGradient(
                ARENA_WIDTH / 2, ARENA_HEIGHT / 2, ARENA_WIDTH * 0.25,
                ARENA_WIDTH / 2, ARENA_HEIGHT / 2, ARENA_WIDTH * 0.7
            );
            vignetteGrad.addColorStop(0, "rgba(0,0,0,0)");
            vignetteGrad.addColorStop(1, "rgba(0,0,0,0.35)");
            ctx.fillStyle = vignetteGrad;
            ctx.fillRect(0, 0, ARENA_WIDTH, ARENA_HEIGHT);

            if (gameState) {
                // Draw bots with attack effects
                drawBot(ctx, gameState.bots[0], 0, tick);
                drawBot(ctx, gameState.bots[1], 1, tick);

                // Spawn damage particles using attacker's effect colors
                if (gameState.damageEvents.length > 0) {
                    spawnDamageParticles(gameState.damageEvents, gameState.bots);
                }

                // Update and render particles
                const particles = particlesRef.current;
                for (let i = particles.length - 1; i >= 0; i--) {
                    const p = particles[i];
                    p.x += p.vx;
                    p.y += p.vy;
                    p.vx *= 0.95;
                    p.vy *= 0.95;
                    p.life--;
                    p.rotation += p.rotationSpeed;

                    if (p.life <= 0) {
                        particles.splice(i, 1);
                        continue;
                    }

                    const alpha = p.life / p.maxLife;
                    ctx.globalAlpha = alpha;
                    ctx.fillStyle = p.color;
                    drawParticleShape(ctx, p.x, p.y, p.size * alpha, p.shape, p.rotation);
                }
                ctx.globalAlpha = 1;

                // Victory overlay
                if (gameState.status === "finished") {
                    ctx.fillStyle = "rgba(0,0,0,0.5)";
                    ctx.fillRect(0, 0, ARENA_WIDTH, ARENA_HEIGHT);

                    ctx.fillStyle = "#FFD700";
                    ctx.font = "bold 40px Inter, system-ui, sans-serif";
                    ctx.textAlign = "center";

                    if (gameState.winner) {
                        const winnerBot = gameState.bots.find((b) => b.id === gameState.winner);
                        const winnerIdx = gameState.bots[0].id === gameState.winner ? 1 : 2;
                        ctx.fillText(
                            `🏆 P${winnerIdx}: ${winnerBot?.definition.name} WINS!`,
                            ARENA_WIDTH / 2,
                            ARENA_HEIGHT / 2
                        );
                    } else {
                        ctx.fillText("DRAW!", ARENA_WIDTH / 2, ARENA_HEIGHT / 2);
                    }
                }
            }

            // Countdown overlay
            if (countdown !== undefined && countdown > 0) {
                ctx.fillStyle = "rgba(0,0,0,0.6)";
                ctx.fillRect(0, 0, ARENA_WIDTH, ARENA_HEIGHT);

                ctx.fillStyle = "#fff";
                ctx.font = "bold 80px Inter, system-ui, sans-serif";
                ctx.textAlign = "center";
                ctx.fillText(String(countdown), ARENA_WIDTH / 2, ARENA_HEIGHT / 2 + 25);

                ctx.font = "20px Inter, system-ui, sans-serif";
                ctx.fillText("GET READY!", ARENA_WIDTH / 2, ARENA_HEIGHT / 2 - 50);
            }

            animFrameRef.current = requestAnimationFrame(render);
        };

        animFrameRef.current = requestAnimationFrame(render);

        return () => {
            if (animFrameRef.current) {
                cancelAnimationFrame(animFrameRef.current);
            }
        };
    }, [gameState, countdown, drawBot, spawnDamageParticles]);

    return (
        <canvas
            ref={canvasRef}
            width={ARENA_WIDTH}
            height={ARENA_HEIGHT}
            className="arena-canvas"
        />
    );
}
