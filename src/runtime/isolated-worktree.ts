/**
 * Isolated workspace for propose/apply source mutations.
 * Prefers git worktree when the development root is a repository;
 * falls back to a content-addressed directory copy outside the source tree.
 */
import { spawn } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { randomBytes } from "node:crypto";
import { sha256 } from "../core/canonical.js";

export interface IsolatedWorkspace {
  kind: "git-worktree" | "directory-copy";
  path: string;
  branch?: string;
  sourceRoot: string;
  dispose: () => Promise<void>;
}

async function run(command: string, args: string[], cwd: string): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolvePromise) => {
    const child = spawn(command, args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += String(chunk); });
    child.stderr.on("data", (chunk) => { stderr += String(chunk); });
    child.on("error", (error) => resolvePromise({ code: 127, stdout, stderr: String(error) }));
    child.on("exit", (code) => resolvePromise({ code: code ?? 1, stdout, stderr }));
  });
}

/** True only when root is the git toplevel (not a nested path inside a larger repo). */
async function isGitToplevel(root: string): Promise<boolean> {
  const inside = await run("git", ["-C", root, "rev-parse", "--is-inside-work-tree"], root);
  if (inside.code !== 0 || inside.stdout.trim() !== "true") return false;
  const top = await run("git", ["-C", root, "rev-parse", "--show-toplevel"], root);
  if (top.code !== 0) return false;
  return resolve(top.stdout.trim()) === resolve(root);
}

export async function createIsolatedWorkspace(
  sourceRoot: string,
  options: { label?: string; parentDir?: string } = {},
): Promise<IsolatedWorkspace> {
  const root = resolve(sourceRoot);
  const label = (options.label ?? "mutation").replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 48);
  const parent = options.parentDir ? resolve(options.parentDir) : await mkdtemp(join(tmpdir(), "dt-mutation-"));
  await mkdir(parent, { recursive: true });
  const token = randomBytes(4).toString("hex");
  const branch = `dt-mutation/${label}-${token}`;
  const workPath = join(parent, `${label}-${token}`);

  if (await isGitToplevel(root)) {
    const add = await run("git", ["-C", root, "worktree", "add", "-b", branch, workPath, "HEAD"], root);
    if (add.code !== 0) {
      // Retry without new branch if branch creation fails (detached / missing HEAD).
      const fallback = await run("git", ["-C", root, "worktree", "add", "--detach", workPath, "HEAD"], root);
      if (fallback.code !== 0) {
        throw new Error(`ISOLATED_WORKTREE_FAILED:${add.stderr || fallback.stderr}`.slice(0, 500));
      }
      return {
        kind: "git-worktree",
        path: workPath,
        sourceRoot: root,
        dispose: async () => {
          await run("git", ["-C", root, "worktree", "remove", "--force", workPath], root);
          await rm(workPath, { recursive: true, force: true });
        },
      };
    }
    return {
      kind: "git-worktree",
      path: workPath,
      branch,
      sourceRoot: root,
      dispose: async () => {
        await run("git", ["-C", root, "worktree", "remove", "--force", workPath], root);
        await run("git", ["-C", root, "branch", "-D", branch], root);
        await rm(workPath, { recursive: true, force: true });
      },
    };
  }

  await cp(root, workPath, {
    recursive: true,
    filter: (src) => {
      const name = basename(src);
      return name !== "node_modules" && name !== ".git" && name !== "dist" && name !== ".dt-run";
    },
  });
  const marker = {
    schema: "subactor.isolated-workspace/v1",
    kind: "directory-copy",
    sourceRoot: root,
    createdAt: new Date().toISOString(),
    contentToken: sha256(`${root}:${Date.now()}:${token}`),
  };
  await writeFile(join(workPath, ".dt-isolated-workspace.json"), JSON.stringify(marker, null, 2) + "\n");
  return {
    kind: "directory-copy",
    path: workPath,
    sourceRoot: root,
    dispose: async () => {
      await rm(workPath, { recursive: true, force: true });
    },
  };
}

export async function readIsolationMarker(workspacePath: string): Promise<Record<string, unknown> | null> {
  try {
    return JSON.parse(await readFile(join(workspacePath, ".dt-isolated-workspace.json"), "utf8")) as Record<string, unknown>;
  } catch {
    return null;
  }
}
