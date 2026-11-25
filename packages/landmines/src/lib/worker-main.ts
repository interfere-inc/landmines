import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { parse } from "jsonc-parser";
import { z } from "zod";

const configNames = ["wrangler.jsonc", "wrangler.json", "wrangler.toml"];

const classBindings = z
  .array(z.object({ class_name: z.string().optional() }))
  .optional();

const bindingSchema = z.object({
  name: z.string().optional(),
  durable_objects: z.object({ bindings: classBindings }).optional(),
  workflows: classBindings,
  migrations: z
    .array(
      z.object({
        new_classes: z.array(z.string()).optional(),
        new_sqlite_classes: z.array(z.string()).optional(),
        renamed_classes: z
          .array(z.object({ to: z.string().optional() }))
          .optional(),
      }),
    )
    .optional(),
  services: z
    .array(
      z.object({
        service: z.string().optional(),
        entrypoint: z.string().optional(),
      }),
    )
    .optional(),
});

const wranglerSchema = bindingSchema.extend({
  main: z.string().optional(),
  env: z.record(z.string(), bindingSchema).optional(),
});

type Bindings = z.infer<typeof bindingSchema>;

interface WorkerMain {
  main: string;
  names: ReadonlySet<string>;
}

const nearest = new Map<string, WorkerMain | undefined>();

function boundNames(bindings: Bindings, self: string | undefined) {
  const migrations = bindings.migrations ?? [];

  return [
    (bindings.durable_objects?.bindings ?? []).map(
      ({ class_name: name }) => name,
    ),
    (bindings.workflows ?? []).map(({ class_name: name }) => name),
    migrations.flatMap(({ new_classes: names = [] }) => names),
    migrations.flatMap(({ new_sqlite_classes: names = [] }) => names),
    migrations.flatMap(({ renamed_classes: renames = [] }) =>
      renames.map(({ to }) => to),
    ),
    (bindings.services ?? [])
      .filter(({ service }) => self !== undefined && service === self)
      .map(({ entrypoint }) => entrypoint),
  ]
    .flat()
    .filter((name) => name !== undefined);
}

function readConfig(path: string) {
  if (path.endsWith(".toml")) {
    return;
  }

  const config = wranglerSchema.safeParse(
    parse(readFileSync(path, "utf8"), [], { allowTrailingComma: true }),
  );

  if (!config.success || config.data.main === undefined) {
    return;
  }

  const { main, name, env = {} } = config.data;

  return {
    main: resolve(dirname(path), main),
    names: new Set([
      ...boundNames(config.data, name),
      ...Object.entries(env).flatMap(([environment, bindings]) =>
        boundNames(
          bindings,
          bindings.name ??
            (name === undefined ? undefined : `${name}-${environment}`),
        ),
      ),
    ]),
  };
}

function nearestWorkerMain(start: string) {
  const visited: string[] = [];
  let found: WorkerMain | undefined;

  for (let directory = start; ; directory = dirname(directory)) {
    if (nearest.has(directory)) {
      found = nearest.get(directory);
      break;
    }

    visited.push(directory);

    const config = configNames
      .map((name) => join(directory, name))
      .find((path) => existsSync(path));

    if (config) {
      found = readConfig(config);
      break;
    }

    if (
      existsSync(join(directory, "package.json")) ||
      dirname(directory) === directory
    ) {
      break;
    }
  }

  for (const directory of visited) {
    nearest.set(directory, found);
  }

  return found;
}

export function workerBoundExports(filename: string) {
  const absolute = resolve(filename);
  const worker = nearestWorkerMain(dirname(absolute));

  return worker?.main === absolute ? worker.names : new Set<string>();
}
