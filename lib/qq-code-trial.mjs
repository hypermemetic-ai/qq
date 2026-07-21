import {
	closeSync,
	constants as fsConstants,
	fchmodSync,
	fstatSync,
	linkSync,
	lstatSync,
	mkdirSync,
	openSync,
	readFileSync,
	realpathSync,
	unlinkSync,
	writeFileSync,
} from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import { homedir } from "node:os";
import { registerHooks } from "node:module";
import {
	dirname,
	isAbsolute,
	join,
	parse,
	resolve,
	sep,
} from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const TRIAL_ID = "T-135/pi-code-tool/2026-07-21/v1";
export const LEDGER_SCHEMA = "qq.pi-code-tool-trial/v1";
export const ACTIVATION_SCHEMA = "qq.pi-code-tool-trial-activation/v1";
export const SCHEDULE_VERSION = 1;
export const PACKAGE_NAME = "pi-code-tool";
export const PACKAGE_VERSION = "0.6.1";
export const PACKAGE_INTEGRITY =
	"sha512-IjPo1o5+jjm2KC8IFE2NiXFGY/BCj3L9O4Fi/xqFbovJ6aUmxV7KkMX3YDqY2bBjAVt+2oqtVunJcxDhT7sg6Q==";
export const LIMITS = Object.freeze({
	maxDurationSecs: 5,
	maxMemory: 64 * 1024 * 1024,
});

const ACTIVATION_LEAF = "t135-pi-code-tool-v1.active.json";
const LEDGER_LEAF = "t135-pi-code-tool-v1.jsonl";
const LOCK_LEAF = "t135-pi-code-tool-v1.lock";
const WRITER_LEAF = "t135-pi-code-tool-v1.writer.json";
const LOCK_SCHEMA = "qq.pi-code-tool-trial-lock/v1";
const WRITER_SCHEMA = "qq.pi-code-tool-trial-writer/v1";
const FILE_MODE = 0o600;
const DIR_MODE = 0o700;
const NOFOLLOW = fsConstants.O_NOFOLLOW ?? 0;
const CLAIM_STAT = Symbol("claimStat");

export class TrialEvidenceError extends Error {
	constructor(message) {
		super(message);
		this.name = "TrialEvidenceError";
	}
}

function fail(message) {
	throw new TrialEvidenceError(message);
}

function sha256(value) {
	return createHash("sha256").update(value).digest("hex");
}

export function digest(value) {
	return sha256(value);
}

export function armForIndex(index) {
	if (!Number.isSafeInteger(index) || index < 1) {
		fail(`assignment index must be a positive integer, got ${index}`);
	}
	const pair = Math.ceil(index / 2);
	const treatmentFirst = Number.parseInt(sha256(`${TRIAL_ID}:${pair}`)[0], 16) % 2 === 1;
	const first = treatmentFirst ? "treatment" : "control";
	if (index % 2 === 1) return first;
	return first === "treatment" ? "control" : "treatment";
}

function defaultStateBase(env) {
	if (env.XDG_STATE_HOME) return env.XDG_STATE_HOME;
	const home = env.HOME || homedir();
	return join(home, ".local", "state");
}

export function statePaths({ env = process.env, repositoryRoot } = {}) {
	const base = defaultStateBase(env);
	if (!isAbsolute(base)) fail("XDG_STATE_HOME must be an absolute path");
	const root = resolve(base, "qq");
	if (repositoryRoot) {
		const repository = resolve(repositoryRoot);
		if (root === repository || root.startsWith(repository + sep)) {
			fail("trial state must not be stored inside the repository worktree");
		}
	}
	return {
		root,
		activation: join(root, ACTIVATION_LEAF),
		ledger: join(root, LEDGER_LEAF),
		lock: join(root, LOCK_LEAF),
		writer: join(root, WRITER_LEAF),
	};
}

function isMissing(error) {
	return error && typeof error === "object" && error.code === "ENOENT";
}

function safeDirectory(path, { create = false } = {}) {
	const absolute = resolve(path);
	const { root } = parse(absolute);
	let current = root;
	for (const component of absolute.slice(root.length).split(sep).filter(Boolean)) {
		current = join(current, component);
		let stat;
		try {
			stat = lstatSync(current);
		} catch (error) {
			if (!isMissing(error)) throw error;
			if (!create) return false;
			try {
				mkdirSync(current, { mode: DIR_MODE });
			} catch (mkdirError) {
				if (!mkdirError || mkdirError.code !== "EEXIST") throw mkdirError;
			}
			stat = lstatSync(current);
		}
		if (stat.isSymbolicLink() || !stat.isDirectory()) {
			fail(`unsafe trial state directory component: ${current}`);
		}
	}
	if (realpathSync.native(absolute) !== absolute) {
		fail(`trial state directory escaped through a symlink: ${absolute}`);
	}
	return true;
}

function assertPrivateRegular(stat, path) {
	if (!stat.isFile() || stat.isSymbolicLink()) {
		fail(`unsafe trial state leaf (expected a regular file): ${path}`);
	}
	if ((stat.mode & 0o777) !== FILE_MODE) {
		fail(`unsafe trial state permissions (expected mode 600): ${path}`);
	}
	if (typeof process.geteuid === "function" && stat.uid !== process.geteuid()) {
		fail(`unsafe trial state owner: ${path}`);
	}
}

function openPrivateExisting(path, flags) {
	const before = lstatSync(path);
	assertPrivateRegular(before, path);
	const fd = openSync(path, flags | NOFOLLOW);
	try {
		const after = fstatSync(fd);
		assertPrivateRegular(after, path);
		if (before.dev !== after.dev || before.ino !== after.ino) {
			fail(`trial state leaf changed while opening: ${path}`);
		}
		return fd;
	} catch (error) {
		closeSync(fd);
		throw error;
	}
}

function readPrivateLeaf(path) {
	const fd = openPrivateExisting(path, fsConstants.O_RDONLY);
	try {
		return readFileSync(fd, "utf8");
	} finally {
		closeSync(fd);
	}
}

function writePrivateLeafExclusive(path, value) {
	const fd = openSync(
		path,
		fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_EXCL | NOFOLLOW,
		FILE_MODE,
	);
	try {
		fchmodSync(fd, FILE_MODE);
		assertPrivateRegular(fstatSync(fd), path);
		writeFileSync(fd, value, "utf8");
	} finally {
		closeSync(fd);
	}
}

function openLedgerForAppend(path) {
	try {
		const fd = openSync(
			path,
			fsConstants.O_WRONLY |
				fsConstants.O_APPEND |
				fsConstants.O_CREAT |
				fsConstants.O_EXCL |
				NOFOLLOW,
			FILE_MODE,
		);
		fchmodSync(fd, FILE_MODE);
		assertPrivateRegular(fstatSync(fd), path);
		return fd;
	} catch (error) {
		if (!error || error.code !== "EEXIST") throw error;
		return openPrivateExisting(path, fsConstants.O_WRONLY | fsConstants.O_APPEND);
	}
}

function appendRecordUnlocked(paths, record) {
	const fd = openLedgerForAppend(paths.ledger);
	try {
		writeFileSync(fd, `${JSON.stringify(record)}\n`, "utf8");
	} finally {
		closeSync(fd);
	}
}

function publishLockClaim(paths) {
	const temporary = join(paths.root, `.${LOCK_LEAF}.${randomUUID()}.tmp`);
	try {
		writePrivateLeafExclusive(temporary, `${JSON.stringify({
			schema: LOCK_SCHEMA,
			pid: process.pid,
			claimed_at: new Date().toISOString(),
		})}\n`);
		const temporaryStat = lstatSync(temporary);
		assertPrivateRegular(temporaryStat, temporary);
		linkSync(temporary, paths.lock);
		const lockStat = lstatSync(paths.lock);
		assertPrivateRegular(lockStat, paths.lock);
		if (lockStat.dev !== temporaryStat.dev || lockStat.ino !== temporaryStat.ino) {
			fail(`trial writer lock changed while publishing: ${paths.lock}`);
		}
		return lockStat;
	} finally {
		try {
			unlinkSync(temporary);
		} catch (error) {
			if (!isMissing(error)) throw error;
		}
	}
}

function withWriterLock(paths, callback) {
	safeDirectory(paths.root, { create: true });
	let lockStat;
	while (lockStat === undefined) {
		try {
			lockStat = publishLockClaim(paths);
		} catch (error) {
			if (!error || error.code !== "EEXIST") throw error;
			const lock = readLock(paths);
			if (!lock) continue;
			if (processIsAlive(lock.pid)) fail(`trial writer lock is already held by live pid ${lock.pid}: ${paths.lock}`);
			unlinkClaim(paths.lock, lock);
		}
	}
	try {
		return callback();
	} finally {
		try {
			const current = lstatSync(paths.lock);
			if (current.dev !== lockStat.dev || current.ino !== lockStat.ino) {
				fail(`trial writer lock changed while held: ${paths.lock}`);
			}
			unlinkSync(paths.lock);
		} catch (error) {
			if (!isMissing(error)) throw error;
		}
	}
}

function parseJson(text, label) {
	try {
		return JSON.parse(text);
	} catch {
		fail(`corrupt JSON in ${label}`);
	}
}

function exactKeys(record, allowed, label) {
	for (const key of Object.keys(record)) {
		if (!allowed.has(key)) fail(`unexpected ${label} field: ${key}`);
	}
}

function requireString(record, key, label, { nullable = false } = {}) {
	if (nullable && record[key] === null) return;
	if (typeof record[key] !== "string") fail(`${label}.${key} must be a string`);
}

function requireNumber(record, key, label) {
	if (typeof record[key] !== "number" || !Number.isFinite(record[key]) || record[key] < 0) {
		fail(`${label}.${key} must be a non-negative number`);
	}
}

function requireInteger(record, key, label) {
	requireNumber(record, key, label);
	if (!Number.isSafeInteger(record[key])) fail(`${label}.${key} must be an integer`);
}

function validateTimestamp(value, label) {
	if (typeof value !== "string" || Number.isNaN(Date.parse(value))) {
		fail(`${label} must be an ISO timestamp`);
	}
}

const COMMON = new Set(["schema", "event", "trial_id", "at"]);
const ACTIVATED_KEYS = new Set([
	...COMMON,
	"seed",
	"schedule_version",
	"package_name",
	"package_version",
	"package_integrity",
]);
const ASSIGNMENT_KEYS = new Set([
	...COMMON,
	"index",
	"pair",
	"pair_position",
	"arm",
	"seed",
	"schedule_version",
	"input_sha256",
	"input_chars",
	"image_count",
	"source",
	"session_id",
	"session_file_sha256",
	"t127_join_key",
	"provider",
	"model",
]);
const EXPOSURE_KEYS = new Set([
	...COMMON,
	"index",
	"arm",
	"active_tools_sha256",
	"code_active",
	"package_version",
]);
const OUTCOME_KEYS = new Set([
	...COMMON,
	"index",
	"arm",
	"status",
	"terminal_reason",
	"active_wall_ms",
	"agent_runs",
	"model_turns",
	"direct_tool_calls",
	"total_tool_calls",
	"tool_failures",
	"code_invocations",
	"code_inner_calls",
	"code_failures",
	"operator_interruptions",
	"queued_followups",
	"usage_input",
	"usage_output",
	"usage_cache_read",
	"usage_cache_write",
	"approval_requests",
	"approvals",
	"denials",
	"suspensions",
	"prompt_code_selected",
	"prompt_code_snippet",
]);
const DEACTIVATED_KEYS = new Set([...COMMON, "reason", "record_count", "prior_ledger_sha256"]);

function validateCommon(record, event) {
	if (!record || typeof record !== "object" || Array.isArray(record)) fail("ledger record must be an object");
	if (record.schema !== LEDGER_SCHEMA) fail("ledger schema mismatch");
	if (record.event !== event) fail(`ledger event mismatch: expected ${event}`);
	if (record.trial_id !== TRIAL_ID) fail("ledger trial id mismatch");
	validateTimestamp(record.at, `${event}.at`);
}

function validateActivated(record) {
	validateCommon(record, "activated");
	exactKeys(record, ACTIVATED_KEYS, "activated");
	if (record.seed !== TRIAL_ID || record.schedule_version !== SCHEDULE_VERSION) fail("activation schedule mismatch");
	if (
		record.package_name !== PACKAGE_NAME ||
		record.package_version !== PACKAGE_VERSION ||
		record.package_integrity !== PACKAGE_INTEGRITY
	) fail("activation package pin mismatch");
}

function validateAssignment(record, expectedIndex) {
	validateCommon(record, "assignment");
	exactKeys(record, ASSIGNMENT_KEYS, "assignment");
	requireInteger(record, "index", "assignment");
	if (record.index !== expectedIndex) fail(`assignment indexes are not contiguous at ${expectedIndex}`);
	if (record.pair !== Math.ceil(record.index / 2)) fail(`assignment ${record.index} has the wrong pair`);
	if (record.pair_position !== (record.index % 2 === 1 ? 1 : 2)) fail(`assignment ${record.index} has the wrong pair position`);
	if (record.arm !== armForIndex(record.index)) fail(`assignment ${record.index} violates the fixed schedule`);
	if (record.seed !== TRIAL_ID || record.schedule_version !== SCHEDULE_VERSION) fail(`assignment ${record.index} schedule mismatch`);
	for (const key of ["input_sha256", "source", "session_id", "t127_join_key", "provider", "model"]) {
		requireString(record, key, "assignment");
	}
	requireString(record, "session_file_sha256", "assignment", { nullable: true });
	for (const key of ["input_chars", "image_count"]) requireInteger(record, key, "assignment");
}

function validateExposure(record, assignments, exposures) {
	validateCommon(record, "exposure");
	exactKeys(record, EXPOSURE_KEYS, "exposure");
	requireInteger(record, "index", "exposure");
	const assignment = assignments.get(record.index);
	if (!assignment) fail(`exposure ${record.index} has no assignment`);
	if (exposures.has(record.index)) fail(`assignment ${record.index} has duplicate exposure records`);
	if (record.arm !== assignment.arm) fail(`exposure ${record.index} arm mismatch`);
	requireString(record, "active_tools_sha256", "exposure");
	requireString(record, "package_version", "exposure", { nullable: true });
	if (typeof record.code_active !== "boolean") fail("exposure.code_active must be boolean");
	if ((record.arm === "treatment") !== record.code_active) fail(`exposure ${record.index} tool surface contradicts its arm`);
	if (record.package_version !== (record.arm === "treatment" ? PACKAGE_VERSION : null)) {
		fail(`exposure ${record.index} package proof contradicts its arm`);
	}
}

function validateOutcome(record, assignments, outcomes) {
	validateCommon(record, "outcome");
	exactKeys(record, OUTCOME_KEYS, "outcome");
	requireInteger(record, "index", "outcome");
	const assignment = assignments.get(record.index);
	if (!assignment) fail(`outcome ${record.index} has no assignment`);
	if (outcomes.has(record.index)) fail(`assignment ${record.index} has duplicate outcomes`);
	if (record.arm !== assignment.arm) fail(`outcome ${record.index} arm mismatch`);
	if (!["completed", "error", "aborted"].includes(record.status)) fail(`outcome ${record.index} status is invalid`);
	requireString(record, "terminal_reason", "outcome");
	for (const key of [
		"active_wall_ms", "agent_runs", "model_turns", "direct_tool_calls", "total_tool_calls",
		"tool_failures", "code_invocations", "code_inner_calls", "code_failures", "operator_interruptions",
		"queued_followups", "usage_input", "usage_output", "usage_cache_read", "usage_cache_write",
		"approval_requests", "approvals", "denials", "suspensions",
	]) requireNumber(record, key, "outcome");
	for (const key of ["prompt_code_selected", "prompt_code_snippet"]) {
		if (record[key] !== null && typeof record[key] !== "boolean") fail(`outcome.${key} must be boolean or null`);
	}
	if (record.prompt_code_selected !== null && record.prompt_code_selected !== (record.arm === "treatment")) {
		fail(`outcome ${record.index} prompt tool proof contradicts its arm`);
	}
	if (record.prompt_code_snippet !== null && record.prompt_code_snippet !== (record.arm === "treatment")) {
		fail(`outcome ${record.index} prompt snippet proof contradicts its arm`);
	}
}

function validateDeactivated(record, priorText, priorCount) {
	validateCommon(record, "deactivated");
	exactKeys(record, DEACTIVATED_KEYS, "deactivated");
	requireString(record, "reason", "deactivated");
	requireInteger(record, "record_count", "deactivated");
	requireString(record, "prior_ledger_sha256", "deactivated");
	if (record.record_count !== priorCount + 1 || record.prior_ledger_sha256 !== sha256(priorText)) {
		fail("deactivation seal does not match the prior ledger");
	}
}

export function readEvidence(paths, { allowMissing = true } = {}) {
	if (!safeDirectory(paths.root)) {
		if (allowMissing) return { records: [], assignments: new Map(), exposures: new Map(), outcomes: new Map(), activated: null, deactivated: null };
		fail(`trial state directory is missing: ${paths.root}`);
	}
	let text;
	try {
		text = readPrivateLeaf(paths.ledger);
	} catch (error) {
		if (allowMissing && isMissing(error)) return { records: [], assignments: new Map(), exposures: new Map(), outcomes: new Map(), activated: null, deactivated: null };
		throw error;
	}
	const records = [];
	const assignments = new Map();
	const exposures = new Map();
	const outcomes = new Map();
	let activated = null;
	let deactivated = null;
	const lines = text.split("\n");
	if (lines.at(-1) !== "") fail("ledger has a partial final line");
	lines.pop();
	for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
		if (!lines[lineIndex]) fail(`ledger line ${lineIndex + 1} is empty`);
		if (deactivated) fail("ledger has records after the deactivation seal");
		const record = parseJson(lines[lineIndex], `ledger line ${lineIndex + 1}`);
		switch (record.event) {
			case "activated":
				if (activated) fail("ledger has duplicate activation records");
				if (records.length !== 0) fail("activation is not the first ledger record");
				validateActivated(record);
				activated = record;
				break;
			case "assignment":
				if (!activated || deactivated) fail("assignment is outside the activation interval");
				validateAssignment(record, assignments.size + 1);
				assignments.set(record.index, record);
				break;
			case "exposure":
				if (!activated) fail("exposure precedes activation");
				validateExposure(record, assignments, exposures);
				exposures.set(record.index, record);
				break;
			case "outcome":
				if (!activated) fail("outcome precedes activation");
				validateOutcome(record, assignments, outcomes);
				outcomes.set(record.index, record);
				break;
			case "deactivated":
				if (!activated || deactivated) fail("invalid duplicate or premature deactivation");
				validateDeactivated(record, `${lines.slice(0, lineIndex).join("\n")}\n`, records.length);
				deactivated = record;
				break;
			default:
				fail(`unknown ledger event at line ${lineIndex + 1}`);
		}
		records.push(record);
	}
	return { records, assignments, exposures, outcomes, activated, deactivated };
}

function activationDocument(at) {
	return {
		schema: ACTIVATION_SCHEMA,
		trial_id: TRIAL_ID,
		seed: TRIAL_ID,
		schedule_version: SCHEDULE_VERSION,
		package_name: PACKAGE_NAME,
		package_version: PACKAGE_VERSION,
		package_integrity: PACKAGE_INTEGRITY,
		activated_at: at,
	};
}

function validateActivationDocument(record) {
	if (!record || typeof record !== "object" || Array.isArray(record)) fail("activation record must be an object");
	const expected = activationDocument(record.activated_at);
	exactKeys(record, new Set(Object.keys(expected)), "activation");
	validateTimestamp(record.activated_at, "activation.activated_at");
	for (const [key, value] of Object.entries(expected)) {
		if (record[key] !== value) fail(`activation field mismatch: ${key}`);
	}
	return record;
}

export function readActivation(paths) {
	try {
		lstatSync(paths.activation);
	} catch (error) {
		if (isMissing(error)) return null;
		throw error;
	}
	safeDirectory(paths.root);
	return validateActivationDocument(parseJson(readPrivateLeaf(paths.activation), paths.activation));
}

function readProcessClaim(paths, path, label, schema, extraKeys = []) {
	let before;
	try {
		before = lstatSync(path);
	} catch (error) {
		if (isMissing(error)) return null;
		throw error;
	}
	safeDirectory(paths.root);
	assertPrivateRegular(before, path);
	const claim = parseJson(readPrivateLeaf(path), path);
	if (!claim || typeof claim !== "object" || Array.isArray(claim)) fail(`${label} must be an object`);
	exactKeys(claim, new Set(["schema", "pid", "claimed_at", ...extraKeys]), label);
	if (claim.schema !== schema) fail(`${label} schema mismatch`);
	requireInteger(claim, "pid", label);
	if (claim.pid < 1) fail(`${label}.pid must be positive`);
	validateTimestamp(claim.claimed_at, `${label}.claimed_at`);
	Object.defineProperty(claim, CLAIM_STAT, { value: before });
	return claim;
}

function readWriter(paths) {
	const writer = readProcessClaim(paths, paths.writer, "writer claim", WRITER_SCHEMA, ["owner"]);
	if (!writer) return null;
	requireString(writer, "owner", "writer claim");
	return writer;
}

function readLock(paths) {
	return readProcessClaim(paths, paths.lock, "short lock claim", LOCK_SCHEMA);
}

function unlinkClaim(path, claim) {
	const current = lstatSync(path);
	const before = claim[CLAIM_STAT];
	if (current.dev !== before.dev || current.ino !== before.ino) fail(`trial claim changed before removal: ${path}`);
	unlinkSync(path);
}

export function claimWriter(paths, owner) {
	if (typeof owner !== "string" || !owner) fail("writer owner must be a non-empty string");
	return withWriterLock(paths, () => {
		readActivation(paths) ?? fail("trial is not active");
		try {
			writePrivateLeafExclusive(paths.writer, `${JSON.stringify({
				schema: WRITER_SCHEMA,
				owner,
				pid: process.pid,
				claimed_at: new Date().toISOString(),
			})}\n`);
		} catch (error) {
			if (error && error.code === "EEXIST") {
				readWriter(paths);
				fail(`trial collection already has a live writer: ${paths.writer}`);
			}
			throw error;
		}
	});
}

export function releaseWriter(paths, owner) {
	const writer = readWriter(paths);
	if (!writer) fail("trial writer claim is missing");
	if (writer.owner !== owner) fail("trial writer claim belongs to another runtime");
	unlinkClaim(paths.writer, writer);
}

function processIsAlive(pid) {
	try {
		process.kill(pid, 0);
		return true;
	} catch (error) {
		if (error && error.code === "ESRCH") return false;
		return true;
	}
}

export function unlockWriter(paths, { isProcessAlive = processIsAlive } = {}) {
	const writer = readWriter(paths);
	const lock = readLock(paths);
	if (!writer && !lock) fail("trial writer and short lock claims are missing");
	for (const [label, claim] of [["writer", writer], ["short lock", lock]]) {
		if (claim && isProcessAlive(claim.pid)) {
			fail(`trial ${label} process ${claim.pid} is still alive; refusing unlock`);
		}
	}
	if (writer) unlinkClaim(paths.writer, writer);
	if (lock) unlinkClaim(paths.lock, lock);
	return { writer, lock };
}

export function dependencyPaths({ env = process.env } = {}) {
	const agentDir = env.PI_CODING_AGENT_DIR || join(env.HOME || homedir(), ".pi", "agent");
	if (!isAbsolute(agentDir)) fail("PI_CODING_AGENT_DIR must be an absolute path");
	const packageRoot = join(resolve(agentDir), "npm", "node_modules", PACKAGE_NAME);
	return {
		agentDir: resolve(agentDir),
		packageRoot,
		lockfile: join(resolve(agentDir), "npm", "package-lock.json"),
		manifest: join(packageRoot, "package.json"),
		entry: join(packageRoot, "dist", "pi", "extension.js"),
	};
}

function readRegularLeaf(path) {
	const before = lstatSync(path);
	if (!before.isFile() || before.isSymbolicLink()) fail(`dependency leaf is not a regular file: ${path}`);
	const fd = openSync(path, fsConstants.O_RDONLY | NOFOLLOW);
	try {
		const after = fstatSync(fd);
		if (!after.isFile() || before.dev !== after.dev || before.ino !== after.ino) {
			fail(`dependency leaf changed while opening: ${path}`);
		}
		return readFileSync(fd, "utf8");
	} finally {
		closeSync(fd);
	}
}

export function verifyDependency(options = {}) {
	const paths = dependencyPaths(options);
	try {
		safeDirectory(paths.packageRoot);
	} catch (error) {
		if (isMissing(error)) fail(`missing ${PACKAGE_NAME}@${PACKAGE_VERSION} in ${dirname(paths.packageRoot)}`);
		throw error;
	}
	let manifest;
	let lockEntry;
	try {
		manifest = parseJson(readRegularLeaf(paths.manifest), paths.manifest);
		const lock = parseJson(readRegularLeaf(paths.lockfile), paths.lockfile);
		lockEntry = lock?.packages?.[`node_modules/${PACKAGE_NAME}`];
		readRegularLeaf(paths.entry);
	} catch (error) {
		if (isMissing(error)) fail(`missing ${PACKAGE_NAME}@${PACKAGE_VERSION} in ${paths.packageRoot}`);
		throw error;
	}
	if (manifest.name !== PACKAGE_NAME || manifest.version !== PACKAGE_VERSION) {
		fail(`expected ${PACKAGE_NAME}@${PACKAGE_VERSION}, found ${manifest.name ?? "unknown"}@${manifest.version ?? "unknown"}`);
	}
	if (lockEntry?.version !== PACKAGE_VERSION || lockEntry?.integrity !== PACKAGE_INTEGRITY) {
		fail(`package-lock provenance mismatch for ${PACKAGE_NAME}@${PACKAGE_VERSION}`);
	}
	return { ...paths, version: manifest.version };
}

export async function loadTreatmentFactory({ piPackageRoot, ...options } = {}) {
	const dependency = verifyDependency(options);
	if (!piPackageRoot || !isAbsolute(piPackageRoot)) {
		fail("the running Pi package root is required to load treatment");
	}
	const piEntry = join(resolve(piPackageRoot), "dist", "index.js");
	try {
		readRegularLeaf(piEntry);
	} catch (error) {
		if (isMissing(error)) fail(`running Pi entry is missing: ${piEntry}`);
		throw error;
	}
	const piEntryUrl = pathToFileURL(piEntry).href;
	const hooks = registerHooks({
		resolve(specifier, context, nextResolve) {
			if (specifier === "@earendil-works/pi-coding-agent") {
				return { url: piEntryUrl, shortCircuit: true };
			}
			return nextResolve(specifier, context);
		},
	});
	let module;
	try {
		module = await import(pathToFileURL(dependency.entry).href);
	} finally {
		hooks.deregister();
	}
	if (typeof module.createPythonExtension !== "function") {
		fail(`${PACKAGE_NAME}@${PACKAGE_VERSION} does not export createPythonExtension`);
	}
	return { createPythonExtension: module.createPythonExtension, dependency };
}

export function activateTrial(paths, options = {}) {
	verifyDependency(options);
	return withWriterLock(paths, () => {
		const evidence = readEvidence(paths);
		if (evidence.records.length !== 0) fail("trial ledger is already initialized; reactivation is not allowed");
		if (readActivation(paths)) fail("trial is already active");
		const at = new Date().toISOString();
		writePrivateLeafExclusive(paths.activation, `${JSON.stringify(activationDocument(at))}\n`);
		try {
			appendRecordUnlocked(paths, {
				schema: LEDGER_SCHEMA,
				event: "activated",
				trial_id: TRIAL_ID,
				at,
				seed: TRIAL_ID,
				schedule_version: SCHEDULE_VERSION,
				package_name: PACKAGE_NAME,
				package_version: PACKAGE_VERSION,
				package_integrity: PACKAGE_INTEGRITY,
			});
		} catch (error) {
			unlinkSync(paths.activation);
			throw error;
		}
		return at;
	});
}

export function deactivateTrial(paths, reason = "operator_stop") {
	return withWriterLock(paths, () => {
		readActivation(paths) ?? fail("trial is not active");
		if (readWriter(paths)) fail("trial collector is still running; exit it before deactivation");
		const evidence = readEvidence(paths, { allowMissing: false });
		let at = evidence.deactivated?.at;
		if (!evidence.deactivated) {
			at = new Date().toISOString();
			const priorText = readPrivateLeaf(paths.ledger);
			const seal = {
				schema: LEDGER_SCHEMA,
				event: "deactivated",
				trial_id: TRIAL_ID,
				at,
				reason,
				record_count: evidence.records.length + 1,
				prior_ledger_sha256: sha256(priorText),
			};
			validateDeactivated(seal, priorText, evidence.records.length);
			appendRecordUnlocked(paths, seal);
		}
		const before = lstatSync(paths.activation);
		assertPrivateRegular(before, paths.activation);
		unlinkSync(paths.activation);
		return at;
	});
}

export function allocateAssignment(paths, metadata) {
	return withWriterLock(paths, () => {
		readActivation(paths) ?? fail("trial is not active");
		const evidence = readEvidence(paths, { allowMissing: false });
		if (evidence.deactivated) fail("trial is permanently deactivated");
		const index = evidence.assignments.size + 1;
		const arm = armForIndex(index);
		const record = {
			schema: LEDGER_SCHEMA,
			event: "assignment",
			trial_id: TRIAL_ID,
			at: new Date().toISOString(),
			index,
			pair: Math.ceil(index / 2),
			pair_position: index % 2 === 1 ? 1 : 2,
			arm,
			seed: TRIAL_ID,
			schedule_version: SCHEDULE_VERSION,
			...metadata,
		};
		validateAssignment(record, index);
		appendRecordUnlocked(paths, record);
		return record;
	});
}

export function appendOutcome(paths, record) {
	return withWriterLock(paths, () => {
		const evidence = readEvidence(paths, { allowMissing: false });
		if (evidence.deactivated) fail("trial is permanently deactivated");
		const complete = {
			schema: LEDGER_SCHEMA,
			event: "outcome",
			trial_id: TRIAL_ID,
			at: new Date().toISOString(),
			...record,
		};
		validateOutcome(complete, evidence.assignments, evidence.outcomes);
		appendRecordUnlocked(paths, complete);
		return complete;
	});
}

export function appendExposure(paths, record) {
	return withWriterLock(paths, () => {
		const evidence = readEvidence(paths, { allowMissing: false });
		if (evidence.deactivated) fail("trial is permanently deactivated");
		const complete = {
			schema: LEDGER_SCHEMA,
			event: "exposure",
			trial_id: TRIAL_ID,
			at: new Date().toISOString(),
			...record,
		};
		validateExposure(complete, evidence.assignments, evidence.exposures);
		appendRecordUnlocked(paths, complete);
		return complete;
	});
}

function median(values) {
	if (values.length === 0) return null;
	const sorted = [...values].sort((a, b) => a - b);
	const middle = Math.floor(sorted.length / 2);
	return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function armSummary(arm, assignments, outcomes) {
	const selected = assignments.filter((assignment) => assignment.arm === arm);
	const result = selected.map((assignment) => outcomes.get(assignment.index));
	const sum = (field) => result.reduce((total, outcome) => total + outcome[field], 0);
	return {
		assigned: selected.length,
		completed: result.filter((outcome) => outcome.status === "completed").length,
		errors: result.filter((outcome) => outcome.status === "error").length,
		aborted: result.filter((outcome) => outcome.status === "aborted").length,
		code_uptake: result.filter((outcome) => outcome.code_invocations > 0).length,
		median_active_wall_ms: median(result.map((outcome) => outcome.active_wall_ms)),
		median_uncached_input_tokens: median(result.map((outcome) => outcome.usage_input + outcome.usage_cache_write)),
		median_model_turns: median(result.map((outcome) => outcome.model_turns)),
		total_direct_tool_calls: sum("direct_tool_calls"),
		total_code_invocations: sum("code_invocations"),
		total_code_inner_calls: sum("code_inner_calls"),
		total_tool_failures: sum("tool_failures"),
		total_extra_agent_runs: result.reduce((total, outcome) => total + Math.max(0, outcome.agent_runs - 1), 0),
		total_operator_interruptions: sum("operator_interruptions"),
		approval_requests: sum("approval_requests"),
		approvals: sum("approvals"),
		denials: sum("denials"),
		suspensions: sum("suspensions"),
	};
}

function reductionPercent(control, treatment) {
	if (control === null || treatment === null || control === 0) return null;
	return ((control - treatment) / control) * 100;
}

export function trialStatus(paths) {
	const activation = readActivation(paths);
	const evidence = readEvidence(paths);
	const writer = readWriter(paths);
	const lock = readLock(paths);
	const incomplete = [...evidence.assignments.keys()].filter((index) => !evidence.outcomes.has(index));
	return {
		trial_id: TRIAL_ID,
		active: activation !== null,
		state_root: paths.root,
		ledger: paths.ledger,
		assignments: evidence.assignments.size,
		exposures: evidence.exposures.size,
		outcomes: evidence.outcomes.size,
		incomplete_indexes: incomplete,
		arms: {
			control: [...evidence.assignments.values()].filter((record) => record.arm === "control").length,
			treatment: [...evidence.assignments.values()].filter((record) => record.arm === "treatment").length,
		},
		lock_present: lock !== null,
		lock_pid: lock?.pid ?? null,
		lock_claimed_at: lock?.claimed_at ?? null,
		writer_present: writer !== null,
		writer_pid: writer?.pid ?? null,
		writer_claimed_at: writer?.claimed_at ?? null,
		deactivated_at: evidence.deactivated?.at ?? null,
	};
}

export function analyzeTrial(paths) {
	const evidence = readEvidence(paths, { allowMissing: false });
	if (!evidence.deactivated) fail("trial is not deactivated and sealed; no causal verdict");
	if (readActivation(paths)) fail("trial activation remains after sealing; retry deactivation");
	if (readWriter(paths)) fail("trial writer claim remains; no causal verdict");
	if (readLock(paths)) fail("trial short lock remains; no causal verdict");
	const assignments = [...evidence.assignments.values()];
	if (assignments.length < 40) fail(`incomplete trial: ${assignments.length}/40 assignments; no causal verdict`);
	const missing = assignments.filter((assignment) => !evidence.outcomes.has(assignment.index)).map((assignment) => assignment.index);
	if (missing.length) fail(`incomplete trial outcomes at indexes ${missing.join(",")}; no causal verdict`);
	const firstForty = assignments.slice(0, 40);
	const firstCounts = {
		control: firstForty.filter((record) => record.arm === "control").length,
		treatment: firstForty.filter((record) => record.arm === "treatment").length,
	};
	if (firstCounts.control !== 20 || firstCounts.treatment !== 20) fail("first 40 assignments are not balanced 20/20");
	const outcomes = evidence.outcomes;
	const control = armSummary("control", assignments, outcomes);
	const treatment = armSummary("treatment", assignments, outcomes);
	return {
		schema: "qq.pi-code-tool-trial-analysis/v1",
		trial_id: TRIAL_ID,
		analysis: "intention_to_treat",
		thresholds: {
			active_wall_ms_reduction_percent: 10,
			uncached_input_tokens_reduction_percent: 15,
		},
		external_quality_status: "required",
		assignments: assignments.length,
		first_40_arms: firstCounts,
		arms: {
			control,
			treatment,
		},
		median_reduction_percent: {
			active_wall_ms: reductionPercent(control.median_active_wall_ms, treatment.median_active_wall_ms),
			uncached_input_tokens: reductionPercent(
				control.median_uncached_input_tokens,
				treatment.median_uncached_input_tokens,
			),
		},
		input_level_records: assignments.map((assignment) => ({
			index: assignment.index,
			arm: assignment.arm,
			session_id: assignment.session_id,
			session_file_sha256: assignment.session_file_sha256,
			outcome: outcomes.get(assignment.index),
		})),
		causal_verdict: "not_computed",
		uncertainty: "Descriptive medians and input-level distributions only; interpret after the predeclared T-127 and quality join.",
		join_required: {
			key: "session_id/session_file_sha256 -> Pi JSONL and T-127 spans",
			measures: [
				"distinct Changes",
				"applicable Checks and evidence completeness",
				"review findings and rework",
				"retry classification (Pi exposes agent-run boundaries but not their cause at this layer)",
			],
		},
		note: "This command reports unpruned assigned arms. Adoption remains a separate operator disposition after the T-127/quality join.",
	};
}

function usage() {
	return "usage: qq-code-trial <status|activate|deactivate|unlock|analyze>";
}

export async function cli(argv, { env = process.env, repositoryRoot } = {}) {
	const [command, ...rest] = argv;
	if (!command || rest.length !== 0 || !["status", "activate", "deactivate", "unlock", "analyze"].includes(command)) {
		console.error(usage());
		return 64;
	}
	const paths = statePaths({ env, repositoryRoot });
	try {
		switch (command) {
			case "status":
				console.log(JSON.stringify(trialStatus(paths), null, 2));
				return 0;
			case "activate":
				activateTrial(paths, { env });
				console.log(`activated ${TRIAL_ID}; ledger: ${paths.ledger}`);
				return 0;
			case "deactivate":
				deactivateTrial(paths);
				console.log(`deactivated ${TRIAL_ID}; ledger retained: ${paths.ledger}`);
				return 0;
			case "unlock": {
				const removed = unlockWriter(paths);
				const claims = [removed.writer && `writer pid ${removed.writer.pid}`, removed.lock && `short lock pid ${removed.lock.pid}`].filter(Boolean);
				console.log(`removed stale trial ${claims.join(" and ")}`);
				return 0;
			}
			case "analyze":
				console.log(JSON.stringify(analyzeTrial(paths), null, 2));
				return 0;
		}
	} catch (error) {
		console.error(`qq-code-trial: ${error instanceof Error ? error.message : String(error)}`);
		return error instanceof TrialEvidenceError ? 2 : 1;
	}
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	process.exitCode = await cli(process.argv.slice(2), {
		env: process.env,
		repositoryRoot: process.env.QQ_CODE_TRIAL_ROOT,
	});
}
