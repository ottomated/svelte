/** @import { BlockStatement, Expression, Identifier, Pattern, Statement } from 'estree' */
/** @import { SnippetBlock } from '#compiler' */
/** @import { ComponentContext } from '../types' */
import { dev } from '../../../../state.js';
import { extract_paths } from '../../../../utils/ast.js';
import * as b from '../../../../utils/builders.js';
import { get_value } from './shared/declarations.js';

/**
 * @param {SnippetBlock} node
 * @param {ComponentContext} context
 */
export function SnippetBlock(node, context) {
	// TODO hoist where possible
	/** @type {Pattern[]} */
	const args = [b.id('$$anchor')];

	/** @type {BlockStatement} */
	let body;

	/** @type {Statement[]} */
	const declarations = [];

	const transformers = { ...context.state.transformers };
	const child_state = { ...context.state, transformers };

	for (let i = 0; i < node.parameters.length; i++) {
		const argument = node.parameters[i];

		if (!argument) continue;

		if (argument.type === 'Identifier') {
			args.push({
				type: 'AssignmentPattern',
				left: argument,
				right: b.id('$.noop')
			});

			transformers[argument.name] = {
				read: b.call
			};

			continue;
		}

		let arg_alias = `$$arg${i}`;
		args.push(b.id(arg_alias));

		const paths = extract_paths(argument);

		for (const path of paths) {
			const name = /** @type {Identifier} */ (path.node).name;
			const needs_derived = path.has_default_value; // to ensure that default value is only called once
			const fn = b.thunk(
				/** @type {Expression} */ (context.visit(path.expression?.(b.maybe_call(b.id(arg_alias)))))
			);

			declarations.push(b.let(path.node, needs_derived ? b.call('$.derived_safe_equal', fn) : fn));

			transformers[name] = {
				read: needs_derived ? get_value : b.call
			};

			// we need to eagerly evaluate the expression in order to hit any
			// 'Cannot access x before initialization' errors
			if (dev) {
				declarations.push(b.stmt(transformers[name].read(b.id(name))));
			}
		}
	}

	body = b.block([
		...declarations,
		.../** @type {BlockStatement} */ (context.visit(node.body, child_state)).body
	]);

	/** @type {Expression} */
	let snippet = b.arrow(args, body);

	if (dev) {
		snippet = b.call('$.wrap_snippet', b.id(context.state.analysis.name), snippet);
	}

	const declaration = b.const(node.expression, snippet);

	// Top-level snippets are hoisted so they can be referenced in the `<script>`
	if (context.path.length === 1 && context.path[0].type === 'Fragment') {
		context.state.analysis.top_level_snippets.push(declaration);
	} else {
		context.state.init.push(declaration);
	}
}
