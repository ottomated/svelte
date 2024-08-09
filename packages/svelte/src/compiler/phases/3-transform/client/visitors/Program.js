/** @import { Expression, MemberExpression, Program } from 'estree' */
/** @import { ComponentContext } from '../types' */
import { build_getter, is_prop_source } from '../utils.js';
import * as b from '../../../../utils/builders.js';
import { add_state_transformers } from './shared/declarations.js';

/**
 * @param {Program} node
 * @param {ComponentContext} context
 */
export function Program(node, context) {
	if (context.state.is_instance) {
		for (const [name, binding] of context.state.scope.declarations) {
			if (binding.kind === 'store_sub') {
				const store = /** @type {Expression} */ (context.visit(b.id(name.slice(1))));

				context.state.transform[name] = {
					read: b.call,
					assign: (node, value) => {
						return b.call('$.store_set', store, value);
					},
					mutate: (node, mutation) => {
						// We need to untrack the store read, for consistency with Svelte 4
						const untracked = b.call('$.untrack', node);

						/**
						 *
						 * @param {Expression} n
						 * @returns {Expression}
						 */
						function replace(n) {
							if (n.type === 'MemberExpression') {
								return {
									...n,
									object: replace(/** @type {Expression} */ (n.object)),
									property: n.property
								};
							}

							return untracked;
						}

						return b.call(
							'$.store_mutate',
							store,
							b.assignment(
								mutation.operator,
								/** @type {MemberExpression} */ (
									replace(/** @type {MemberExpression} */ (mutation.left))
								),
								mutation.right
							),
							untracked
						);
					},
					update: (node) => {
						return b.call(
							node.prefix ? '$.update_pre_store' : '$.update_store',
							build_getter(b.id(name.slice(1)), context.state),
							b.call(node.argument),
							node.operator === '--' && b.literal(-1)
						);
					}
				};
			}

			if (binding.kind === 'prop' || binding.kind === 'bindable_prop') {
				if (is_prop_source(binding, context.state)) {
					context.state.transform[name] = {
						read: b.call,
						assign: (node, value) => {
							return b.call(node, value);
						},
						mutate: (node, value) => {
							if (binding.kind === 'bindable_prop') {
								// only necessary for interop with legacy parent bindings
								return b.call(node, value, b.true);
							}

							return value;
						},
						update: (node) => {
							return b.call(
								node.prefix ? '$.update_pre_prop' : '$.update_prop',
								node.argument,
								node.operator === '--' && b.literal(-1)
							);
						}
					};
				} else if (binding.prop_alias) {
					const key = b.key(binding.prop_alias);
					context.state.transform[name] = {
						read: (node) => b.member(b.id('$$props'), key, key.type === 'Literal')
					};
				} else {
					context.state.transform[name] = {
						read: (node) => b.member(b.id('$$props'), node)
					};
				}
			}
		}
	}

	add_state_transformers(context);

	context.next();
}
