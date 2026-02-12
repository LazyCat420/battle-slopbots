/**
 * Physics Abstraction Layer — Engine-agnostic types and interface.
 *
 * This allows the game engine to work with any 2D physics backend
 * (Matter.js, Planck.js, Rapier.js) without coupling to a specific API.
 */
import { Vec2, BodyShape } from "@/lib/types/bot";

// ── Opaque Handles ────────────────────────────────────────
/** Opaque identifier for a physics body */
export type BodyHandle = string;

/** Opaque identifier for a physics joint (future use) */
export type JointHandle = string;

// ── Body Configuration ────────────────────────────────────
export interface BodyConfig {
    /** Unique label for this body (used as the BodyHandle) */
    label: string;
    /** Shape of the body */
    shape: BodyShape;
    /** Starting position */
    position: Vec2;
    /** Radius (for circle) or half-extent (for polygons) */
    radius: number;
    /** Material density — affects mass */
    density: number;
    /** Surface friction (0-1) */
    friction: number;
    /** Air resistance (0-1) */
    frictionAir: number;
    /** Bounciness (0-1) */
    restitution: number;
    /** If true, body doesn't move (walls, obstacles) */
    isStatic?: boolean;
}

// ── Collision Info ─────────────────────────────────────────
export interface CollisionInfo {
    /** Handle of the first body */
    bodyA: BodyHandle;
    /** Handle of the second body */
    bodyB: BodyHandle;
    /** Collision normal vector */
    normal: Vec2;
    /** Penetration depth */
    depth: number;
}

export type CollisionCallback = (info: CollisionInfo) => void;

// ── Physics World Interface ───────────────────────────────
/**
 * Engine-agnostic physics world.
 * Implement this interface to plug in any 2D physics engine.
 */
export interface PhysicsWorld {
    // ── World Lifecycle ───────────────────────────
    /** Advance the simulation by dt milliseconds */
    step(dt: number): void;
    /** Clean up all resources */
    destroy(): void;

    // ── Body Management ───────────────────────────
    /** Create a dynamic or static body and return its handle */
    createBody(config: BodyConfig): BodyHandle;
    /** Remove a body from the world */
    removeBody(handle: BodyHandle): void;

    // ── Position & Angle ──────────────────────────
    getPosition(handle: BodyHandle): Vec2;
    setPosition(handle: BodyHandle, pos: Vec2): void;
    getAngle(handle: BodyHandle): number;
    setAngle(handle: BodyHandle, angle: number): void;

    // ── Velocity ──────────────────────────────────
    getVelocity(handle: BodyHandle): Vec2;
    setVelocity(handle: BodyHandle, vel: Vec2): void;

    // ── Forces & Impulses ─────────────────────────
    applyForce(handle: BodyHandle, force: Vec2): void;
    applyImpulse(handle: BodyHandle, impulse: Vec2): void;

    // ── Mass ──────────────────────────────────────
    getMass(handle: BodyHandle): number;

    // ── Collision Events ──────────────────────────
    /** Register a callback for collision start events */
    onCollisionStart(callback: CollisionCallback): void;

    // ── Convenience ───────────────────────────────
    /** Create a static rectangular body (for arena walls) */
    createStaticRect(
        x: number,
        y: number,
        width: number,
        height: number,
        label?: string
    ): BodyHandle;
}
