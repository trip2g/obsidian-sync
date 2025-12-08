import { Notice } from "obsidian";
import type { ServerNotePath, ServerNoteContent, NoteWithAssets, NoteContentWithAssets, RemoteAsset } from "./types";

export class SyncApi {
	constructor(
		private apiUrl: string,
		private apiKey: string,
		private pluginVersion: string
	) {}

	private async graphqlRequest<T>(query: string, variables?: Record<string, unknown>, silent = false): Promise<T | null> {
		try {
			const response = await fetch(`${this.apiUrl}/graphql`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"X-API-Key": this.apiKey,
					"X-Plugin-Version": this.pluginVersion,
				},
				body: JSON.stringify({ query, variables }),
			});

			if (!response.ok) {
				throw new Error(`HTTP error! status: ${response.status}`);
			}

			const data = await response.json();

			if (data.errors) {
				console.error("GraphQL errors:", data.errors);
				if (!silent) {
					new Notice(`GraphQL error: ${data.errors[0]?.message || "Unknown error"}`);
				}
				return null;
			}

			return data.data as T;
		} catch (error) {
			console.error("GraphQL request failed:", error);
			if (!silent) {
				new Notice(`API error: ${(error as Error).message}`);
			}
			return null;
		}
	}

	async fetchServerHashes(silent = false): Promise<Map<string, string>> {
		const query = `
			query {
				notePaths {
					path: value
					hash: latestContentHash
				}
			}
		`;

		const data = await this.graphqlRequest<{ notePaths: ServerNotePath[] }>(query, undefined, silent);
		const hashes = new Map<string, string>();

		if (data?.notePaths) {
			for (const item of data.notePaths) {
				if (item.path && item.hash) {
					hashes.set(item.path, item.hash);
				}
			}
		}

		return hashes;
	}

	async fetchNoteContent(path: string): Promise<string | null> {
		const result = await this.fetchNoteContentWithAssets(path);
		return result?.content ?? null;
	}

	async fetchNoteContentWithAssets(path: string): Promise<NoteContentWithAssets | null> {
		const query = `
			query($filter: NotePathsFilter) {
				notePaths(filter: $filter) {
					path: value
					latestNoteView {
						content
						assetReplaces {
							id
							url
							hash
						}
					}
				}
			}
		`;

		const variables = {
			filter: { like: path },
		};

		const data = await this.graphqlRequest<{
			notePaths: Array<{
				path: string;
				latestNoteView: {
					content: string;
					assetReplaces: RemoteAsset[];
				} | null;
			}>;
		}>(query, variables);

		const noteView = data?.notePaths?.[0]?.latestNoteView;
		if (noteView?.content !== undefined) {
			return {
				content: noteView.content,
				assets: noteView.assetReplaces || [],
			};
		}

		return null;
	}

	async fetchMultipleNoteContents(paths: string[]): Promise<Map<string, NoteContentWithAssets>> {
		const contents = new Map<string, NoteContentWithAssets>();

		// Fetch in parallel with batching to avoid overwhelming the server
		const batchSize = 5;
		for (let i = 0; i < paths.length; i += batchSize) {
			const batch = paths.slice(i, i + batchSize);
			const results = await Promise.all(batch.map((path) => this.fetchNoteContentWithAssets(path)));

			batch.forEach((path, index) => {
				const result = results[index];
				if (result !== null) {
					contents.set(path, result);
				}
			});
		}

		return contents;
	}

	async downloadAsset(url: string): Promise<ArrayBuffer | null> {
		try {
			const response = await fetch(url);
			if (!response.ok) {
				console.error(`Failed to download asset: ${response.status}`);
				return null;
			}
			return await response.arrayBuffer();
		} catch (error) {
			console.error(`Error downloading asset from ${url}:`, error);
			return null;
		}
	}

	async pushNotes(updates: Array<{ path: string; content: string }>): Promise<NoteWithAssets[]> {
		const query = `
			mutation PushNotes($input: PushNotesInput!) {
				pushNotes(input: $input) {
					... on ErrorPayload {
						message
					}
					... on PushNotesPayload {
						notes {
							id
							path
							assets {
								path
								sha256Hash
							}
						}
					}
				}
			}
		`;

		const variables = {
			input: { updates },
		};

		const data = await this.graphqlRequest<{
			pushNotes: { notes?: NoteWithAssets[]; message?: string };
		}>(query, variables);

		if (data?.pushNotes?.message) {
			new Notice(`Push error: ${data.pushNotes.message}`);
			return [];
		}

		return data?.pushNotes?.notes || [];
	}

	async hideNotes(paths: string[]): Promise<boolean> {
		const query = `
			mutation HideNotes($input: HideNotesInput!) {
				hideNotes(input: $input) {
					... on HideNotesPayload {
						success
					}
					... on ErrorPayload {
						message
					}
				}
			}
		`;

		const variables = {
			input: { paths },
		};

		const data = await this.graphqlRequest<{
			hideNotes: { success?: boolean; message?: string };
		}>(query, variables);

		if (data?.hideNotes?.message) {
			new Notice(`Hide error: ${data.hideNotes.message}`);
			return false;
		}

		return data?.hideNotes?.success || false;
	}

	async uploadAsset(
		noteId: string,
		assetBlob: Blob,
		fileName: string,
		relativePath: string,
		absolutePath: string,
		sha256Hash: string
	): Promise<boolean> {
		const operations = JSON.stringify({
			variables: {
				input: {
					file: null,
					noteId: noteId,
					sha256Hash: sha256Hash,
					path: relativePath,
					absolutePath: absolutePath,
				},
			},
			query: `mutation($input: UploadNoteAssetInput!) {
				uploadNoteAsset(input: $input) {
					... on ErrorPayload {
						__typename
						message
					}
					... on UploadNoteAssetPayload {
						__typename
						uploadSkipped
					}
				}
			}`,
		});

		const map = JSON.stringify({ "0": ["variables.input.file"] });

		const formData = new FormData();
		formData.append("operations", operations);
		formData.append("map", map);
		formData.append("0", assetBlob, fileName);

		try {
			const response = await fetch(`${this.apiUrl}/graphql`, {
				method: "POST",
				headers: {
					"X-API-Key": this.apiKey,
					"X-Plugin-Version": this.pluginVersion,
				},
				body: formData,
			});

			if (!response.ok) {
				throw new Error(`HTTP error! status: ${response.status}`);
			}

			const result = await response.json();
			if (result.errors) {
				console.error(`Asset upload error for ${relativePath}:`, result.errors);
				return false;
			}

			const payload = result.data?.uploadNoteAsset;
			if (payload?.__typename === "ErrorPayload") {
				new Notice(`Asset upload failed: ${payload.message}`);
				return false;
			}

			return true;
		} catch (error) {
			console.error(`Failed to upload asset ${relativePath}:`, error);
			return false;
		}
	}

	async testConnection(): Promise<string | null> {
		try {
			await this.fetchServerHashes();
			return null;
		} catch (error) {
			return (error as Error).message || "Unknown error";
		}
	}
}
