/**
 * Game Engine — Matter.js physics + game loop for BattleBots.
 *
 * This runs the core simulation: physics, weapon hits, damage, win conditions.
 * Designed to run on the server or in-memory on the client for same-screen play.
 */
import Matter from "matter-js";
import { v4 as uuidv4 } from "uuid";
import {
    BotDefinition,
    BotState,
    DamageEvent,
    GameState,
    Vec2,
} from "@/lib/types/bot";
import {
    BotActions,
    compileBehavior,
    createBehaviorAPI,
    executeBehavior,
} from "@/lib/engine/sandbox";

// ── Constants ──────────────────────────────────────────────
export const ARENA_WIDTH = 800;
export const ARENA_HEIGHT = 600;
const MATCH_DURATION = 90; // seconds
const TICK_RATE = 30; // fps
const TICK_INTERVAL = 1000 / TICK_RATE;
const BASE_HEALTH = 100;
const WALL_THICKNESS = 40;

// Size multiplier for bot body radius
const SIZE_TO_RADIUS: Record<number, number> = {
    1: 15,
    2: 20,
    3: 25,
    4: 30,
    5: 35,
};

/**
 * Create the Matter.js body for a bot based on its definition.
 */
function createBotBody(
    def: BotDefinition,
    startX: number,
    startY: number
): Matter.Body {
    const radius = SIZE_TO_RADIUS[Math.round(def.size)] || 25;

    let body: Matter.Body;

    switch (def.shape) {
        case "circle":
            body = Matter.Bodies.circle(startX, startY, radius, {
                friction: 0.1,
                frictionAir: 0.05,
                restitution: 0.3,
                density: 0.01 * (1 + def.armor * 0.1),
            });
            break;
        case "rectangle":
            body = Matter.Bodies.rectangle(startX, startY, radius * 2, radius * 1.6, {
                friction: 0.1,
                frictionAir: 0.05,
                restitution: 0.3,
                density: 0.01 * (1 + def.armor * 0.1),
            });
            break;
        case "triangle":
            body = Matter.Bodies.polygon(startX, startY, 3, radius, {
                friction: 0.1,
                frictionAir: 0.05,
                restitution: 0.3,
                density: 0.01 * (1 + def.armor * 0.1),
            });
            break;
        case "hexagon":
            body = Matter.Bodies.polygon(startX, startY, 6, radius, {
                friction: 0.1,
                frictionAir: 0.05,
                restitution: 0.3,
                density: 0.01 * (1 + def.armor * 0.1),
            });
            break;
        case "pentagon":
            body = Matter.Bodies.polygon(startX, startY, 5, radius, {
                friction: 0.1,
                frictionAir: 0.05,
                restitution: 0.3,
                density: 0.01 * (1 + def.armor * 0.1),
            });
            break;
        default:
            body = Matter.Bodies.circle(startX, startY, radius, {
                friction: 0.1,
                frictionAir: 0.05,
                restitution: 0.3,
            });
    }

    return body;
}

/**
 * GameEngine — manages a full match between two bots.
 */
export class GameEngine {
    private engine: Matter.Engine;
    private bodies: [Matter.Body, Matter.Body];
    private botStates: [BotState, BotState];
    private behaviorFns: [
        ((api: import("@/lib/types/bot").BehaviorAPI, tick: number) => void) | null,
        ((api: import("@/lib/types/bot").BehaviorAPI, tick: number) => void) | null
    ];
    private tickCount = 0;
    private timeRemaining = MATCH_DURATION;
    private status: GameState["status"] = "waiting";
    private winner: string | null = null;
    private damageEvents: DamageEvent[] = [];
    private intervalId: ReturnType<typeof setInterval> | null = null;
    private onStateUpdate: ((state: GameState) => void) | null = null;

    constructor(def1: BotDefinition, def2: BotDefinition) {
        // Create Matter.js engine
        this.engine = Matter.Engine.create({
            gravity: { x: 0, y: 0, scale: 0 }, // top-down, no gravity
        });

        // Create arena walls
        const walls = [
            Matter.Bodies.rectangle(ARENA_WIDTH / 2, -WALL_THICKNESS / 2, ARENA_WIDTH + WALL_THICKNESS * 2, WALL_THICKNESS, { isStatic: true }),
            Matter.Bodies.rectangle(ARENA_WIDTH / 2, ARENA_HEIGHT + WALL_THICKNESS / 2, ARENA_WIDTH + WALL_THICKNESS * 2, WALL_THICKNESS, { isStatic: true }),
            Matter.Bodies.rectangle(-WALL_THICKNESS / 2, ARENA_HEIGHT / 2, WALL_THICKNESS, ARENA_HEIGHT + WALL_THICKNESS * 2, { isStatic: true }),
            Matter.Bodies.rectangle(ARENA_WIDTH + WALL_THICKNESS / 2, ARENA_HEIGHT / 2, WALL_THICKNESS, ARENA_HEIGHT + WALL_THICKNESS * 2, { isStatic: true }),
        ];
        Matter.Composite.add(this.engine.world, walls);

        // Create bot bodies — spawn on opposite sides
        const body1 = createBotBody(def1, 150, ARENA_HEIGHT / 2);
        const body2 = createBotBody(def2, ARENA_WIDTH - 150, ARENA_HEIGHT / 2);
        this.bodies = [body1, body2];
        Matter.Composite.add(this.engine.world, [body1, body2]);

        // Initialize bot states
        const id1 = uuidv4();
        const id2 = uuidv4();

        this.botStates = [
            {
                id: id1,
                definition: def1,
                position: { x: body1.position.x, y: body1.position.y },
                angle: body1.angle,
                velocity: { x: 0, y: 0 },
                health: BASE_HEALTH,
                maxHealth: BASE_HEALTH,
                weaponCooldownRemaining: 0,
                isAttacking: false,
                attackAnimationFrame: 0,
            },
            {
                id: id2,
                definition: def2,
                position: { x: body2.position.x, y: body2.position.y },
                angle: body2.angle,
                velocity: { x: 0, y: 0 },
                health: BASE_HEALTH,
                maxHealth: BASE_HEALTH,
                weaponCooldownRemaining: 0,
                isAttacking: false,
                attackAnimationFrame: 0,
            },
        ];

        // Compile behavior functions
        const compile1 = compileBehavior(def1.behaviorCode);
        const compile2 = compileBehavior(def2.behaviorCode);

        this.behaviorFns = [
            compile1.error ? null : compile1.fn,
            compile2.error ? null : compile2.fn,
        ];

        if (compile1.error) console.warn(`Bot 1 compile error: ${compile1.error}`);
        if (compile2.error) console.warn(`Bot 2 compile error: ${compile2.error}`);
    }

    /**
     * Set callback for state updates (called each tick).
     */
    onUpdate(callback: (state: GameState) => void) {
        this.onStateUpdate = callback;
    }

    /**
     * Get the current game state snapshot.
     */
    getState(): GameState {
        return {
            bots: [{ ...this.botStates[0] }, { ...this.botStates[1] }],
            status: this.status,
            winner: this.winner,
            tickCount: this.tickCount,
            timeRemaining: this.timeRemaining,
            damageEvents: [...this.damageEvents],
            arenaWidth: ARENA_WIDTH,
            arenaHeight: ARENA_HEIGHT,
        };
    }

    /**
     * Start the match.
     */
    start() {
        this.status = "countdown";

        // 3-second countdown then fight
        setTimeout(() => {
            this.status = "fighting";
            this.intervalId = setInterval(() => this.tick(), TICK_INTERVAL);
        }, 3000);
    }

    /**
     * Start instantly (no countdown) — useful for testing.
     */
    startImmediate() {
        this.status = "fighting";
        this.intervalId = setInterval(() => this.tick(), TICK_INTERVAL);
    }

    /**
     * Stop the match.
     */
    stop() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
    }

    /**
     * Single game tick.
     */
    private tick() {
        if (this.status !== "fighting") return;

        this.tickCount++;
        this.damageEvents = []; // clear per-tick events

        // Update time
        this.timeRemaining -= 1 / TICK_RATE;
        if (this.timeRemaining <= 0) {
            this.endMatch();
            return;
        }

        // Execute bot behaviors
        for (let i = 0; i < 2; i++) {
            const botIdx = i as 0 | 1;
            const enemyIdx = (1 - i) as 0 | 1;
            const fn = this.behaviorFns[botIdx];

            if (fn) {
                const { api, actions } = createBehaviorAPI(
                    this.botStates[botIdx],
                    this.botStates[enemyIdx],
                    ARENA_WIDTH,
                    ARENA_HEIGHT
                );
                executeBehavior(fn, api, this.tickCount);
                this.applyActions(botIdx, actions);
            }
        }

        // Step physics
        Matter.Engine.update(this.engine, TICK_INTERVAL);

        // Sync state from physics
        for (let i = 0; i < 2; i++) {
            const idx = i as 0 | 1;
            this.botStates[idx].position = {
                x: this.bodies[idx].position.x,
                y: this.bodies[idx].position.y,
            };
            this.botStates[idx].angle = this.bodies[idx].angle;
            this.botStates[idx].velocity = {
                x: this.bodies[idx].velocity.x,
                y: this.bodies[idx].velocity.y,
            };

            // Tick weapon cooldown
            if (this.botStates[idx].weaponCooldownRemaining > 0) {
                this.botStates[idx].weaponCooldownRemaining -= TICK_INTERVAL;
            }

            // Tick attack animation
            if (this.botStates[idx].isAttacking) {
                this.botStates[idx].attackAnimationFrame++;
                if (this.botStates[idx].attackAnimationFrame > 10) {
                    this.botStates[idx].isAttacking = false;
                    this.botStates[idx].attackAnimationFrame = 0;
                }
            }
        }

        // Check win conditions
        if (this.botStates[0].health <= 0 || this.botStates[1].health <= 0) {
            this.endMatch();
            return;
        }

        // Notify listener
        if (this.onStateUpdate) {
            this.onStateUpdate(this.getState());
        }
    }

    /**
     * Apply the actions from a bot's behavior function to the physics engine.
     */
    private applyActions(botIdx: 0 | 1, actions: BotActions) {
        const bot = this.botStates[botIdx];
        const body = this.bodies[botIdx];
        const speedMultiplier = bot.definition.speed * 0.4;

        if (actions.stop) {
            Matter.Body.setVelocity(body, { x: 0, y: 0 });
            return;
        }

        // Movement
        if (actions.moveTarget) {
            const dx = actions.moveTarget.x - bot.position.x;
            const dy = actions.moveTarget.y - bot.position.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist > 1) {
                let speed = actions.moveSpeed ?? bot.definition.speed;
                speed = Math.min(speed, 10) * 0.4;

                const dirX = dx / dist;
                const dirY = dy / dist;

                if (actions.moveAway) {
                    Matter.Body.setVelocity(body, {
                        x: -dirX * speed,
                        y: -dirY * speed,
                    });
                } else {
                    Matter.Body.setVelocity(body, {
                        x: dirX * speed,
                        y: dirY * speed,
                    });
                }
            }
        }

        // Strafing
        if (actions.strafeDirection) {
            const enemyIdx = (1 - botIdx) as 0 | 1;
            const enemy = this.botStates[enemyIdx];
            const angleToEnemy = Math.atan2(
                enemy.position.y - bot.position.y,
                enemy.position.x - bot.position.x
            );
            const strafeAngle =
                actions.strafeDirection === "left"
                    ? angleToEnemy - Math.PI / 2
                    : angleToEnemy + Math.PI / 2;

            const currentVel = body.velocity;
            Matter.Body.setVelocity(body, {
                x: currentVel.x + Math.cos(strafeAngle) * speedMultiplier * 0.5,
                y: currentVel.y + Math.sin(strafeAngle) * speedMultiplier * 0.5,
            });
        }

        // Rotation
        if (actions.rotateTarget !== null) {
            Matter.Body.setAngle(body, actions.rotateTarget);
        }

        // Attack
        if (actions.attack && bot.weaponCooldownRemaining <= 0) {
            this.performAttack(botIdx);
        }
    }

    /**
     * Perform a weapon attack.
     */
    private performAttack(attackerIdx: 0 | 1) {
        const attacker = this.botStates[attackerIdx];
        const targetIdx = (1 - attackerIdx) as 0 | 1;
        const target = this.botStates[targetIdx];

        const dx = target.position.x - attacker.position.x;
        const dy = target.position.y - attacker.position.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        // Check if target is in range
        if (dist <= attacker.definition.weapon.range + 20) {
            // Calculate damage (reduced by target armor)
            const baseDamage = attacker.definition.weapon.damage;
            const armorReduction = target.definition.armor * 0.05; // 5% per armor point
            const damage = Math.max(1, baseDamage * (1 - armorReduction));

            target.health = Math.max(0, target.health - damage);

            // Apply knockback
            if (dist > 0) {
                const knockbackForce = baseDamage * 0.001;
                Matter.Body.applyForce(this.bodies[targetIdx], this.bodies[targetIdx].position, {
                    x: (dx / dist) * knockbackForce,
                    y: (dy / dist) * knockbackForce,
                });
            }

            // Record damage event
            this.damageEvents.push({
                attackerId: attacker.id,
                targetId: target.id,
                damage,
                position: { x: target.position.x, y: target.position.y },
                tick: this.tickCount,
            });
        }

        // Set cooldown and animation
        attacker.weaponCooldownRemaining = attacker.definition.weapon.cooldown;
        attacker.isAttacking = true;
        attacker.attackAnimationFrame = 0;
    }

    /**
     * End the match and determine the winner.
     */
    private endMatch() {
        this.stop();
        this.status = "finished";

        if (this.botStates[0].health <= 0 && this.botStates[1].health <= 0) {
            this.winner = null; // Draw
        } else if (this.botStates[0].health <= 0) {
            this.winner = this.botStates[1].id;
        } else if (this.botStates[1].health <= 0) {
            this.winner = this.botStates[0].id;
        } else {
            // Time ran out — winner by health
            if (this.botStates[0].health > this.botStates[1].health) {
                this.winner = this.botStates[0].id;
            } else if (this.botStates[1].health > this.botStates[0].health) {
                this.winner = this.botStates[1].id;
            } else {
                this.winner = null; // Draw
            }
        }

        if (this.onStateUpdate) {
            this.onStateUpdate(this.getState());
        }
    }
}
