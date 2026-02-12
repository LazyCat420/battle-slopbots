/**
 * Matter.js Adapter — Implements PhysicsWorld using Matter.js.
 *
 * This is the concrete physics backend. All Matter.js-specific code lives
 * here so the rest of the engine stays engine-agnostic.
 */
import Matter from "matter-js";
import {
    PhysicsWorld,
    BodyHandle,
    BodyConfig,
    CollisionCallback,
    CollisionInfo,
} from "@/lib/engine/physics-types";
import { Vec2 } from "@/lib/types/bot";

export class MatterAdapter implements PhysicsWorld {
    private engine: Matter.Engine;
    private bodies: Map<BodyHandle, Matter.Body> = new Map();
    private collisionCallbacks: CollisionCallback[] = [];
    private handleCounter = 0;

    constructor() {
        this.engine = Matter.Engine.create({
            gravity: { x: 0, y: 0, scale: 0 }, // top-down, no gravity
        });

        // Wire up collision events
        Matter.Events.on(this.engine, "collisionStart", (event) => {
            for (const pair of event.pairs) {
                const handleA = this.findHandle(pair.bodyA);
                const handleB = this.findHandle(pair.bodyB);
                if (!handleA || !handleB) continue;

                const collision = pair.collision;
                const info: CollisionInfo = {
                    bodyA: handleA,
                    bodyB: handleB,
                    normal: {
                        x: collision.normal.x,
                        y: collision.normal.y,
                    },
                    depth: collision.depth,
                };

                for (const cb of this.collisionCallbacks) {
                    cb(info);
                }
            }
        });
    }

    // ── World Lifecycle ───────────────────────────

    step(dt: number): void {
        Matter.Engine.update(this.engine, dt);
    }

    destroy(): void {
        Matter.Events.off(this.engine, "collisionStart", undefined as never);
        Matter.Engine.clear(this.engine);
        this.bodies.clear();
        this.collisionCallbacks = [];
    }

    // ── Body Management ───────────────────────────

    createBody(config: BodyConfig): BodyHandle {
        const handle = config.label || `body_${this.handleCounter++}`;

        const options = {
            label: handle,
            friction: config.friction,
            frictionAir: config.frictionAir,
            restitution: config.restitution,
            density: config.density,
            isStatic: config.isStatic ?? false,
        };

        let body: Matter.Body;
        const { x, y } = config.position;
        const r = config.radius;

        switch (config.shape) {
            case "circle":
                body = Matter.Bodies.circle(x, y, r, options);
                break;
            case "rectangle":
                body = Matter.Bodies.rectangle(x, y, r * 2, r * 1.6, options);
                break;
            case "triangle":
                body = Matter.Bodies.polygon(x, y, 3, r, options);
                break;
            case "pentagon":
                body = Matter.Bodies.polygon(x, y, 5, r, options);
                break;
            case "hexagon":
                body = Matter.Bodies.polygon(x, y, 6, r, options);
                break;
            default:
                body = Matter.Bodies.circle(x, y, r, options);
                break;
        }

        this.bodies.set(handle, body);
        Matter.Composite.add(this.engine.world, body);
        return handle;
    }

    removeBody(handle: BodyHandle): void {
        const body = this.bodies.get(handle);
        if (body) {
            Matter.Composite.remove(this.engine.world, body);
            this.bodies.delete(handle);
        }
    }

    // ── Position & Angle ──────────────────────────

    getPosition(handle: BodyHandle): Vec2 {
        const body = this.getBody(handle);
        return { x: body.position.x, y: body.position.y };
    }

    setPosition(handle: BodyHandle, pos: Vec2): void {
        const body = this.getBody(handle);
        Matter.Body.setPosition(body, pos);
    }

    getAngle(handle: BodyHandle): number {
        return this.getBody(handle).angle;
    }

    setAngle(handle: BodyHandle, angle: number): void {
        const body = this.getBody(handle);
        Matter.Body.setAngle(body, angle);
    }

    // ── Velocity ──────────────────────────────────

    getVelocity(handle: BodyHandle): Vec2 {
        const body = this.getBody(handle);
        return { x: body.velocity.x, y: body.velocity.y };
    }

    setVelocity(handle: BodyHandle, vel: Vec2): void {
        const body = this.getBody(handle);
        Matter.Body.setVelocity(body, vel);
    }

    // ── Forces & Impulses ─────────────────────────

    applyForce(handle: BodyHandle, force: Vec2): void {
        const body = this.getBody(handle);
        Matter.Body.applyForce(body, body.position, force);
    }

    applyImpulse(handle: BodyHandle, impulse: Vec2): void {
        // Matter.js doesn't have a native impulse method.
        // Impulse = instantaneous velocity change: dv = impulse / mass
        const body = this.getBody(handle);
        const mass = body.mass || 1;
        Matter.Body.setVelocity(body, {
            x: body.velocity.x + impulse.x / mass,
            y: body.velocity.y + impulse.y / mass,
        });
    }

    // ── Mass ──────────────────────────────────────

    getMass(handle: BodyHandle): number {
        return this.getBody(handle).mass;
    }

    // ── Collision Events ──────────────────────────

    onCollisionStart(callback: CollisionCallback): void {
        this.collisionCallbacks.push(callback);
    }

    // ── Convenience ───────────────────────────────

    createStaticRect(
        x: number,
        y: number,
        width: number,
        height: number,
        label?: string
    ): BodyHandle {
        const handle = label || `wall_${this.handleCounter++}`;
        const body = Matter.Bodies.rectangle(x, y, width, height, {
            isStatic: true,
            label: handle,
        });
        this.bodies.set(handle, body);
        Matter.Composite.add(this.engine.world, body);
        return handle;
    }

    // ── Internal Helpers ──────────────────────────

    private getBody(handle: BodyHandle): Matter.Body {
        const body = this.bodies.get(handle);
        if (!body) {
            throw new Error(`Physics body not found: ${handle}`);
        }
        return body;
    }

    private findHandle(body: Matter.Body): BodyHandle | undefined {
        for (const [handle, b] of this.bodies) {
            if (b.id === body.id) return handle;
        }
        return undefined;
    }
}
