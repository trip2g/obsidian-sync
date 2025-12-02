import { App, MarkdownPostProcessorContext, MarkdownView, editorLivePreviewField } from "obsidian";
import * as pako from "pako";
import { EditorView, Decoration, DecorationSet, ViewPlugin, ViewUpdate, WidgetType } from "@codemirror/view";
import { RangeSetBuilder, StateEffect, StateField, Prec } from "@codemirror/state";
import { syntaxTree } from "@codemirror/language";

// Import lottie-player only if not already registered
if (!customElements.get("lottie-player")) {
	import("@lottiefiles/lottie-player");
}

// StateEffect to force decoration refresh
const forceRefreshEffect = StateEffect.define<null>();

interface EmojiCache {
	[id: string]: string; // id -> base64Uri
}

// Widget for static WEBP emojis
class StaticEmojiWidget extends WidgetType {
	constructor(private emojiId: string, private base64Uri: string) {
		super();
	}

	toDOM(): HTMLElement {
		const img = document.createElement("img");
		img.src = this.base64Uri;
		img.style.width = "20px";
		img.style.height = "20px";
		img.style.verticalAlign = "middle";
		img.style.display = "inline";
		return img;
	}
}

// Widget for WEBM video emojis
class VideoEmojiWidget extends WidgetType {
	constructor(private emojiId: string, private base64Uri: string) {
		super();
	}

	toDOM(): HTMLElement {
		const video = document.createElement("video");
		video.src = this.base64Uri;
		video.autoplay = true;
		video.loop = true;
		video.muted = true;
		video.playsInline = true;
		video.style.width = "20px";
		video.style.height = "20px";
		video.style.verticalAlign = "middle";
		video.style.display = "inline";
		return video;
	}
}

// Widget for TGS Lottie emojis
class LottieEmojiWidget extends WidgetType {
	constructor(private emojiId: string, private base64Uri: string) {
		super();
	}

	toDOM(): HTMLElement {
		try {
			// Extract and decompress TGS
			const base64Data = this.base64Uri.substring("data:application/x-tgs;base64,".length);
			const binaryString = atob(base64Data);
			const bytes = new Uint8Array(binaryString.length);
			for (let i = 0; i < binaryString.length; i++) {
				bytes[i] = binaryString.charCodeAt(i);
			}

			const decompressed = pako.ungzip(bytes, { to: "string" });
			const lottieData = JSON.parse(decompressed);
			delete lottieData.tgs;

			// Create lottie-player
			const lottiePlayer = document.createElement("lottie-player");
			lottiePlayer.setAttribute("autoplay", "");
			lottiePlayer.setAttribute("loop", "");
			lottiePlayer.setAttribute("mode", "normal");
			lottiePlayer.style.width = "20px";
			lottiePlayer.style.height = "20px";
			lottiePlayer.style.display = "inline";
			lottiePlayer.style.verticalAlign = "middle";

			(lottiePlayer as any).load(lottieData);

			return lottiePlayer;
		} catch (error) {
			console.error(`Error loading TGS in live preview:`, error);
			const span = document.createElement("span");
			span.textContent = "🎬";
			return span;
		}
	}
}

export class TelegramEmojiManager {
	private app: App;
	private apiUrl: string;
	private apiKey: string;
	private cache: EmojiCache = {};
	private pendingRequests: Map<string, Promise<void>> = new Map();

	constructor(app: App, apiUrl: string, apiKey: string) {
		this.app = app;
		this.apiUrl = apiUrl;
		this.apiKey = apiKey;
	}

	/**
	 * Register markdown post processor for reading view
	 * Note: Live Preview не поддерживается для кастомных протоколов изображений
	 * потому что Obsidian сам рендерит изображения и Decoration.replace не может их перекрыть
	 */
	register(plugin: any): void {
		// Register for reading view
		plugin.registerMarkdownPostProcessor(async (el: HTMLElement, ctx: MarkdownPostProcessorContext) => {
			await this.processElement(el);
		});

		// TODO: Live Preview support requires different approach
		// Decoration.replace doesn't work because Obsidian already renders images as HTML
		// Possible solutions:
		// 1. Hook into Obsidian's image rendering pipeline
		// 2. Use custom protocol handler
		// 3. Wait for Obsidian API updates
	}

	/**
	 * Create CodeMirror editor extension for live preview
	 */
	private createEditorExtension() {
		const cache = this.cache;
		const fetchMissing = this.fetchMissingEmojies.bind(this);
		const editorViews = this.editorViews;

		return ViewPlugin.fromClass(
			class {
				decorations: DecorationSet;
				view: EditorView;

				constructor(view: EditorView) {
					this.view = view;
					// Register this view
					editorViews.add(view);
					this.decorations = this.buildDecorations(view);
				}

				update(update: ViewUpdate) {
					// Check if we have forceRefreshEffect
					const hasRefreshEffect = update.transactions.some((tr) =>
						tr.effects.some((e) => e.is(forceRefreshEffect))
					);

					if (update.docChanged || update.viewportChanged || hasRefreshEffect) {
						this.decorations = this.buildDecorations(update.view);
					}
				}

				destroy() {
					// Unregister this view
					editorViews.delete(this.view);
				}

				buildDecorations(view: EditorView): DecorationSet {
					// Only render in Live Preview mode, not in Source mode
					if (!view.state.field(editorLivePreviewField)) {
						return Decoration.none;
					}

					const builder = new RangeSetBuilder<Decoration>();
					const emojiIds: string[] = [];
					const { viewport } = view;

					// Iterate through viewport
					syntaxTree(view.state).iterate({
						from: viewport.from,
						to: viewport.to,
						enter: (node) => {
							// Look for URL nodes that contain tg://emoji
							if (node.type.name === "URL" || node.type.name === "string_url") {
								const text = view.state.doc.sliceString(node.from, node.to);
								const urlMatch = text.match(/tg:\/\/emoji\?id=(\d+)/);

								if (urlMatch) {
									const emojiId = urlMatch[1];

									// Expand to include full image syntax ![emoji](...)
									const fullText = view.state.doc.sliceString(
										Math.max(0, node.from - 20),
										Math.min(view.state.doc.length, node.to + 5)
									);
									const fullMatch = fullText.match(/!\[.*?\]\(tg:\/\/emoji\?id=(\d+)\)/);

									if (fullMatch) {
										const imageStart = Math.max(0, node.from - 20) + fullText.indexOf(fullMatch[0]);
										const imageEnd = imageStart + fullMatch[0].length;

										emojiIds.push(emojiId);

										const base64Uri = cache[emojiId];

										if (base64Uri) {
											let widget: WidgetType;

											if (base64Uri.startsWith("data:application/x-tgs;base64,")) {
												widget = new LottieEmojiWidget(emojiId, base64Uri);
											} else if (base64Uri.startsWith("data:video/webm;base64,")) {
												widget = new VideoEmojiWidget(emojiId, base64Uri);
											} else {
												widget = new StaticEmojiWidget(emojiId, base64Uri);
											}

											builder.add(
												imageStart,
												imageEnd,
												Decoration.replace({
													widget: widget,
												})
											);
										}
									}
								}
							}
						},
					});

					// Fetch missing emojies
					if (emojiIds.length > 0) {
						fetchMissing(emojiIds).catch((err: any) => {
							console.error("Error fetching emojies for live preview:", err);
						});
					}

					return builder.finish();
				}
			},
			{
				decorations: (v) => v.decorations,
			}
		);
	}

	/**
	 * Process element and replace telegram emoji images
	 */
	private async processElement(el: HTMLElement): Promise<void> {
		// Find all img elements with tg://emoji src
		const emojiImages = el.querySelectorAll('img[src^="tg://emoji"]');

		if (emojiImages.length === 0) {
			return;
		}

		// Extract emoji IDs
		const emojiIds: string[] = [];
		for (const img of emojiImages) {
			const src = img.getAttribute("src");
			if (!src) continue;

			const match = src.match(/tg:\/\/emoji\?id=(\d+)/);
			if (match) {
				emojiIds.push(match[1]);
			}
		}

		if (emojiIds.length === 0) {
			return;
		}

		// Fetch missing emojies
		await this.fetchMissingEmojies(emojiIds);

		// Replace images
		for (const img of emojiImages) {
			const src = img.getAttribute("src");
			if (!src) continue;

			const match = src.match(/tg:\/\/emoji\?id=(\d+)/);
			if (!match) continue;

			const emojiId = match[1];
			const base64Uri = this.cache[emojiId];

			if (base64Uri) {
				this.replaceImage(img as HTMLImageElement, emojiId, base64Uri);
			}
		}
	}

	/**
	 * Replace img element based on emoji type
	 */
	private replaceImage(img: HTMLImageElement, emojiId: string, base64Uri: string): void {
		if (base64Uri.startsWith("data:application/x-tgs;base64,")) {
			// TGS (Lottie) animation
			this.replaceTgsSticker(img, emojiId, base64Uri);
		} else if (base64Uri.startsWith("data:video/webm;base64,")) {
			// WEBM video
			this.replaceWebmSticker(img, emojiId, base64Uri);
		} else {
			// Static WEBP image
			img.src = base64Uri;
			img.style.width = "20px";
			img.style.height = "20px";
			img.style.display = "inline-block";
			img.style.verticalAlign = "middle";
		}
	}

	/**
	 * Replace img with video element for WEBM
	 */
	private replaceWebmSticker(img: HTMLImageElement, emojiId: string, base64Uri: string): void {
		const video = document.createElement("video");
		video.src = base64Uri;
		video.autoplay = true;
		video.loop = true;
		video.muted = true;
		video.playsInline = true;
		video.style.width = "20px";
		video.style.height = "20px";
		video.style.display = "inline-block";
		video.style.verticalAlign = "middle";

		img.parentNode?.replaceChild(video, img);
	}

	/**
	 * Replace img with lottie-player for TGS
	 * Uses logic from tgs-player to handle TGS format
	 */
	private replaceTgsSticker(img: HTMLImageElement, emojiId: string, base64Uri: string): void {
		try {
			// Extract and decompress TGS
			const base64Data = base64Uri.substring("data:application/x-tgs;base64,".length);
			const binaryString = atob(base64Data);
			const bytes = new Uint8Array(binaryString.length);
			for (let i = 0; i < binaryString.length; i++) {
				bytes[i] = binaryString.charCodeAt(i);
			}

			const decompressed = pako.ungzip(bytes, { to: "string" });
			const lottieData = JSON.parse(decompressed);

			// Remove "tgs" attribute from JSON (tgs-player logic)
			delete lottieData.tgs;

			// Create lottie-player
			const lottiePlayer = document.createElement("lottie-player");
			lottiePlayer.setAttribute("autoplay", "");
			lottiePlayer.setAttribute("loop", "");
			lottiePlayer.setAttribute("mode", "normal");
			lottiePlayer.style.width = "20px";
			lottiePlayer.style.height = "20px";
			lottiePlayer.style.display = "inline-block";
			lottiePlayer.style.verticalAlign = "middle";

			// Load animation data
			(lottiePlayer as any).load(lottieData);

			img.parentNode?.replaceChild(lottiePlayer, img);
		} catch (error) {
			console.error(`Error loading TGS sticker ${emojiId}:`, error);
		}
	}

	/**
	 * Fetch missing emojies from server
	 */
	private async fetchMissingEmojies(ids: string[]): Promise<void> {
		const missingIds = ids.filter((id) => !this.cache[id]);

		if (missingIds.length === 0) {
			return;
		}

		// Check if already fetching these IDs
		const cacheKey = missingIds.sort().join(",");
		if (this.pendingRequests.has(cacheKey)) {
			await this.pendingRequests.get(cacheKey);
			return;
		}

		// Create new request
		const requestPromise = this.fetchEmojiesFromServer(missingIds);
		this.pendingRequests.set(cacheKey, requestPromise);

		try {
			await requestPromise;
		} finally {
			this.pendingRequests.delete(cacheKey);
		}
	}

	/**
	 * Fetch emojies from GraphQL server
	 */
	private async fetchEmojiesFromServer(ids: string[]): Promise<void> {
		const query = `
			query GetTelegramCustomEmojies($filter: TelegramCustomEmojiesFilter!) {
				telegramCustomEmojies(filter: $filter) {
					id
					base64Uri
				}
			}
		`;

		const variables = {
			filter: {
				ids: ids,
			},
		};

		try {
			const response = await fetch(`${this.apiUrl}/graphql`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"X-API-Key": this.apiKey,
				},
				body: JSON.stringify({ query, variables }),
			});

			if (!response.ok) {
				console.error(`HTTP error! status: ${response.status}`);
				return;
			}

			const result = await response.json();

			if (result.errors) {
				console.error("GraphQL errors fetching Telegram emojies:", result.errors);
				return;
			}

			const emojies = result.data?.telegramCustomEmojies || [];

			// Update cache
			for (const emoji of emojies) {
				this.cache[emoji.id] = emoji.base64Uri;
			}

			// Force update all editor views
			this.refreshEditorViews();
		} catch (error) {
			console.error("Error fetching Telegram emojies:", error);
		}
	}

	/**
	 * Force refresh all editor views to show newly loaded emojies
	 */
	private refreshEditorViews(): void {
		for (const view of this.editorViews) {
			// Dispatch transaction with forceRefreshEffect to trigger decoration rebuild
			view.dispatch({
				effects: forceRefreshEffect.of(null)
			});
		}
	}

	/**
	 * Cleanup
	 */
	cleanup(): void {
		this.cache = {};
		this.pendingRequests.clear();
		this.editorViews.clear();
	}
}
