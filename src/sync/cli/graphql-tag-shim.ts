/**
 * Minimal graphql-tag replacement for CLI.
 * Returns a structure compatible with graphql-request's document format.
 * Eliminates the need for the full graphql package (~150KB).
 */

export interface DocumentNode {
	loc: {
		source: {
			body: string;
		};
	};
}

export default function gql(
	strings: TemplateStringsArray,
	...values: unknown[]
): DocumentNode {
	// Reconstruct the template literal
	let result = strings[0];
	for (let i = 0; i < values.length; i++) {
		result += String(values[i]) + strings[i + 1];
	}

	return {
		loc: {
			source: {
				body: result,
			},
		},
	};
}
