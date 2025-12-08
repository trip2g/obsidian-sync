import type { CodegenConfig } from "@graphql-codegen/cli";

const config: CodegenConfig = {
	schema: "http://localhost:8081/graphql",
	documents: ["src/operations.graphql"],
	generates: {
		"./src/graphql.ts": {
			plugins: [
				"typescript",
				"typescript-operations",
				"typescript-graphql-request",
			],
			config: {
				skipTypename: true,
				enumsAsTypes: true,
				rawRequest: false,
				scalars: {
					DateTime: "string",
					Upload: "File",
					Int64: "number",
					Time: "string",
				},
			},
		},
	},
	ignoreNoDocuments: true,
};

export default config;
