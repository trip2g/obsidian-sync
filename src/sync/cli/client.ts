/**
 * GraphQL client factory for CLI tools.
 * Uses minimal GraphQL client instead of graphql-request.
 */

import { GraphQLClient } from "./graphql-client";
import { getSdk, type Sdk } from "../../graphql";

export interface ClientOptions {
	apiUrl: string;
	apiKey: string;
}

export function createClient(options: ClientOptions): Sdk {
	const client = new GraphQLClient(options.apiUrl, {
		headers: {
			"X-API-Key": options.apiKey,
		},
	});
	// Our minimal client implements the subset of GraphQLClient that getSdk calls.
	return getSdk(client as unknown as Parameters<typeof getSdk>[0]);
}
