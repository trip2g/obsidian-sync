import { describe, it, expect, vi } from "vitest";
import {
	runGraphQLCommand,
	runIntrospectCommand,
	renderType,
	ROOT_TYPES,
	type GraphQLTransport,
} from "./graphql-cmd";

describe("renderType", () => {
	it("renders wrappers back into SDL", () => {
		expect(renderType({ kind: "SCALAR", name: "String" })).toBe("String");
		expect(renderType({ kind: "NON_NULL", name: null, ofType: { kind: "SCALAR", name: "Int" } })).toBe("Int!");
		expect(
			renderType({
				kind: "NON_NULL",
				name: null,
				ofType: {
					kind: "LIST",
					name: null,
					ofType: { kind: "NON_NULL", name: null, ofType: { kind: "OBJECT", name: "Note" } },
				},
			})
		).toBe("[Note!]!");
	});

	it("does not throw on a missing type", () => {
		expect(renderType(null)).toBe("?");
	});
});

describe("runGraphQLCommand", () => {
	it("prints data as JSON on success", async () => {
		const transport: GraphQLTransport = async () => ({ data: { viewer: { id: 7 } } });
		const result = await runGraphQLCommand({ query: "{viewer{id}}", transport });

		expect(result.exitCode).toBe(0);
		expect(JSON.parse(result.stdout)).toEqual({ viewer: { id: 7 } });
		expect(result.stderr).toBe("");
	});

	it("passes parsed variables to the transport", async () => {
		const transport = vi.fn<GraphQLTransport>(async () => ({ data: {} }));
		await runGraphQLCommand({
			query: "query($id:Int!){note(id:$id){id}}",
			variablesJSON: '{"id":42}',
			transport,
		});

		expect(transport).toHaveBeenCalledWith({
			query: "query($id:Int!){note(id:$id){id}}",
			variables: { id: 42 },
		});
	});

	it("requires a query", async () => {
		const result = await runGraphQLCommand({ transport: async () => ({ data: {} }) });

		expect(result.exitCode).toBe(2);
		expect(result.stderr).toContain("usage");
	});

	it("rejects malformed variables without calling the transport", async () => {
		const transport = vi.fn<GraphQLTransport>(async () => ({ data: {} }));
		const result = await runGraphQLCommand({ query: "{viewer{id}}", variablesJSON: "{oops", transport });

		expect(result.exitCode).toBe(2);
		expect(result.stderr).toContain("invalid variables JSON");
		expect(transport).not.toHaveBeenCalled();
	});

	// A partially applied mutation must not read as success to an agent.
	it("fails when the response carries GraphQL errors, even with partial data", async () => {
		const transport: GraphQLTransport = async () => ({
			data: { admin: null },
			errors: [{ message: "not an admin" }],
		});
		const result = await runGraphQLCommand({ query: "{admin{allApiKeys{nodes{id}}}}", transport });

		expect(result.exitCode).toBe(1);
		expect(result.stderr).toContain("not an admin");
		expect(JSON.parse(result.stdout)).toEqual({ admin: null });
	});

	it("reports a transport failure", async () => {
		const transport: GraphQLTransport = async () => {
			throw new Error("HTTP 401");
		};
		const result = await runGraphQLCommand({ query: "{viewer{id}}", transport });

		expect(result.exitCode).toBe(1);
		expect(result.stderr).toContain("HTTP 401");
	});
});

describe("runIntrospectCommand", () => {
	const fieldsFor = (name: string) => ({
		data: {
			__type: {
				name,
				fields: [
					{
						name: "publicUrl",
						args: [],
						type: { kind: "NON_NULL", name: null, ofType: { kind: "SCALAR", name: "String" } },
					},
					{
						name: "note",
						args: [{ name: "input", type: { kind: "SCALAR", name: "NoteInput" } }],
						type: { kind: "OBJECT", name: "PublicNote" },
					},
				],
			},
		},
	});

	it("renders a type as SDL", async () => {
		const result = await runIntrospectCommand({
			typeName: "Query",
			transport: async () => fieldsFor("Query"),
		});

		expect(result.exitCode).toBe(0);
		expect(result.stdout).toContain("type Query {");
		expect(result.stdout).toContain("  publicUrl: String!");
		expect(result.stdout).toContain("  note(input: NoteInput): PublicNote");
	});

	it("covers every root type when none is named", async () => {
		const seen: string[] = [];
		const result = await runIntrospectCommand({
			transport: async ({ variables }) => {
				const name = String(variables?.name);
				seen.push(name);
				return fieldsFor(name);
			},
		});

		expect(seen).toEqual(ROOT_TYPES);
		expect(result.exitCode).toBe(0);
	});

	it("reports an unknown type instead of printing an empty schema", async () => {
		const result = await runIntrospectCommand({
			typeName: "Nope",
			transport: async () => ({ data: { __type: null } }),
		});

		expect(result.exitCode).toBe(1);
		expect(result.stderr).toContain("Nope");
	});
});
