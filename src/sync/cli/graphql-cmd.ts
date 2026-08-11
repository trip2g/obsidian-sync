/**
 * `trip2g-sync graphql` — run a GraphQL query against the instance this vault
 * is already configured for.
 *
 * Calls travel the MCP lane (`/_system/mcp`, tools `graphql_request` and
 * `graphql_introspection`), not `/_system/graphql` directly: an API key only
 * carries admin rights over MCP, so this is the lane where admin queries and
 * mutations actually work.
 *
 * Exists for agents: the credentials are in .obsidian/plugins/trip2g/data.json
 * and the endpoint is derived from it, so nothing has to be assembled by hand.
 */

export interface GraphQLResponse {
	data?: unknown;
	errors?: Array<{ message: string }>;
}

/** Calls one MCP tool and returns its raw JSON-RPC result payload. */
export type MCPTransport = (call: {
	tool: string;
	args: Record<string, unknown>;
}) => Promise<{ result?: { structuredContent?: unknown; content?: Array<{ text?: string }> }; error?: { message: string } }>;

export interface CommandResult {
	stdout: string;
	stderr: string;
	exitCode: number;
}

/** Maps one MCP tool result onto the GraphQL response the caller expects. */
export function toGraphQLResponse(
	raw: Awaited<ReturnType<MCPTransport>>
): GraphQLResponse {
	// A rejected query surfaces as a JSON-RPC error, not as GraphQL `errors`.
	if (raw.error) return { errors: [{ message: raw.error.message }] };

	const structured = raw.result?.structuredContent;
	if (structured && typeof structured === "object") return structured as GraphQLResponse;

	const text = raw.result?.content?.[0]?.text;
	if (typeof text === "string") {
		try {
			return JSON.parse(text) as GraphQLResponse;
		} catch {
			return { data: text };
		}
	}

	return { errors: [{ message: "MCP returned neither structured content nor text" }] };
}

export async function runGraphQLCommand(opts: {
	query?: string;
	variablesJSON?: string;
	transport: MCPTransport;
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
		const raw = await opts.transport({
			tool: "graphql_request",
			args: variables ? { query: opts.query, variables } : { query: opts.query },
		});
		response = toGraphQLResponse(raw);
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

/**
 * Answers "what can I call here, and with what arguments?" without dumping the
 * whole schema: the server filters introspection by `pattern` and returns the
 * matching types with their fields and inputFields.
 */
export async function runIntrospectCommand(opts: {
	pattern?: string;
	transport: MCPTransport;
}): Promise<CommandResult> {
	if (!opts.pattern) {
		return {
			stdout: "",
			stderr: "usage: trip2g-sync.mjs graphql --introspect '<pattern>'   (e.g. AdminMutation, CreateUser)",
			exitCode: 2,
		};
	}

	let raw: Awaited<ReturnType<MCPTransport>>;
	try {
		raw = await opts.transport({ tool: "graphql_introspection", args: { pattern: opts.pattern } });
	} catch (err) {
		return { stdout: "", stderr: String(err), exitCode: 1 };
	}

	if (raw.error) return { stdout: "", stderr: raw.error.message, exitCode: 1 };

	const text = raw.result?.content?.[0]?.text;
	if (typeof text !== "string") {
		return { stdout: "", stderr: "introspection returned no content", exitCode: 1 };
	}

	try {
		return { stdout: JSON.stringify(JSON.parse(text), null, 2), stderr: "", exitCode: 0 };
	} catch {
		return { stdout: text, stderr: "", exitCode: 0 };
	}
}
