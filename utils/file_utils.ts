export function getExistingFile(root_path:URL, ...paths:(string|URL)[]):string|URL|null {
	try {
		const path = paths.shift();
		if (!path) return null;
		const abs_path = new URL(path, root_path);
		console.log("Get " + abs_path, path, root_path)
		Deno.openSync(abs_path)
		return abs_path;
	}
	catch {
		return paths.length ? getExistingFile(root_path, ...paths) : null;
	}
}

export function getExistingFileExclusive(root_path:URL, ...paths:(string|URL)[]):string|URL|null {
	const res = _getExistingFileExclusive(root_path, null, ...paths);
	if (res == 'invalid') throw new Error("found multiple matching paths for " + paths.join(", "));
	else return res;
}

// same as getExisting file, but throws an error, if multiple matching files where found
function _getExistingFileExclusive(root_path:URL, found:URL|null = null, ...paths:(string|URL)[]):string|URL|null|'invalid' {
	try {
		const path = paths.shift();
		if (!path) return found;
		const abs_path = new URL(path, root_path);
		Deno.openSync(abs_path)
		// file exists, but already found one
		if (found) return 'invalid'
		else return _getExistingFileExclusive(root_path, abs_path, ...paths);
	}
	catch {
		return _getExistingFileExclusive(root_path, found, ...paths);
	}
}