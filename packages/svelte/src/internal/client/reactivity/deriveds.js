/** @import { Derived } from '#client' */
import { CLEAN, DERIVED, DESTROYED, DIRTY, MAYBE_DIRTY, UNOWNED } from '../constants.js';
import {
	current_reaction,
	current_effect,
	remove_reactions,
	set_signal_status,
	current_skip_reaction,
	update_reaction,
	destroy_effect_children,
	increment_version
} from '../runtime.js';
import { equals, safe_equals } from './equality.js';

/** @type {Derived[]} */
export let updating_deriveds = [];

/**
 * @template V
 * @param {() => V} fn
 * @returns {Derived<V>}
 */
/*#__NO_SIDE_EFFECTS__*/
export function derived(fn) {
	let flags = DERIVED | DIRTY;
	if (current_effect === null) flags |= UNOWNED;

	/** @type {Derived<V>} */
	const signal = {
		deps: null,
		deriveds: null,
		equals,
		f: flags,
		first: null,
		fn,
		last: null,
		reactions: null,
		v: /** @type {V} */ (null),
		version: 0
	};

	if (current_reaction !== null && (current_reaction.f & DERIVED) !== 0) {
		var current_derived = /** @type {Derived} */ (current_reaction);
		if (current_derived.deriveds === null) {
			current_derived.deriveds = [signal];
		} else {
			current_derived.deriveds.push(signal);
		}
	}

	return signal;
}

/**
 * @template V
 * @param {() => V} fn
 * @returns {Derived<V>}
 */
/*#__NO_SIDE_EFFECTS__*/
export function derived_safe_equal(fn) {
	const signal = derived(fn);
	signal.equals = safe_equals;
	return signal;
}

/**
 * @param {Derived} derived
 * @returns {void}
 */
function destroy_derived_children(derived) {
	destroy_effect_children(derived);
	var deriveds = derived.deriveds;

	if (deriveds !== null) {
		derived.deriveds = null;

		for (var i = 0; i < deriveds.length; i += 1) {
			destroy_derived(deriveds[i]);
		}
	}
}

/**
 * @param {Derived} derived
 * @returns {void}
 */
export function update_derived(derived) {
	// If we're already updating this derived (recursively) then bail-out
	// of re-calling the derived again to prevent a stack-overflow.
	if (updating_deriveds.includes(derived)) {
		return;
	}
	updating_deriveds.push(derived);
	destroy_derived_children(derived);
	var value = update_reaction(derived);
	updating_deriveds.pop();

	var status =
		(current_skip_reaction || (derived.f & UNOWNED) !== 0) && derived.deps !== null
			? MAYBE_DIRTY
			: CLEAN;

	set_signal_status(derived, status);

	if (!derived.equals(value)) {
		derived.v = value;
		derived.version = increment_version();
	}
}

/**
 * @param {Derived} signal
 * @returns {void}
 */
export function destroy_derived(signal) {
	destroy_derived_children(signal);
	remove_reactions(signal, 0);
	set_signal_status(signal, DESTROYED);

	// TODO we need to ensure we remove the derived from any parent derives

	signal.first =
		signal.last =
		signal.deps =
		signal.reactions =
		// @ts-expect-error `signal.fn` cannot be `null` while the signal is alive
		signal.fn =
			null;
}
