/**
 * Minimal GraphQL client for CLI usage.
 * Replaces graphql-request to eliminate external dependencies.
 */

export interface GraphQLClientOptions {
	headers?: Record<string, string>;
}

export interface RequestParams {
	document: { loc?: { source: { body: string } } } | string;
	variables?: Record<string, unknown>;
	requestHeaders?: Record<string, string>;
	signal?: AbortSignal;
}

export class GraphQLClient {
	constructor(
		private url: string,
		private options: GraphQLClientOptions = {}
	) {}

	async request<T>(params: RequestParams): Promise<T> {
		const query =
			typeof params.document === "string" ? params.document : params.document.loc?.source.body;

		if (!query) {
			throw new Error("Invalid GraphQL document: no query string found");
		}

		const response = await fetch(this.url, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				...this.options.headers,
				...params.requestHeaders,
			},
			body: JSON.stringify({ query, variables: params.variables }),
			signal: params.signal,
		});

		if (!response.ok) {
			const body = await response.text().catch(() => "");
			throw new Error(`HTTP ${response.status}: ${response.statusText}${body ? `\n${body}` : ""}`);
		}

		const json = (await response.json()) as {
			data?: T;
			errors?: Array<{
				message: string;
				path?: unknown;
				locations?: unknown;
				extensions?: unknown;
			}>;
		};

		if (json.errors?.length) {
			const summary = json.errors.map((e) => e.message).join("; ");
			const err = new Error(`GraphQL Error: ${summary}`) as Error & {
				graphqlErrors: typeof json.errors;
				response: typeof json;
			};
			err.graphqlErrors = json.errors;
			err.response = json;
			throw err;
		}

		if (!json.data) {
			throw new Error("GraphQL response missing data");
		}

		return json.data;
	}
}
