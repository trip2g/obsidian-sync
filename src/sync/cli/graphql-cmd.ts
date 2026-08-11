/**
 * `trip2g-sync graphql` — run a GraphQL query against the instance this vault
 * is already configured for.
 *
 * Exists for agents: the credentials are in .obsidian/plugins/trip2g/data.json
 * and the endpoint is derived from it, so nothing has to be assembled by hand.
 * `--introspect` answers "what can I even call here?" without dumping a full
 * introspection payload into the agent's context.
 */

export interface GraphQLResponse {
	data?: unknown;
	errors?: Array<{ message: string }>;
}

export type GraphQLTransport = (body: {
	query: string;
	variables?: Record<string, unknown>;
}) => Promise<GraphQLResponse>;

export interface CommandResult {
	stdout: string;
	stderr: string;
	exitCode: number;
}

/** Root types an agent is most likely to want listed. */
export const ROOT_TYPES = ["Query", "Mutation", "AdminQuery", "AdminMutation"];

const TYPE_REF = `
fragment TypeRef on __Type {
  kind name
  ofType { kind name ofType { kind name ofType { kind name } } }
}`;

interface TypeRef {
	kind: string;
	name: string | null;
	ofType?: TypeRef | null;
}

/** Renders an introspected type reference back into SDL, e.g. [Note!]!. */
export function renderType(type: TypeRef | null | undefined): string {
	if (!type) return "?";
	if (type.kind === "NON_NULL") return `${renderType(type.ofType)}!`;
	if (type.kind === "LIST") return `[${renderType(type.ofType)}]`;
	return type.name ?? "?";
}

interface IntrospectedField {
	name: string;
	description?: string | null;
	args?: Array<{ name: string; type: TypeRef }>;
	type: TypeRef;
}

function renderField(field: IntrospectedField): string {
	const args = (field.args ?? []).map((a) => `${a.name}: ${renderType(a.type)}`).join(", ");
	return `  ${field.name}${args ? `(${args})` : ""}: ${renderType(field.type)}`;
}

export async function runGraphQLCommand(opts: {
	query?: string;
	variablesJSON?: string;
	transport: GraphQLTransport;
}): Promise<CommandResult> {
	if (!opts.query) {
		return {
			stdout: "",
			stderr: "usage: trip2g-sync.mjs graphql '<query>' ['<variables json>']",
			exitCode: 2,
		};
	}

	let variables: Record<string, unknown> | undefined;
	if (opts.variablesJSON) {
		try {
			variables = JSON.parse(opts.variablesJSON) as Record<string, unknown>;
		} catch (err) {
			return { stdout: "", stderr: `invalid variables JSON: ${String(err)}`, exitCode: 2 };
		}
	}

	let response: GraphQLResponse;
	try {
		response = await opts.transport({ query: opts.query, variables });
	} catch (err) {
		return { stdout: "", stderr: String(err), exitCode: 1 };
	}

	// A GraphQL error is a failed command even when partial data comes back —
	// an agent must not read a half-applied mutation as success.
	if (response.errors?.length) {
		return {
			stdout: response.data ? JSON.stringify(response.data, null, 2) : "",
			stderr: response.errors.map((e) => e.message).join("\n"),
			exitCode: 1,
		};
	}

	return { stdout: JSON.stringify(response.data ?? null, null, 2), stderr: "", exitCode: 0 };
}

export async function runIntrospectCommand(opts: {
	typeName?: string;
	transport: GraphQLTransport;
}): Promise<CommandResult> {
	const names = opts.typeName ? [opts.typeName] : ROOT_TYPES;

	// One request per type keeps the payload small and the output readable.
	const sections: string[] = [];
	const missing: string[] = [];

	for (const name of names) {
		let response: GraphQLResponse;
		try {
			response = await opts.transport({
				query: `query($name: String!) { __type(name: $name) { name fields { name args { name type { ...TypeRef } } type { ...TypeRef } } } }${TYPE_REF}`,
				variables: { name },
			});
		} catch (err) {
			return { stdout: sections.join("\n\n"), stderr: String(err), exitCode: 1 };
		}

		if (response.errors?.length) {
			return {
				stdout: sections.join("\n\n"),
				stderr: response.errors.map((e) => e.message).join("\n"),
				exitCode: 1,
			};
		}

		const type = (response.data as { __type?: { name: string; fields?: IntrospectedField[] } } | undefined)
			?.__type;
		if (!type) {
			missing.push(name);
			continue;
		}

		const fields = (type.fields ?? []).map(renderField).join("\n");
		sections.push(`type ${type.name} {\n${fields}\n}`);
	}

	if (!sections.length) {
		return { stdout: "", stderr: `unknown type(s): ${missing.join(", ")}`, exitCode: 1 };
	}

	const note = missing.length ? `\n\n# not found: ${missing.join(", ")}` : "";
	return { stdout: `${sections.join("\n\n")}${note}`, stderr: "", exitCode: 0 };
}
