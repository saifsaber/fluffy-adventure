/**
 * @dakka/engine — the causal match simulation.
 *
 * Purity is the contract: no I/O, no clock, no globals, no unseeded randomness.
 * Every source of chance flows through an injected seeded PRNG so that
 *   simulate(seed, input) === simulate(seed, input)
 * holds byte for byte. Determinism is what buys counterfactual replay, a fair
 * daily challenge, honest PvP, and reproducible bug reports — they all break together.
 */

export const ENGINE_VERSION = '0.0.0';
