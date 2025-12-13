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
	// Cast to any - our minimal client implements the same interface
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	return getSdk(client as any);
}
