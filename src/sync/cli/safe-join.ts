import * as fs from "fs";
import * as path from "path";
import { isSafeVaultPath, isServiceSegment } from "../utils";

export class PathOutsideVaultError extends Error {
	constructor(relativePath: string) {
		super(`Path is outside the vault: ${JSON.stringify(relativePath)}`);
		this.name = "PathOutsideVaultError";
	}
}

const realpath = process.platform === "win32" ? fs.realpathSync.native : fs.realpathSync;

function realpathOfDeepestExisting(target: string): string {
	let current = target;
	for (;;) {
		try {
			return path.join(realpath(current), path.relative(current, target));
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

function isInsideAndNotService(root: string, target: string): boolean {
	const relative = path.relative(root, target);
	if (relative === "") {
		return true;
	}
	if (relative.startsWith("..") || path.isAbsolute(relative)) {
		return false;
	}
	return !relative.split(path.sep).some(isServiceSegment);
}

/**
 * Join a vault-relative path onto the vault folder and verify the result stays
 * inside it. Rejects absolute paths, `..` and service segments, NUL, and any path
 * whose deepest existing ancestor (or the file itself) resolves through a
 * symlink to a location outside the vault or into a service folder.
 */
export function safeJoin(folder: string, relativePath: string): string {
	if (!isSafeVaultPath(relativePath)) {
		throw new PathOutsideVaultError(relativePath);
	}

	const root = realpath(folder);
	const fullPath = path.join(folder, relativePath);
	if (!isInsideAndNotService(root, realpathOfDeepestExisting(path.join(root, relativePath)))) {
		throw new PathOutsideVaultError(relativePath);
	}

	return fullPath;
}
