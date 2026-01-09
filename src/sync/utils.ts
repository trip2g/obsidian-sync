/**
 * Check if a file should always be publishable regardless of publishFields setting.
 * 
 * Currently includes:
 * - HTML files from _layouts/ directory (templates and layouts)
 * 
 * @param path - File path relative to sync folder
 * @returns true if file should always be published
 */
export function isAlwaysPublishable(path: string): boolean {
	// HTML files from _layouts/ are always publishable (templates/layouts)
	// Includes both .html and .html.json (JSON layout format)
	if (path.startsWith("_layouts/") && (path.endsWith(".html") || path.endsWith(".html.json"))) {
		return true;
	}

	return false;
}
