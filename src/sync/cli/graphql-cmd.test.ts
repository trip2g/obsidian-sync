import { describe, it, expect, vi } from "vitest";
import {
	runGraphQLCommand,
	runIntrospectCommand,
	toGraphQLResponse,
	type MCPTransport,
} from "./graphql-cmd";

const structured = (data: unknown) => ({ result: { structuredContent: { data } } });

describe("toGraphQLResponse", () => {
	it("takes structured content as the GraphQL response", () => {
		expect(toGraphQLResponse(structured({ publicUrl: "https://x" }))).toEqual({
			data: { publicUrl: "https://x" },
		});
	});

	// A rejected query comes back as a JSON-RPC error, not as GraphQL `errors`.
	it("turns a JSON-RPC error into a GraphQL error", () => {
		expect(toGraphQLResponse({ error: { message: "Cannot query field \"nope\"" } })).toEqual({
			errors: [{ message: 'Cannot query field "nope"' }],
		});
	});

	it("parses the text block when structured content is absent", () => {
		expect(toGraphQLResponse({ result: { content: [{ text: '{"data":{"ok":true}}' }] } })).toEqual({
			data: { ok: true },
		});
	});

	it("keeps unparseable text as data rather than losing it", () => {
		expect(toGraphQLResponse({ result: { content: [{ text: "plain" }] } })).toEqual({ data: "plain" });
	});

	it("reports an empty result instead of pretending success", () => {
		expect(toGraphQLResponse({ result: {} }).errors?.[0].message).toContain("neither structured");
	});
});

describe("runGraphQLCommand", () => {
	it("prints data as JSON on success", async () => {
		const transport: MCPTransport = async () => structured({ viewer: { id: 7 } });
		const result = await runGraphQLCommand({ query: "{viewer{id}}", transport });

		expect(result.exitCode).toBe(0);
		expect(JSON.parse(result.stdout)).toEqual({ viewer: { id: 7 } });
		expect(result.stderr).toBe("");
	});

	it("calls graphql_request with the query and parsed variables", async () => {
		const transport = vi.fn<MCPTransport>(async () => structured({}));
		await runGraphQLCommand({
			query: "query($id:Int!){note(id:$id){id}}",
			variablesJSON: '{"id":42}',
			transport,
		});

		expect(transport).toHaveBeenCalledWith({
			tool: "graphql_request",
			args: { query: "query($id:Int!){note(id:$id){id}}", variables: { id: 42 } },
		});
	});

	it("omits variables entirely when none are given", async () => {
		const transport = vi.fn<MCPTransport>(async () => structured({}));
		await runGraphQLCommand({ query: "{viewer{id}}", transport });

		expect(transport).toHaveBeenCalledWith({
			tool: "graphql_request",
			args: { query: "{viewer{id}}" },
		});
	});

	it("requires a query", async () => {
		const result = await runGraphQLCommand({ transport: async () => structured({}) });

		expect(result.exitCode).toBe(2);
		expect(result.stderr).toContain("usage");
	});

	it("rejects malformed variables without calling the transport", async () => {
		const transport = vi.fn<MCPTransport>(async () => structured({}));
		const result = await runGraphQLCommand({ query: "{viewer{id}}", variablesJSON: "{oops", transport });

		expect(result.exitCode).toBe(2);
		expect(result.stderr).toContain("invalid variables JSON");
		expect(transport).not.toHaveBeenCalled();
	});

	// A partially applied mutation must not read as success to an agent.
	it("fails on GraphQL errors while still printing partial data", async () => {
		const transport: MCPTransport = async () => ({
			result: { structuredContent: { data: { admin: null }, errors: [{ message: "not an admin" }] } },
		});
		const result = await runGraphQLCommand({ query: "{admin{allApiKeys{nodes{id}}}}", transport });

		expect(result.exitCode).toBe(1);
		expect(result.stderr).toContain("not an admin");
		expect(JSON.parse(result.stdout)).toEqual({ admin: null });
	});

	it("reports a transport failure", async () => {
		const transport: MCPTransport = async () => {
			throw new Error("HTTP 401");
		};
		const result = await runGraphQLCommand({ query: "{viewer{id}}", transport });

		expect(result.exitCode).toBe(1);
		expect(result.stderr).toContain("HTTP 401");
	});
});

describe("runIntrospectCommand", () => {
	const payload = JSON.stringify({
		data: { __schema: { types: [{ kind: "INPUT_OBJECT", name: "CreateAdminInput" }] } },
	});

	it("passes the pattern to graphql_introspection and pretty-prints the result", async () => {
		const transport = vi.fn<MCPTransport>(async () => ({ result: { content: [{ text: payload }] } }));
		const result = await runIntrospectCommand({ pattern: "CreateAdminInput", transport });

		expect(transport).toHaveBeenCalledWith({
			tool: "graphql_introspection",
			args: { pattern: "CreateAdminInput" },
		});
		expect(result.exitCode).toBe(0);
		expect(result.stdout).toContain("CreateAdminInput");
		expect(result.stdout).toContain("\n  "); // pretty-printed, not one line
	});

	it("requires a pattern", async () => {
		const result = await runIntrospectCommand({ transport: async () => ({ result: {} }) });

		expect(result.exitCode).toBe(2);
		expect(result.stderr).toContain("usage");
	});

	it("surfaces a JSON-RPC error", async () => {
		const result = await runIntrospectCommand({
			pattern: "Nope",
			transport: async () => ({ error: { message: "pattern is required" } }),
		});

		expect(result.exitCode).toBe(1);
		expect(result.stderr).toContain("pattern is required");
	});

	it("fails when the tool returns no content", async () => {
		const result = await runIntrospectCommand({ pattern: "X", transport: async () => ({ result: {} }) });

		expect(result.exitCode).toBe(1);
		expect(result.stderr).toContain("no content");
	});
});
