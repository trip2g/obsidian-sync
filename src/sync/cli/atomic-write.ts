import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";

/**
 * Replace a file's contents so that a reader, or the next run after a crash or
 * a full disk, sees either the old bytes or the new ones, never a prefix.
 *
 * The data goes to a temporary file in the same directory, is flushed, and is
 * renamed over the target; rename within one directory is atomic. The
 * temporary name starts with "." so the vault walk never picks it up as a note.
 * A symlinked target is resolved first, so the link itself survives.
 */
export function writeFileAtomic(filePath: string, data: string): void {
	const target = resolveTarget(filePath);
	const dir = path.dirname(target);
	const tmp = path.join(dir, `.${path.basename(target)}.${process.pid}.${crypto.randomBytes(6).toString("hex")}.tmp`);
	const mode = existingMode(target);

	try {
		const fd = fs.openSync(tmp, "wx", mode);
		try {
			fs.writeFileSync(fd, data, "utf-8");
			fs.fsyncSync(fd);
		} finally {
			fs.closeSync(fd);
		}
		fs.renameSync(tmp, target);
	} catch (e) {
		fs.rmSync(tmp, { force: true });
		throw e;
	}

	syncDirectory(dir);
}

function resolveTarget(filePath: string): string {
	try {
		return fs.realpathSync(filePath);
	} catch {
		return filePath;
	}
}

function existingMode(target: string): number {
	try {
		return fs.statSync(target).mode & 0o7777;
	} catch {
		return 0o666;
	}
}

// Persist the rename itself. Not every platform can open a directory
// (Windows cannot); there the rename is as durable as the OS makes it.
function syncDirectory(dir: string): void {
	let fd: number;
	try {
		fd = fs.openSync(dir, "r");
	} catch {
		return;
	}
	try {
		fs.fsyncSync(fd);
	} catch {
		// fsync on a directory is unsupported on some filesystems
	} finally {
		fs.closeSync(fd);
	}
}
