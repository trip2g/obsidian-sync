/**
 * GraphQL client factory for CLI tools.
 */

import { GraphQLClient } from "graphql-request";
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
	return getSdk(client);
}
