/**
 * Barrel for the authored-record schemas.
 *
 * These schemas are the single source of truth for record shape. Types come
 * from `z.infer` (or `z.input` for authoring) — never hand write a type that
 * duplicates one of them.
 */

export * from "./common";
export * from "./technique";
export * from "./archetype";
export * from "./archetype-step";
export * from "./slot";
export * from "./slot-option";
