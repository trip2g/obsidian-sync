import * as fs from "fs";
import * as path from "path";
import { isSafeVaultPath } from "../utils";

export class PathOutsideVaultError extends Error {
	constructor(relativePath: string) {
		super(`Path is outside the vault: ${JSON.stringify(relativePath)}`);
		this.name = "PathOutsideVaultError";
	}
}

function realpathOfDeepestExisting(target: string): string {
	let current = target;
	for (;;) {
		try {
			return path.join(fs.realpathSync(current), path.relative(current, target));
		} catch (e) {
			const parent = path.dirname(current);
			if (parent === current || (e as NodeJS.ErrnoException).code !== "ENOENT") {
				throw e;
			}
			if (fs.lstatSync(current, { throwIfNoEntry: false })) {
				throw new PathOutsideVaultError(target);
			}
			current = parent;
		}
	}
}

function isInside(root: string, target: string): boolean {
	const relative = path.relative(root, target);
	return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

/**
 * Join a vault-relative path onto the vault folder and verify the result stays
 * inside it. Rejects absolute paths, `..` and hidden segments, NUL, and any path
 * whose deepest existing ancestor (or the file itself) resolves through a
 * symlink to a location outside the vault.
 */
export function safeJoin(folder: string, relativePath: string): string {
	if (!isSafeVaultPath(relativePath)) {
		throw new PathOutsideVaultError(relativePath);
	}

	const root = fs.realpathSync(folder);
	const fullPath = path.join(folder, relativePath);
	if (!isInside(root, realpathOfDeepestExisting(path.join(root, relativePath)))) {
		throw new PathOutsideVaultError(relativePath);
	}

	return fullPath;
}
