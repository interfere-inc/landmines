import { existsSync, globSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { parse } from "jsonc-parser";
import { z } from "zod";

const turboSchema = z.object({
  extends: z.array(z.string()).optional(),
  tasks: z
    .record(z.string(), z.object({ inputs: z.array(z.string()).optional() }))
    .optional(),
});

const manifestSchema = z.object({
  name: z.string().optional(),
  dependencies: z.record(z.string(), z.string()).optional(),
  devDependencies: z.record(z.string(), z.string()).optional(),
  optionalDependencies: z.record(z.string(), z.string()).optional(),
  scripts: z.record(z.string(), z.string()).optional(),
  workspaces: z
    .array(z.string())
    .or(z.object({ packages: z.array(z.string()) }))
    .optional(),
});

const extendsMarker = "$TURBO_EXTENDS$";
const rootMarker = "$TURBO_ROOT$/";

const declared = new Map<string, readonly string[]>();
const closures = new Map<string, readonly string[]>();
const workspaces = new Map<string, ReadonlyMap<string, string>>();

function readJson(path: string) {
  const value: unknown = existsSync(path)
    ? parse(readFileSync(path, "utf8"))
    : undefined;

  return value;
}

export function manifest(directory: string) {
  return manifestSchema.parse(readJson(join(directory, "package.json")) ?? {});
}

function workspaceDirectories(root: string) {
  const cached = workspaces.get(root);

  if (cached) {
    return cached;
  }

  const { workspaces: patterns = [] } = manifest(root);
  const directories = new Map<string, string>();

  for (const pattern of Array.isArray(patterns)
    ? patterns
    : patterns.packages) {
    for (const path of globSync(`${pattern}/package.json`, { cwd: root })) {
      const directory = dirname(join(root, path));
      const { name } = manifest(directory);

      if (name !== undefined) {
        directories.set(name, directory);
      }
    }
  }

  workspaces.set(root, directories);

  return directories;
}

function taskInputs(path: string, task: string) {
  return turboSchema.parse(readJson(path) ?? {}).tasks?.[task]?.inputs;
}

function repositoryGlobs(
  inputs: readonly string[],
  directory: string,
  root: string,
) {
  return inputs.flatMap((input) => {
    if (input.startsWith("$TURBO_") && !input.startsWith(rootMarker)) {
      return [];
    }

    if (input.startsWith("!")) {
      return [];
    }

    return input.startsWith(rootMarker)
      ? [input.slice(rootMarker.length)]
      : [relative(root, resolve(directory, input))];
  });
}

function layer(
  inherited: readonly string[],
  inputs: readonly string[] | undefined,
  directory: string,
  root: string,
) {
  if (inputs === undefined) {
    return inherited;
  }

  const globs = repositoryGlobs(inputs, directory, root);

  return inputs.includes(extendsMarker) ? [...inherited, ...globs] : globs;
}

export function testTaskInputs(directory: string, root: string) {
  const cached = declared.get(directory);

  if (cached) {
    return cached;
  }

  const rootConfig = join(root, "turbo.json");
  const { name } = manifest(directory);

  let inputs = layer(
    [],
    taskInputs(rootConfig, name === undefined ? "test" : `${name}#test`) ??
      taskInputs(rootConfig, "test"),
    root,
    root,
  );

  const config = join(directory, "turbo.json");
  const extended = turboSchema.parse(readJson(config) ?? {}).extends ?? [];

  for (const parent of extended.filter((entry) => entry !== "//")) {
    const parentDirectory = workspaceDirectories(root).get(parent);

    if (parentDirectory !== undefined) {
      inputs = layer(
        inputs,
        taskInputs(join(parentDirectory, "turbo.json"), "test"),
        directory,
        root,
      );
    }
  }

  inputs = layer(inputs, taskInputs(config, "test"), directory, root);

  declared.set(directory, inputs);

  return inputs;
}

export function dependencyDirectories(directory: string, root: string) {
  const cached = closures.get(directory);

  if (cached) {
    return cached;
  }

  const directories = workspaceDirectories(root);
  const visited = new Set<string>();
  const pending = [directory];

  while (pending.length > 0) {
    const current = manifest(pending.pop() ?? root);

    for (const [name, version] of Object.entries({
      ...current.dependencies,
      ...current.devDependencies,
      ...current.optionalDependencies,
    })) {
      const dependency = directories.get(name);

      if (
        version.startsWith("workspace:") &&
        dependency !== undefined &&
        !visited.has(dependency)
      ) {
        visited.add(dependency);

        pending.push(dependency);
      }
    }
  }

  const result = [...visited].map((dependency) => relative(root, dependency));

  closures.set(directory, result);

  return result;
}
