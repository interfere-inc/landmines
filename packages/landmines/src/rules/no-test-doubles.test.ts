import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";

import { lint, lintBatch } from "./rule.test-utils";

const behaviorReplacements = [
  'import { env, withEnv } from "cloudflare:workers"; withEnv({ ...env, TOKEN: { get: async () => "key" } }, run);',
  'import { env } from "cloudflare:workers"; use({ ...env, BOT_SIGNING_KEYS: { get: async () => "key" } });',
  'import { env as bindings } from "cloudflare:workers"; const original = bindings; const key = { get: async () => "key" }; use({ ...original, TOKEN: key });',
  'import { env } from "cloudflare:workers"; const replacement = { get() { return "key"; } }; use({ ...env.TOKEN, ...replacement });',
  'import { mockIPC } from "@tauri-apps/api/mocks"; mockIPC(() => null);',
  'import { mockWindows as windows } from "@tauri-apps/api/mocks"; const replace = windows; replace("main");',
  'import * as mocks from "@tauri-apps/api/mocks"; mocks.mockIPC(() => null);',
  'import * as mocks from "@tauri-apps/api/mocks"; const { mockWindows: windows } = mocks; windows("main");',
  'import { mockConvertFileSrc } from "@tauri-apps/api/mocks"; mockConvertFileSrc("linux");',

  "const observer = vi.fn(); const { mockReturnValue } = observer; mockReturnValue(123);",
  "const observer = vi.fn(); const { mockResolvedValue: replace } = observer; const alias = replace; alias(null);",
  'const observer = vi.fn(); const { ["mockImplementation"]: replace } = observer; replace(() => null);',
  "globalThis[`fetch`] = replacement;",
  "const key = `clipboard`; Object.defineProperty(navigator, key, { value: replacement });",
  "Object.assign(globalThis, enabled ? { fetch: replacement } : {});",
  "Object.assign(globalThis, enabled && { fetch: replacement });",
  "Object.assign(globalThis, (prepare(), { fetch: replacement }));",
  "Object.defineProperties(navigator, enabled ? { clipboard: { value: replacement } } : {});",
  "globalThis.isTauri = true;",
  "window.__TAURI_INTERNALS__ = bridge;",

  'import { env } from "cloudflare:workers"; const verify = () => null; env.AUTH = { verify: verify.bind(null) };',
  'import { env } from "cloudflare:workers"; function verify() {} const bound = verify.bind(null); env.AUTH.verify = bound;',
  'import { env } from "cloudflare:workers"; async function get() {} env.TOKEN = { get: get.bind(null).bind(null) };',
  'import { withEnv } from "cloudflare:workers"; const get = () => "token"; const method = "bind"; withEnv({ TOKEN: { get: get[method](null) } }, run);',
  'import { runInDurableObject } from "cloudflare:test"; function send() {} runInDurableObject(stub, (instance) => { instance.send = send.bind(null); });',
  'import { env } from "cloudflare:workers"; const verify = function () {}; Object.assign(env.AUTH, { verify: verify.bind(null) });',
  'import { env } from "cloudflare:workers"; function verify() { return null; } env.AUTH = { verify };',
  'import { env } from "cloudflare:workers"; async function verify() { return null; } const replacement = verify; env.AUTH.verify = replacement;',
  'import { withEnv } from "cloudflare:workers"; function get() { return "token"; } withEnv({ TOKEN: { get } }, run);',
  'import { runInDurableObject } from "cloudflare:test"; function send() {} runInDurableObject(stub, (instance) => { instance.send = send; });',
  'import { env } from "cloudflare:workers"; env.AUTH = { verify }; function verify() { return null; }',

  'import { runInDurableObject } from "cloudflare:test"; runInDurableObject(stub, async (instance) => { instance.containerFetch = async () => new Response(); });',
  'import { runInDurableObject as run } from "cloudflare:test"; run(stub, (instance, state) => { state.storage.setAlarm = async () => {}; });',
  'import { runInDurableObject } from "cloudflare:test"; runInDurableObject(stub, (instance) => { const target = instance; Reflect.set(target, "fetch", () => null); });',
  'import { runInDurableObject } from "cloudflare:test"; runInDurableObject(stub, (instance, state) => { const { storage } = state; Object.assign(storage, { put: async () => {} }); });',
  'import { runInDurableObject } from "cloudflare:test"; const run = runInDurableObject; run(stub, function (instance) { Object.defineProperty(instance, "fetch", { value: () => null }); });',
  'import { runInDurableObject } from "cloudflare:test"; runInDurableObject.call(null, stub, (instance) => { instance.fetch = () => null; });',

  'import { env } from "cloudflare:workers"; env.AUTH = enabled ? { verify: () => null } : native;',
  'import { env } from "cloudflare:workers"; env.AUTH = enabled ? native : { verify: () => null };',
  'import { env } from "cloudflare:workers"; env.AUTH = existing || { verify: () => null };',
  'import { env } from "cloudflare:workers"; env.AUTH = { verify: () => null } ?? existing;',
  'import { env } from "cloudflare:workers"; env.AUTH = enabled && { verify: () => null };',
  'import { env } from "cloudflare:workers"; env.AUTH = (prepare(), { verify: () => null });',
  'import { withEnv } from "cloudflare:workers"; withEnv(enabled ? { AUTH: { verify: () => null } } : defaults, run);',
  'import { env } from "cloudflare:workers"; const replacement = enabled ? { verify: () => null } : native; Reflect.set(env, "AUTH", replacement);',
  'import { env } from "cloudflare:workers"; env.AUTH = { ...(enabled ? { verify: () => null } : {}) };',
  'import { env } from "cloudflare:workers"; Object.defineProperty(env.AUTH, "verify", { value: enabled ? () => null : native });',

  'import { env } from "cloudflare:workers"; env.AUTH = { verify: async () => null };',
  'import { env as bindings } from "cloudflare:workers"; bindings.AUTH.verify = () => null;',
  'import { env } from "cloudflare:workers"; const { AUTH } = env; AUTH.verify = function () {};',
  'import { env } from "cloudflare:workers"; const bindings = env; Object.assign(bindings, { TOKEN: { get: async () => "token" } });',
  'import { env } from "cloudflare:workers"; Reflect.set(env, "AUTH", { verify() { return null; } });',
  'import { env } from "cloudflare:workers"; Object.defineProperty(env.AUTH, "verify", { value: () => null });',
  'import { env } from "cloudflare:workers"; Reflect.defineProperty(env, "TOKEN", { value: { get: () => "token" } });',
  'import { env } from "cloudflare:workers"; Object.defineProperties(env, { AUTH: { value: { verify: () => null } } });',
  'import { env } from "cloudflare:workers"; const get = () => "token"; env.TOKEN = { get };',
  'import { env } from "cloudflare:workers"; const replacement = { verify: () => null }; env.AUTH = { ...replacement };',
  'import { withEnv } from "cloudflare:workers"; withEnv({ AUTH: { verify: () => null } }, run);',
  'import { withEnv as scoped } from "cloudflare:workers"; const useEnv = scoped; useEnv({ TOKEN: { get: () => "token" } }, run);',
  'import { env } from "cloudflare:workers"; const set = Reflect.set.bind(Reflect, env.AUTH, "verify"); set(() => null);',
  "globalThis.AbortController = Controller;",
  "window.AbortSignal = Signal;",
  "AbortSignal.timeout = timeout;",
  "const { AbortSignal: signal } = globalThis; signal.any = any;",
  "Object.assign(AbortSignal, { abort });",
  "const signal = AbortSignal; Reflect.set(signal, 'timeout', timeout);",
  "delete AbortSignal.timeout;",
  "Object.defineProperty(AbortSignal.prototype, 'aborted', { get: aborted });",
  "Object.defineProperty(AbortSignal.prototype, 'reason', { value: reason });",
  "AbortSignal.prototype.throwIfAborted = check;",
  "AbortController.prototype.abort = abort;",
  "Reflect.deleteProperty(AbortController.prototype, 'signal');",
  "let tools = vi; tools.mock('client');",
  "var tools = vi; tools.fn(() => 1);",
  "let key = 'clipboard'; Reflect.set(navigator, key, clipboard);",
  "let { defineProperty: define } = Object; define(navigator, 'clipboard', { value: clipboard });",
  "var { mock: replace } = vi; replace('client');",
  "let target = navigator; target.clipboard = clipboard;",
  "let args = ['client']; vi.mock.apply(vi, args);",
  "let replacement = { fetch: request }; Object.assign(window, { ...replacement });",
  'vi.mock.call(vi, "client");',
  "vi.fn.call(vi, () => 1);",
  "vi.fn.apply(vi, [() => 1]);",
  'const args = ["client"]; vi.mock.apply(vi, args);',
  "const create = vi.fn.bind(vi, () => 1); create();",
  "vi.fn.bind(vi)(() => 1);",
  "const create = vi.fn.bind(vi); const alias = create; alias(() => 1);",
  "const create = vi.fn.bind(vi); const bound = create.bind(null, () => 1); bound();",
  "const create = vi.fn.bind(vi); create.call(null, () => 1);",
  "const create = vi.fn.bind(vi); create.apply(null, [() => 1]);",
  'Reflect.apply(vi.mock, vi, ["client"]);',
  "const { apply } = Reflect; apply(vi.fn, vi, [() => 1]);",
  'const method = "call"; vi.mock[method](vi, "client");',
  "client.send.mockResolvedValue.call(client.send, {});",
  "client.send.mockImplementation.apply(client.send, [send]);",
  "const replace = client.send.mockReturnValue.bind(client.send); replace(1);",
  'Object.defineProperty.call(Object, navigator, "clipboard", { value: clipboard });',
  'Reflect.set.apply(Reflect, [window, "fetch", request]);',
  "const assign = Object.assign.bind(Object, navigator); assign({ gpu });",
  'Reflect.apply(Object.defineProperty, Object, [document, "hidden", { value: true }]);',
  'const remove = Reflect.deleteProperty.bind(Reflect, window, "fetch"); remove();',

  'const key = "clipboard"; Object.defineProperty(navigator, key, { value: clipboard });',
  'const key = "fetch"; const alias = key; window[alias] = request;',
  'const key = "gpu" as const; delete navigator[key];',
  'const hostKey = "navigator"; const key = "credentials"; globalThis[hostKey][key] = credentials;',
  'import { vi } from "vitest"; const method = "mock"; vi[method]("client");',
  'import { vi } from "vitest"; const method = "fn"; const { [method]: create } = vi; create(() => 1);',
  'const key = "clipboard"; const { [key]: board } = navigator; board.readText = read;',
  'const objects = Object; objects.defineProperty(navigator, "clipboard", { value: clipboard });',
  'const { defineProperty: define } = Object; define(navigator, "clipboard", { value: clipboard });',
  'const define = Reflect.defineProperty; const alias = define; alias(document, "hidden", { value: true });',
  'const { set } = Reflect; set(navigator, "gpu", gpu);',
  'const key = "deleteProperty"; const remove = Reflect[key]; remove(window, "fetch");',
  "const { Object: objects } = globalThis; const { assign } = objects; assign(window, { fetch: request });",
  "const replacement = { fetch: request }; Object.assign(window, { ...replacement });",
  'const key = "clipboard"; const replacement = { [key]: { value: clipboard } }; Object.defineProperties(navigator, { ...replacement });',
  "const replacement = { fetch: request }; const nested = { ...replacement }; Object.assign(window, { ...nested });",
  "const replacement = { ...replacement, fetch: request }; Object.assign(window, { ...replacement });",

  'import * as api from "vitest"; const { vi: tools } = api; tools.mock("client");',
  'import * as api from "@jest/globals"; const { jest: tools } = api; tools.fn(() => 1);',
  'import * as api from "vitest"; const source = api; const { vitest: tools } = source; const alias = tools; alias.stubGlobal("fetch", request);',
  "const { clipboard } = navigator; clipboard.writeText = write;",
  'const { navigator: host } = window; const { clipboard: board } = host; Reflect.set(board, "readText", read);',
  'const { ["credentials"]: credentials } = navigator; credentials.get = get;',
  "const { document: page } = globalThis; delete page.visibilityState;",
  'Object.defineProperty(Navigator.prototype, "clipboard", { value: clipboard });',
  "Document.prototype.querySelector = find;",
  'const NativeNavigator = Navigator; Reflect.deleteProperty(NativeNavigator.prototype, "userAgentData");',
  "const page = globalThis.Document.prototype; Object.assign(page, { createElement });",
  'const host = navigator as Navigator; Object.defineProperty(host, "clipboard", { value: clipboard });',
  "const host = navigator!; host.credentials = credentials;",
  "const host = navigator satisfies Navigator; host.gpu = gpu;",
  'import { vi } from "vitest"; const tools = vi as typeof vi; tools.mock("client");',
  "delete globalThis.CompressionStream;",
  "const host = navigator; delete host.clipboard;",
  'Reflect.deleteProperty(window, "fetch");',
  'const entropy = crypto; Reflect.deleteProperty(entropy, "randomUUID");',
  'Object.defineProperty(document, "visibilityState", { get: () => "hidden" });',
  'const page = document; Reflect.set(page, "hidden", true);',
  "Object.assign(navigator, { clipboard: clipboard });",
  "Object.defineProperties(window.navigator, { gpu: { value: gpu } });",
  "globalThis.document.modelContext = context;",
  "const host = navigator; host.credentials = credentials;",
  'const nativeNavigator = navigator; Object.defineProperty(nativeNavigator, "userAgentData", { value: hints });',
  'Reflect.set(window.navigator, "userAgentData", hints);',
  "navigator.userAgentData = hints;",
  'Object.defineProperty(window, "document", { value: page });',
  "const root = globalThis; root.scrollTo = scroll;",
  "navigator.clipboard.writeText = write;",
  'const clipboard = window.navigator.clipboard; Reflect.set(clipboard, "readText", read);',
  'const host = navigator; const credentials = host.credentials; Object.defineProperty(credentials, "get", { value: get });',
  "Object.assign(navigator.permissions, { query });",
  "Object.defineProperties(navigator.storage, { estimate: { value: estimate } });",
  "const hints = navigator.userAgentData; hints.getHighEntropyValues = read;",
  "localStorage.getItem = read;",
  'Reflect.defineProperty(globalThis.sessionStorage, "setItem", { value: write });',
  "Date.now = now;",
  "const clock = performance; clock.now = now;",
  'Object.defineProperty(Math, "random", { value: random });',
  "const entropy = globalThis.crypto; Object.assign(entropy, { randomUUID });",
  'Reflect.set(Storage.prototype, "setItem", write);',
  "const navigation = window.history; navigation.pushState = push;",
  "document.querySelector = find;",
  'Object.defineProperty(window.navigator, "webdriver", { value: false });',
  "globalThis.addEventListener = listen;",

  'import * as api from "vitest"; const tools = api; tools.vi.fn(() => 42);',
  'import * as api from "@jest/globals"; const tools = api; tools.jest.mock("client");',
  'Object.defineProperty(globalThis, "CompressionStream", { value: undefined });',
  'Reflect.defineProperty(window, "ResizeObserver", { value: Observer });',
  'Reflect.set(globalThis, "requestIdleCallback", callback);',
  "const host = window; Object.assign(host, { localStorage: storage });",
  "const props = { WebSocket: { value: Socket } }; Object.defineProperties(globalThis, props);",
  "globalThis.Notification = NotificationImplementation;",
  'window["matchMedia"] = media;',
  "requestAnimationFrame = frame;",
  "const root = globalThis; root.fetch = request;",
  'const root = window; Reflect.set(root, "fetch", request);',
  "const root = self; const replacement = { fetch: request }; Object.assign(root, replacement);",
  "const descriptors = { fetch: { value: request } }; Object.defineProperties(globalThis, descriptors);",
  'import { vi } from "vitest"; const tools = vi; tools.mock("client");',
  "const tools = vi; const alias = tools; alias.fn(() => 42);",
  'import * as api from "vitest"; const tools = api.vi; tools.stubGlobal("fetch", request);',
  "const tools = vi; const { fn: fake } = tools; fake(() => 42);",
  'import { vi } from "vitest"; const replace = vi.mock; replace("client");',
  'import { vi } from "vitest"; const { fn: fake } = vi; fake(() => 42);',
  'import { vi } from "vitest"; const { mock } = vi; mock("client");',
  'const replace = vi.stubGlobal; const alias = replace; alias("fetch", request);',
  "const resolve = send.mockResolvedValue; resolve({});",
  'import { vi } from "vitest"; vi.stubGlobal("fetch", async () => new Response());',
  'import { vi as tools } from "vitest"; tools.fn(() => 42);',
  'import { vitest as tools } from "vitest"; tools.fn(() => 42);',
  'import * as tools from "vitest"; tools.vi.stubGlobal("fetch", request);',
  'import * as tools from "@jest/globals"; tools.jest.fn(() => 42);',
  'import { jest as tools } from "@jest/globals"; tools.fn(() => 42);',
  'vi.mock("client", () => ({ send: () => true }));',
  'vi.mock("client");',
  'vi.doMock("client", () => ({ send: () => true }));',
  'vi.importMock("client");',
  "vi.mockObject(client);",
  'jest.replaceProperty(process, "env", {});',
  'jest.createMockFromModule("client");',
  'jest.genMockFromModule("client");',
  'jest.setMock("client", {});',
  "jest.enableAutomock();",
  'vi["stubGlobal"]("IntersectionObserver", Observer);',
  "vi.fn(async () => undefined);",
  'vi.spyOn(client, "send").mockResolvedValue({});',
  'vi.spyOn(globalThis, "fetch").mockImplementation(async () => new Response());',
  "send.mockRejectedValueOnce(new Error());",
  "send.mockReturnValueOnce(42);",
  "send.mockImplementationOnce(() => 42);",
  "send.mockReturnThis();",
  "send.withImplementation(() => 42, () => run());",
  'workflow.mockStepResult({ name: "publish" }, true);',
  'workflow.mockStepError({ name: "publish" }, new Error("failed"));',
  'send["mockReturnValue"](42);',
  "globalThis.fetch = async () => new Response();",
  'window["fetch"] = request;',
  "fetch = request;",
  'Object.defineProperty(globalThis, "fetch", { value: request });',
  'Reflect.defineProperty(globalThis, "fetch", { value: request });',
  'Reflect.set(globalThis, "fetch", request);',
  "Object.defineProperties(window, { fetch: { value: request } });",
  'Object.defineProperties(self, { ["fetch"]: { get: () => request } });',
  "Object.assign(globalThis, { fetch: request });",
  'Object.assign(window, {}, { ["fetch"]: request });',
];

test.each(lintBatch(behaviorReplacements, true, "testing"))(
  "rejects behavior replacement without autofixing: %s",
  (_code, result) => {
    expect(result.status).toBe(1);
    expect(result.output).toContain("Do not replace");
    expect(result.code).toBe(_code);
  },
);

const realImplementations = [
  'import { env } from "cloudflare:workers"; use({ ...env, TOKEN: "configured-value" });',
  'import { env } from "cloudflare:workers"; use({ ...env, TOKEN: env.OTHER_TOKEN });',
  'import { env } from "cloudflare:workers"; function inspect(env) { return { ...env, onEvent() {} }; }',
  "const settings = {}; use({ ...settings, onEvent() {} });",
  'import { clearMocks } from "@tauri-apps/api/mocks"; clearMocks();',
  'import { mockIPC } from "./application"; mockIPC();',
  'import * as native from "@tauri-apps/api/core"; native.invoke("window");',
  "const mocks = { mockIPC: observe }; mocks.mockIPC();",

  "const key = chooseKey(); globalThis[key] = replacement;",
  // oxlint-disable-next-line no-template-curly-in-string
  "globalThis[`custom${suffix}`] = value;",
  "Object.assign(globalThis, enabled ? { fixtureValue: 1 } : {});",
  "Object.assign(navigator, (prepare({ clipboard: replacement }), { fixtureValue: 1 }));",
  "const { mockClear: clear } = observer; clear();",
  "const mockReturnValue = transform; mockReturnValue(123);",

  'import { env } from "cloudflare:workers"; function verify() { return null; } verify = realVerify; env.AUTH = { verify };',
  'import { env } from "cloudflare:workers"; import { verify } from "./auth"; env.AUTH = { verify };',
  'import { env } from "cloudflare:workers"; function verify() { return null; } function configure(verify) { env.AUTH = { verify }; }',
  'import { env } from "cloudflare:workers"; function verify(verify) { env.AUTH = { verify }; }',
  'import { env } from "cloudflare:workers"; import { verify } from "./auth"; env.AUTH = { verify: verify.bind(null) };',
  'import { env } from "cloudflare:workers"; function verify() {} function configure(verify) { env.AUTH = { verify: verify.bind(null) }; }',
  'import { env } from "cloudflare:workers"; function create() { return native; } env.AUTH = create();',
  'import { env } from "cloudflare:workers"; const factory = { bind() { return native; } }; env.AUTH = factory.bind();',

  'import { runInDurableObject } from "cloudflare:test"; runInDurableObject(stub, async (instance, state) => { await state.storage.put("key", "value"); });',
  'import { runInDurableObject } from "cloudflare:test"; runInDurableObject(stub, (instance) => { instance.env.TOKEN = "token"; });',
  'import { runInDurableObject } from "cloudflare:test"; runInDurableObject(stub, (instance) => { vi.spyOn(instance, "fetch"); });',
  'import { runInDurableObject } from "other"; runInDurableObject(stub, (instance) => { instance.fetch = () => null; });',
  'import { runInDurableObject } from "cloudflare:test"; runInDurableObject(stub, (instance) => { function configure(instance) { instance.fetch = () => null; } });',
  'import { runInDurableObject } from "cloudflare:test"; function configure(runInDurableObject) { runInDurableObject(stub, (instance) => { instance.fetch = () => null; }); }',
  'import { env } from "cloudflare:workers"; env.AUTH = enabled ? new Auth(context, env) : existing;',
  'import { withEnv } from "cloudflare:workers"; withEnv(enabled ? { TOKEN: "token" } : {}, run);',
  'import { env } from "cloudflare:workers"; env.AUTH = existing || new Auth(context, env);',
  'import { env } from "cloudflare:workers"; env.AUTH = (() => null, native);',
  'import { env } from "cloudflare:workers"; env.AUTH = (() => null) ? native : other;',
  'import { env } from "cloudflare:workers"; const replacement = enabled ? replacement : native; env.AUTH = replacement;',
  'import { env } from "cloudflare:workers"; env.AUTH = new Auth(context, env);',
  'import { env } from "cloudflare:workers"; env.TOKEN = "token";',
  'import { env } from "cloudflare:workers"; Reflect.deleteProperty(env, "AUTH");',
  'import { env } from "cloudflare:workers"; Object.assign(env, { TOKEN: "token", ENABLED: false });',
  'import { withEnv } from "cloudflare:workers"; withEnv({ TOKEN: "token" }, async () => run());',
  'import { withEnv } from "cloudflare:workers"; withEnv({ AUTH: new Auth(context, env) }, run);',
  'import { env } from "other"; env.AUTH = { verify: () => null };',
  "function configure(env) { env.AUTH = { verify: () => null }; }",
  'import { env } from "cloudflare:workers"; function configure(env) { env.AUTH = { verify: () => null }; }',
  'import { env } from "cloudflare:workers"; const replacement = { ...replacement, TOKEN: "token" }; Object.assign(env, replacement);',
  "const controller = new AbortController(); controller.abort();",
  "const signal = AbortSignal.timeout(10); signal.throwIfAborted();",
  "AbortSignal.any([AbortSignal.abort(), new AbortController().signal]);",
  "vi.spyOn(AbortSignal, 'timeout');",
  "vi.spyOn(AbortController.prototype, 'abort');",
  "function configure(AbortSignal) { AbortSignal.timeout = timeout; }",
  "const AbortController = localController; AbortController.prototype.abort = abort;",
  "let { mock: replace } = vi; replace = custom; replace('client');",
  "let tools = vi; tools = custom; tools.mock('client');",
  "var tools = vi; var tools = custom; tools.mock('client');",
  "let key = 'clipboard'; key = '__CONFIG__'; Reflect.set(navigator, key, config);",
  "let { defineProperty: define } = Object; define = custom; define(navigator, 'clipboard', { value: clipboard });",
  "let target = navigator; target = config; target.clipboard = clipboard;",
  "let tools = { mock() {} }; tools.mock('client');",
  "let observe = vi.spyOn; observe(navigator.clipboard, 'readText');",
  "let create = vi.fn; create();",
  "vi.fn.call(vi);",
  "vi.fn.apply(vi, []);",
  "vi.fn.apply(vi, [undefined]);",
  "vi.fn.apply(vi, [, () => 1]);",
  "const create = vi.fn.bind(vi); create();",
  "vi.fn.bind(vi, () => 1);",
  'vi.mock.bind(vi, "client");',
  'vi.spyOn.call(vi, client, "send");',
  'Reflect.apply(vi.spyOn, vi, [client, "send"]);',
  'const observe = vi.spyOn.bind(vi, client); observe("send");',
  'vi.mock.call(vi, "client", { spy: true });',
  'vi.mock.apply(vi, ["client", { spy: true }]);',
  'const observe = vi.mock.bind(vi, "client", { spy: true }); observe();',
  'Reflect.apply(vi.mock, vi, ["client", { spy: true }]);',
  'const vi = { mock() {} }; vi.mock.call(vi, "client");',
  'function instrument(Object) { Object.defineProperty.call(Object, navigator, "clipboard", { value: clipboard }); }',
  'function instrument(Reflect) { Reflect.apply(vi.mock, vi, ["client"]); }',
  "const navigator = {}; const assign = Object.assign.bind(Object, navigator); assign({ gpu });",
  'Object.defineProperty.call(Object, window, "__CONFIG__", { value: config });',
  "const assign = Object.assign.bind(Object, config); assign({ fetch: request });",
  "const create = alias; const alias = create; create();",

  'const key = "__CONFIG__"; Object.defineProperty(window, key, { value: config });',
  'const key = "fetch"; const window = {}; window[key] = request;',
  'function update(Object) { const define = Object.defineProperty; define(navigator, "clipboard", { value: clipboard }); }',
  'function update(Reflect) { const { set } = Reflect; set(navigator, "gpu", gpu); }',
  'const objects = { defineProperty() {} }; objects.defineProperty(navigator, "clipboard", { value: clipboard });',
  'const define = Object.defineProperty; const navigator = {}; define(navigator, "clipboard", { value: clipboard });',
  "const { assign } = Object; const replacement = { __CONFIG__: config }; assign(window, { ...replacement });",
  "const replacement = { fetch: request }; Object.assign(config, { ...replacement });",
  "const replacement = { ...replacement }; Object.assign(window, { ...replacement });",
  'const key = "readText"; navigator.clipboard[key]();',
  'import { vi } from "vitest"; const key = "spyOn"; vi[key](navigator.clipboard, "readText");',
  'const key = "mock"; const vi = { mock() {} }; vi[key]("client");',
  'const { defineProperty } = Object; const key = "__CONFIG__"; defineProperty(window, key, { value: config });',

  "function run(navigator) { const { clipboard } = navigator; clipboard.writeText = write; }",
  "const navigator = custom; const host = navigator as Navigator; host.clipboard = clipboard;",
  "function run(Navigator) { Navigator.prototype.clipboard = clipboard; }",
  'const Document = custom; Object.defineProperty(Document.prototype, "querySelector", { value: find });',
  'const { clipboard } = navigator; clipboard.writeText("actual text");',
  'const { document: page } = globalThis; page.title = "Actual title";',
  'const host = navigator as Navigator; host.clipboard.writeText("actual text");',
  "Object.assign(Document.prototype, { applicationConfiguration: configuration });",
  "const api = { vi: custom }; const { vi: tools } = api; tools.fn(() => 1);",
  'import * as api from "vitest"; const { vi: tools } = api; tools.fn();',
  'import * as api from "vitest"; const { vi: tools } = api; tools.mock("client", { spy: true });',
  "const { clipboard: first } = second; const { clipboard: second } = first; first.writeText = write;",
  'delete document.documentElement.dataset["platform"];',
  'Reflect.deleteProperty(globalThis, "__APP_API_URL__");',

  'document.cookie = "session=present";',
  'document.title = "Ready";',
  'const node = document; node.body.textContent = "Ready";',
  'function run(document) { document.visibilityState = "hidden"; }',
  "const navigator = { clipboard: null }; navigator.clipboard = clipboard;",
  "const navigator = { userAgentData: null }; navigator.userAgentData = hints;",
  "const navigator = { clipboard: {} }; navigator.clipboard.writeText = write;",
  "function run(localStorage) { localStorage.getItem = read; }",
  "const first = second.clipboard; const second = first.clipboard; first.writeText = write;",
  'localStorage.setItem("name", "value");',
  'navigator.clipboard.writeText("value");',
  "const Date = { now }; Date.now = read;",
  "function run(Storage) { Storage.prototype.setItem = write; }",
  'history.pushState({}, "", "/settings");',
  'document.addEventListener("click", listener);',
  "Object.assign(document, { appConfiguration: configuration });",
  "const first = second; const second = first; first.fetch = request;",
  "function run(window) { const root = window; root.fetch = request; }",
  "const root = globalThis; const options = { setting: true }; Object.assign(root, options);",
  "const api = { vi: { fn: callback => callback } }; const tools = api; tools.vi.fn(() => 42);",
  "const tools = vi; tools.fn();",
  'const tools = vi; tools.mock("client", { spy: true });',
  "const vi = { fn: callback => callback }; const tools = vi; tools.fn(() => 42);",
  "const first = second; const second = first; first.fn(() => 42);",
  'import { vi } from "vitest"; const received = vi.fn();',
  "const fake = vi.fn; fake();",
  'const { mock: observe } = vi; observe("client", { spy: true });',
  "const { fn: run } = custom; run(() => 42);",
  "const call = other; const other = call; call(() => 42);",
  'function run(mock) { mock("client"); }',

  "vi.fn(undefined);",
  'vi.spyOn(console, "info");',
  'vi.spyOn(globalThis, "fetch");',
  'vi.mock(import("client"), { spy: true });',
  'vi.doMock("client", { spy: true });',
  "vi.mockObject(client, { spy: true });",
  "vi.mocked(client);",
  'vi.stubEnv("NODE_ENV", "test");',
  "vi.useFakeTimers(); vi.setSystemTime(0);",
  "vi.restoreAllMocks(); vi.clearAllMocks();",
  "send.mockReset();",
  "const vi = { fn: callback => callback }; vi.fn(() => 42);",
  "function run(vi) { vi.stubGlobal('fetch', request); }",
  'Object.defineProperty(globalThis, "appConfiguration", { value: configuration });',
  "Object.assign(globalThis, { appConfiguration: configuration });",
  "globalThis.appConfiguration = configuration;",
  "function setup(CompressionStream) { CompressionStream = stream; }",
  "function setup(window) { window.ResizeObserver = Observer; }",
  "const client = { fetch: request }; client.fetch = request;",
  "function run(fetch) { fetch = request; }",
  "function run(globalThis) { globalThis.fetch = request; }",
  'Object.defineProperty(client, "fetch", { value: request });',
  'Reflect.set(client, "fetch", request);',
  "Object.defineProperties(globalThis, { setting: { value: true } });",
  'function run(Reflect) { Reflect.set(globalThis, "fetch", request); }',
  "Object.assign(globalThis, { testSetting: true });",
  'import { http, HttpResponse } from "msw"; http.get("/api", () => HttpResponse.json({ ok: true }));',
];

test.each(lintBatch(realImplementations, false, "testing"))(
  "allows real implementations and observation: %s",
  (_code, result) => {
    expect(result.status).toBe(0);
  },
);

test.each(["../../../../.oxlintrc.jsonc"])(
  "enforces the rule through the repository config %s",
  (path) => {
    const result = lint(
      'import { vi } from "vitest"; vi.stubGlobal("fetch", vi.fn());',
      false,
      "testing",
      fileURLToPath(new URL(path, import.meta.url)),
    );

    expect(result.status).toBe(1);
    expect(result.output).toContain("landmines-testing(no-test-doubles)");
  },
);

test.each(["navigation.ts", "browser.ts", "runtime.ts"])(
  "allows native production instrumentation in %s",
  (filename) => {
    expect(
      lint(
        'globalThis.history.pushState = push; Object.defineProperty(navigator, "clipboard", { value: clipboard }); Document.prototype.querySelector = find; Object.defineProperty(Navigator.prototype, "clipboard", { value: clipboard }); const key = "clipboard"; const { defineProperty } = Object; defineProperty(Navigator.prototype, key, { value: clipboard }); const replacement = { querySelector: find }; Object.assign(Document.prototype, { ...replacement }); const assign = Object.assign.bind(Object, Document.prototype); assign({ querySelector: find }); Object.defineProperty.call(Object, navigator, "clipboard", { value: clipboard }); Reflect.apply(Reflect.set, Reflect, [navigator, "gpu", gpu]);',
        false,
        "testing",
        undefined,
        filename,
      ).status,
    ).toBe(0);
  },
);

test.each([
  ["browser.test.ts", ""],
  ["browser.fixture.ts", ""],
  ["browser.ts", 'import { vi } from "vitest";'],
  ["browser.ts", 'import { test } from "node:test";'],
])("rejects replacements in test context %s %s", (filename, imports) => {
  expect(
    lint(
      `${imports} globalThis.history.pushState = push;`,
      false,
      "testing",
      undefined,
      filename,
    ).status,
  ).toBe(1);
});

test("rejects framework replacements in production paths", () => {
  expect(
    lint('vi.mock("client");', false, "testing", undefined, "browser.ts")
      .status,
  ).toBe(1);
});

test("rejects native type assertion aliases in TypeScript files", () => {
  const result = lint(
    "const host = <Navigator>navigator; host.clipboard = clipboard;",
    false,
    "testing",
    undefined,
    "native.test.ts",
  );

  expect(result.status).toBe(1);
  expect(result.output).toContain("Do not replace");
});

const nativeReaderReplacements = [
  "FileReader.prototype.readAsText = replacement;",
  "const reader = FileReader.prototype; reader.readAsArrayBuffer = replacement;",
  "const { prototype: reader } = FileReader; const method = `readAsDataURL`; Reflect.set(reader, method, replacement);",
  "Object.assign(FileReader.prototype, { abort: replacement });",
  "delete FileReader.prototype.readAsBinaryString;",
  "IntersectionObserver.prototype.observe = replacement;",
  "const observer = IntersectionObserver.prototype; Object.defineProperty(observer, 'unobserve', { value: replacement });",
  "const { IntersectionObserver: Observer } = globalThis; const method = 'takeRecords'; Observer.prototype[method] = replacement;",
  "Reflect.deleteProperty(IntersectionObserver.prototype, 'disconnect');",
  "ResizeObserver.prototype.observe = replacement;",
  "const { prototype: observer } = ResizeObserver; Object.assign(observer, { unobserve: replacement });",
  "Object.defineProperties(ResizeObserver.prototype, { disconnect: { value: replacement } });",
  "MutationObserver.prototype.observe = replacement;",
  "const observer = MutationObserver.prototype; observer[`takeRecords`] = replacement;",
  "Reflect.set(MutationObserver.prototype, 'disconnect', replacement);",
];

test.each(lintBatch(nativeReaderReplacements, false, "testing"))(
  "rejects native reader and observer prototype replacement: %s",
  (_code, result) => {
    expect(result.status).toBe(1);
    expect(result.output).toContain("Do not replace");
  },
);

const realReaderBehavior = [
  "new FileReader().readAsText(file);",
  "const observer = new IntersectionObserver(callback); observer.observe(element); observer.unobserve(element); observer.disconnect(); observer.takeRecords();",
  "const observer = new ResizeObserver(callback); observer.observe(element); observer.unobserve(element); observer.disconnect();",
  "const observer = new MutationObserver(callback); observer.observe(element, options); observer.disconnect(); observer.takeRecords();",
  "vi.spyOn(FileReader.prototype, 'readAsText');",
  "vi.spyOn(IntersectionObserver.prototype, 'observe');",
  "vi.spyOn(ResizeObserver.prototype, 'disconnect');",
  "vi.spyOn(MutationObserver.prototype, 'takeRecords');",
  "function configure(FileReader) { FileReader.prototype.readAsText = replacement; }",
  "import { IntersectionObserver } from './application'; IntersectionObserver.prototype.observe = replacement;",
  "const ResizeObserver = ApplicationObserver; ResizeObserver.prototype.observe = replacement;",
  "function configure(MutationObserver) { Object.assign(MutationObserver.prototype, { observe: replacement }); }",
  "const method = chooseMethod(); FileReader.prototype[method] = replacement;",
];

test.each(lintBatch(realReaderBehavior, false, "testing"))(
  "allows real or unrelated reader and observer behavior: %s",
  (_code, result) => {
    expect(result.status).toBe(0);
  },
);

const productionReaderInstrumentation = [
  "FileReader.prototype.readAsText = instrumentedRead;",
  "Object.assign(IntersectionObserver.prototype, { observe: instrumentedObserve });",
  "Object.defineProperty(ResizeObserver.prototype, 'disconnect', { value: instrumentedDisconnect });",
  "MutationObserver.prototype.takeRecords = instrumentedTakeRecords;",
];

test.each(
  lintBatch(
    productionReaderInstrumentation,
    false,
    "testing",
    undefined,
    "browser.ts",
  ),
)(
  "allows production reader and observer instrumentation: %s",
  (_code, result) => {
    expect(result.status).toBe(0);
  },
);

const rawConfigResponses = [
  "export default { outboundService: () => Response.json({ tools: [] }) };",
  'export default { serviceBindings: { API: async () => new Response("ok") } };',
  'async function reply() { return Response.redirect("https://example.com"); } export default { outboundService: reply };',
  "const reply = () => Response.error(); const alias = reply; export default { serviceBindings: { API: alias } };",
  "function response(request) { if (request) return Response.json({}); return new Response(); } export default { outboundService: (request) => response(request) };",
  'function response() { return new Response(); } function upstream(name) { return async (request) => response(request, name); } export default { serviceBindings: { API: upstream("api") } };',
  "const responder = async () => { const value = Response.json({}); return await value; }; const bindings = { API: responder }; export default { serviceBindings: { ...bindings } };",
  'const key = "outboundService"; export default { [key]: () => enabled ? new Response() : fetch(url) };',
  'export default { outboundService: () => { switch (mode) { case "ok": return new Response(); default: return fetch(url); } } };',
  "export default { outboundService: () => { try { return fetch(url); } catch { return Response.error(); } } };",
];

test.each(
  lintBatch(
    rawConfigResponses,
    false,
    "testing",
    undefined,
    "vitest.config.mts",
  ),
)("rejects raw config HTTP responses: %s", (_code, result) => {
  expect(result.status).toBe(1);
});

const nativeConfigResponses = [
  'export default { serviceBindings: { API: "actual-worker", STORAGE: { name: "storage" } } };',
  "export default { outboundService: (request) => fetch(request), serviceBindings: { API: (request) => env.ASSETS.fetch(request) } };",
  'import { http, getResponse } from "msw"; const handlers = [http.get("*", () => Response.json({}))]; export default { outboundService: (request) => getResponse(handlers, request) };',
  'import { http, getResponse } from "msw"; export default { serviceBindings: { API: (request) => getResponse([http.all("*", () => new Response())], request) } };',
  'import { http, getResponse } from "msw"; function upstream(name) { const handlers = [http.all("*", () => new Response(name))]; return async (request) => { const response = await getResponse(handlers, request); if (!response) throw new Error(name); return response; }; } export default { serviceBindings: { API: upstream("api") } };',
  "const Response = custom; export default { outboundService: () => Response.json({}) };",
  "export default { outboundService: () => { function unused() { return new Response(); } return fetch(url); } };",
  "function recursive() { return recursive(); } export default { outboundService: recursive };",
];

test.each(
  lintBatch(
    nativeConfigResponses,
    false,
    "testing",
    undefined,
    "vitest.config.ts",
  ),
)("allows native or MSW config HTTP: %s", (_code, result) => {
  expect(result.status).toBe(0);
});

test("allows production response handlers outside Vitest config", () => {
  expect(
    lint(
      "export default { outboundService: () => new Response() };",
      false,
      "testing",
      undefined,
      "runtime.config.ts",
    ).status,
  ).toBe(0);
});

test.each([
  "vitest.config.ts",
  "vitest.config.mts",
  "vitest.config.cts",
  "vitest.config.js",
  "vitest.config.mjs",
  "vitest.config.cjs",
  String.raw`windows\vitest.config.ts`,
])("rejects aliased native responses in config %s", (filename) => {
  const code =
    'const NativeResponse = Response; export default { outboundService: () => new NativeResponse("ok") };';

  expect(lint(code, false, "testing", undefined, filename).status).toBe(1);
});

const savedMethodReplacements = [
  "const original = router.navigate; router.navigate = async () => { throw new Error('failed'); }; try { await run(); } finally { router.navigate = original; }",
  "const alias = router; const original = alias.navigate; router.navigate = () => undefined; alias.navigate = original;",
  "const key = 'navigate'; const original = router[key]; router[`navigate`] = function () {}; router.navigate = original;",
  "const original = client.send; function replacement() { return false; } client.send = replacement; client.send = original;",
  "const original = client.send; client.send = (...args) => Reflect.apply(original, this, args); client.send = original;",
  "const original = client.send; client.send = async function (...args) { return Reflect.apply(original, this, args); }; client.send = original;",
  "const original = client.send; client.send = function* (...args) { return Reflect.apply(original, this, args); }; client.send = original;",
  "const original = client.send; client.send = function (...args) { args.reverse(); return Reflect.apply(original, this, args); }; client.send = original;",
  "const original = client.send; client.send = function (...args) { Reflect.set(args, 0, 'changed'); return Reflect.apply(original, this, args); }; client.send = original;",
  "const original = client.send; client.send = function (...args) { Reflect.apply(original, this, args); return false; }; client.send = original;",
  "const original = client.send; client.send = function (...args) { Reflect.apply(original, this, args); throw new Error('failed'); }; client.send = original;",
  "const original = client.send; client.send = function (...args) { args[0] = 'changed'; return Reflect.apply(original, this, args); }; client.send = original;",
  "const original = client.send; client.send = function (...args) { return Reflect.apply(original, other, args); }; client.send = original;",
  "const original = client.send; client.send = function (...args) { throw new Error('failed'); return Reflect.apply(original, this, args); }; client.send = original;",
  "import { client } from './client'; const original = client.send; client.send = () => false; client.send = original;",
];

test.each(lintBatch(savedMethodReplacements, false, "testing"))(
  "rejects saved and restored handwritten method replacement: %s",
  (_code, result) => {
    expect(result.status).toBe(1);
    expect(result.output).toContain("Do not replace");
  },
);

const unrelatedCallbacks = [
  "const original = router.navigate; router.navigate = () => false; other.navigate = original;",
  "const original = router.navigate; router.navigate = () => false; router.refresh = original;",
  "const original = router.navigate; other.navigate = () => false; router.navigate = original;",
  "const original = router.navigate; function configure(router) { router.navigate = () => false; } router.navigate = original;",
  "const original = router.navigate; router.navigate = () => false; function restore(original) { router.navigate = original; }",
  "const original = router.navigate; router.navigate = original;",
  "const callbacks = {}; callbacks.onReady = () => false;",
  "const original = client.send; client.send = function (...args) { calls.push(args); return Reflect.apply(original, this, args); }; client.send = original;",
  "const original = client.send; client.send = function (...args) { return Reflect.apply(original, this, args); }; client.send = original;",
  "const original = configuration.options; configuration.options = { onReady: () => {} }; configuration.options = original;",
  "const original = window.onmessage; window.onmessage = () => {}; window.onmessage = original;",
  "const original = document.onclick; document.onclick = () => {}; document.onclick = original;",
  "import { configuration } from './configuration'; configuration.callback = () => false;",
  "const key = selectKey(); const original = router[key]; router[key] = () => false; router[key] = original;",
];

test.each(lintBatch(unrelatedCallbacks, false, "testing"))(
  "does not infer replacement from unmatched references or ordinary callbacks: %s",
  (_code, result) => {
    expect(result.status).toBe(0);
  },
);

test("allows saved method instrumentation outside test code", () => {
  expect(
    lint(
      "const original = router.navigate; router.navigate = () => false; router.navigate = original;",
      false,
      "testing",
      undefined,
      "runtime.ts",
    ).status,
  ).toBe(0);
});

test.each([
  'await route.fulfill({body: "fake"});',
  'await route.fulfill(enabled ? {body: "fake"} : native);',
  "await route.fulfill(options || {json: {ok: true}});",
  'await route.fulfill({body: enabled ? originalBody : "fallback"});',
  "await route.fulfill({status: response.status ?? 503});",
  'const response = {status: 503, body: "offline"}; await route.fulfill(response);',
  'const alias = route; await alias["fulfill"]({json: {ok: true}});',
  'const payload = {body: "fake"}; await route.fulfill({...payload});',
  'const status = 503; await route.fulfill({["status"]: status});',
])("rejects static Playwright network responses: %s", (body) => {
  expect(
    lint(
      `import {chromium as engine} from "@playwright/test"; const browser = await engine.launch(); const context = await browser.newContext(); const page = await context.newPage(); await page.route("**/*", async route => {${body}});`,
      false,
      "testing",
    ).status,
  ).toBe(1);
});

test.each([
  "await route.continue();",
  "await route.fallback();",
  "const response = await route.fetch(); await route.fulfill({response});",
  "const response = await getResponse(handlers, request); await route.fulfill({status: response.status, headers: Object.fromEntries(response.headers), body: Buffer.from(await response.arrayBuffer())});",
  'function nested(route) { return route.fulfill({body: "unrelated"}); }',
  "const response = {...response}; await route.fulfill(response);",
])("allows native routing and MSW response adapters: %s", (body) => {
  expect(
    lint(
      `import {chromium} from "playwright"; const browser = await chromium.launch(); const page = await browser.newPage(); await page.route("**/*", async route => {${body}});`,
      false,
      "testing",
    ).status,
  ).toBe(0);
});

test("does not infer Playwright from a generic route method", () => {
  expect(
    lint(
      'import {chromium} from "playwright"; const page = router; page.route("/order", route => route.fulfill({status: 200, body: "domain value"}));',
      false,
      "testing",
    ).status,
  ).toBe(0);
});

const playwrightParameterReplacements = [
  'import type {Page as BrowserPage} from "@playwright/test"; async function attach(page: BrowserPage) { await page.route("**/*", route => route.fulfill({body: "fake"})); }',
  'import type {Route} from "playwright"; async function handler(route: Route) { await route.fulfill({status: 503}); }',
];

test.each(lintBatch(playwrightParameterReplacements, false, "testing"))(
  "recognizes imported Playwright parameter types: %s",
  (_code, result) => {
    expect(result.status).toBe(1);
  },
);

test.each([
  "vitest.native.config.mts",
  "vitest.r2.config.mts",
  "vitest.flags.config.ts",
  "vitest.permissions.config.cts",
  "vitest.browser.integration.config.mjs",
  "vitest.local-worker.config.js",
])("enforces raw HTTP response policy in opt-in config %s", (filename) => {
  expect(
    lint(
      'export default {outboundService: () => new Response("fake"), serviceBindings: {API: () => Response.json({ok: true})}};',
      false,
      "testing",
      undefined,
      filename,
    ).status,
  ).toBe(1);

  expect(
    lint(
      'import {getResponse, http} from "msw"; const handlers = [http.all("*", () => new Response("network"))]; export default {outboundService: request => getResponse(handlers, request), serviceBindings: {API: "actual-worker", STORAGE: {name: "storage"}}};',
      false,
      "testing",
      undefined,
      filename,
    ).status,
  ).toBe(0);

  expect(
    lint(
      'import {nativeBinding} from "./bindings"; export default {serviceBindings: {API: nativeBinding}, outboundService: request => fetch(request)};',
      false,
      "testing",
      undefined,
      filename,
    ).status,
  ).toBe(0);
});

test.each([
  "runtime.native.config.ts",
  "vitest-native.config.ts",
  "vitest.native.runtime.ts",
])("does not treat unrelated config %s as Vitest", (filename) => {
  expect(
    lint(
      'export default {outboundService: () => new Response("actual service")};',
      false,
      "testing",
      undefined,
      filename,
    ).status,
  ).toBe(0);
});

test("enforces opt-in config CommonJS handlers", () => {
  expect(
    lint(
      'module.exports = {outboundService: () => new Response("fake")};',
      false,
      "testing",
      undefined,
      "vitest.local-worker.config.cjs",
    ).status,
  ).toBe(1);

  expect(
    lint(
      'const {getResponse, http} = require("msw"); const handlers = [http.all("*", () => new Response("network"))]; module.exports = {outboundService: request => getResponse(handlers, request), serviceBindings: {API: "actual-worker"}};',
      false,
      "testing",
      undefined,
      "vitest.local-worker.config.cjs",
    ).status,
  ).toBe(0);
});

const rawHonoResponses = [
  'import { Hono } from "hono"; new Hono().request("/", {}, {API: {fetch: async () => new Response("fake")}});',
  'import { Hono as Router } from "hono"; const app = new Router().get("/", handler); const bindings = {TOKEN: {get: () => "secret"}}; app.request("/", {}, bindings);',
  'import { OpenAPIHono } from "@hono/zod-openapi"; function app() { return new OpenAPIHono().route("/", routes); } app().request("/", {}, {AUTH_SERVICE: {authorize: () => true}});',
  'import { Hono } from "hono"; const app = new Hono(); function bindings() { return {AUTH: {verify: () => true}}; } app.request("/", {}, bindings());',
  'import { Hono } from "hono"; const app = new Hono(); function fixture() { const env = {AUTH: {verify: () => true}}; return {env}; } function send(env) { return app.request("/", {}, env); } const {env} = fixture(); send(env);',
];

test.each(lintBatch(rawHonoResponses, false, "testing"))(
  "detects handwritten bindings passed to proven Hono applications: %s",
  (_code, result) => {
    expect(result.status).toBe(1);
  },
);

const realHonoBindings = [
  'import { Hono } from "another-router"; new Hono().request("/", {}, {API: {get: () => null}});',
  'import { Hono } from "hono"; function run(Hono) { new Hono().request("/", {}, {API: {get: () => null}}); }',
  'import { Hono } from "hono"; new Hono().request("/", {}, {TOKEN: "value", FLAGS: {enabled: true}});',
  'import { Hono } from "hono"; import {env} from "cloudflare:workers"; new Hono().request("/", {}, env);',
  'import { Hono } from "hono"; import {Service} from "./service"; new Hono().request("/", {}, {API: new Service()});',
  'import { Hono } from "hono"; import {FrontierAuth} from "../src/frontier-auth"; new Hono().request("/", {}, {AUTH_SERVICE: new FrontierAuth(state, env)});',
  'import { Hono } from "hono"; import {env} from "cloudflare:workers"; new Hono().request("/", {}, {EVENTS_SERVICE: env.EVENTS_SERVICE});',
  'import { Hono } from "hono"; const handlers = {onEvent() {}}; new Hono().request("/", {}, handlers);',
  'import { Hono } from "hono"; function circular() { return circular().env; } new Hono().request("/", {}, circular());',
];

test.each(lintBatch(realHonoBindings, false, "testing"))(
  "retains unrelated requests and real Hono bindings: %s",
  (_code, result) => {
    expect(result.status).toBe(0);
  },
);

test.each(["../src", "../src/index", "../src/index.ts"])(
  "recognizes repository Worker entry %s",
  (entry) => {
    expect(
      lint(
        `import app from "${entry}"; app.request("/", {}, {AUTH_SERVICE: {authenticate: () => null}});`,
        false,
        "testing",
        undefined,
        "src/workers/gateway/test/entry.test.ts",
      ).status,
    ).toBe(1);
  },
);

test.each([
  { entry: "../client", filename: "src/workers/gateway/test/entry.test.ts" },
  { entry: "../src", filename: "src/frontend/app/test/entry.test.ts" },
])("does not infer Worker entry provenance for %j", ({ entry, filename }) => {
  expect(
    lint(
      `import app from "${entry}"; app.request("/", {}, {AUTH_SERVICE: {authenticate: () => null}});`,
      false,
      "testing",
      undefined,
      filename,
    ).status,
  ).toBe(0);
});

test("reports a reused Hono replacement once across calls and env spread", () => {
  const result = lint(
    'import {Hono} from "hono"; import {env} from "cloudflare:workers"; const app = new Hono(); const bindings = {...env, API: {fetch: async () => new Response()}}; app.request("/", {}, bindings); app.request("/again", {}, bindings);',
    false,
    "testing",
  );

  expect(result.status).toBe(1);

  expect(
    result.output.match(/Do not replace test dependency behavior/gu),
  ).toHaveLength(1);
});

const cannedSdkTransports = [
  'import Knock from "@knocklabs/node"; new Knock({ fetch: () => Promise.resolve(Response.json({})) });',
  'import Knock from "@knocklabs/node"; const response = new Response(); new Knock({ fetch: async () => response });',
  'import Knock from "@knocklabs/node"; import { HttpResponse } from "msw"; new Knock({ fetch: () => HttpResponse.json({}) });',
  'import Knock from "@knocklabs/node"; import { HttpResponse as Response } from "msw"; new Knock({ fetch: () => new Response("ok") });',
  'import Knock from "@knocklabs/node"; import * as MSW from "msw"; new Knock({ fetch: () => MSW.HttpResponse.text("ok") });',
  'import Knock from "@knocklabs/node"; new Knock({ fetch: async () => Response.json({}) });',
  'import Client from "@knocklabs/node"; const Alias = Client; const fetcher = async () => new Response("ok"); const options = { fetch: fetcher }; new Alias(options);',
  'import { Knock as Client } from "@knocklabs/node"; new Client({ fetch() { return Response.json({}); } });',
  'import * as SDK from "@knocklabs/node"; new SDK.Knock({ fetch: () => Response.error() });',
  'import * as SDK from "@knocklabs/node"; const { default: Client } = SDK; new Client({ fetch: () => Response.redirect("https://example.test") });',
  'import Knock from "@knocklabs/node"; const options = { fetch: () => Response.json({}) }; new Knock({ ...options, apiKey: "test" });',
  'import Knock from "@knocklabs/node"; const options = { fetch: () => Response.json({}) }; new Knock({ fetch, ...options });',
  'import Knock from "@knocklabs/node"; function response() { return Response.json({}); } new Knock({ fetch: async () => response() });',
  'import Knock from "@knocklabs/node"; new Knock({ fetch: async request => request.method === "GET" ? Response.json({ connections: [] }) : Response.json({ workflow_run_id: "run" }) });',
  'import Knock from "@knocklabs/node"; function options() { return { fetch: () => new Response() }; } new Knock(options());',
  'import Knock from "@knocklabs/node"; new Knock(enabled ? { fetch: () => Response.json({}) } : { fetch });',
];

test.each(lintBatch(cannedSdkTransports, false, "testing"))(
  "rejects canned Knock SDK transports: %s",
  (_code, result) => {
    expect(result.status).toBe(1);
  },
);

const realSdkTransports = [
  'import Knock from "@knocklabs/node"; new Knock({ fetch: (...args) => Promise.resolve(fetch(...args)) });',
  'import Knock from "@knocklabs/node"; const Promise = other; new Knock({ fetch: () => Promise.resolve(Response.json({})) });',
  'import Knock from "@knocklabs/node"; new Knock({ apiKey: "test" });',
  'import Knock from "@knocklabs/node"; new Knock({ fetch });',
  'import Knock from "@knocklabs/node"; new Knock({ fetch: globalThis.fetch.bind(globalThis) });',
  'import Knock from "@knocklabs/node"; const observed = vi.spyOn(globalThis, "fetch"); new Knock({ fetch: observed });',
  'import Knock from "@knocklabs/node"; new Knock({ fetch: (...args) => fetch(...args) });',
  'import Knock from "@knocklabs/node"; const old = { fetch: () => Response.json({}) }; new Knock({ ...old, fetch });',
  'import Knock from "@knocklabs/node"; const old = { fetch: () => Response.json({}) }; const actual = { fetch }; new Knock({ ...old, ...actual });',
  'import Knock from "@knocklabs/node"; const old = { fetch: () => Response.json({}) }; new Knock({ ...old, ...unknown });',
  'import Knock from "unrelated"; new Knock({ fetch: () => Response.json({}) });',
  'import Knock from "@knocklabs/node"; function run(Knock) { new Knock({ fetch: () => Response.json({}) }); }',
  'import Knock from "@knocklabs/node"; new Knock({ onResponse: () => Response.json({}), fetch });',
  'import Knock from "@knocklabs/node"; const options = { ...options }; new Knock(options);',
];

test.each(lintBatch(realSdkTransports, false, "testing"))(
  "allows real or unproven SDK transports: %s",
  (_code, result) => {
    expect(result.status).toBe(0);
  },
);

test("reports a reused SDK transport once", () => {
  const result = lint(
    'import Knock from "@knocklabs/node"; const options = { fetch: () => Response.json({}) }; new Knock(options); new Knock({ ...options });',
    false,
    "testing",
  );

  expect(result.status).toBe(1);

  expect(
    result.output.match(/Do not replace test dependency behavior/gu),
  ).toHaveLength(1);
});

const nativeFetchReplacements = [
  "const transport: typeof fetch = async () => Response.json({});",
  'const transport: typeof globalThis.fetch = () => Promise.resolve(new Response("ok"));',
  "const transport: typeof window.fetch = async () => Response.error();",
  "type Transport = typeof fetch; const transport: Transport = async () => Response.json({});",
  "type Original = typeof fetch; type Transport = Original; const transport: Transport = async () => new Response();",
  'import { HttpResponse } from "msw"; const transport: typeof fetch = async () => HttpResponse.json({});',
  "type Transport = typeof fetch; function run(fetch) { const transport: Transport = async () => new Response(); }",
  "const native = globalThis.fetch; const transport: typeof native = async () => Response.json({});",
];

test.each(lintBatch(nativeFetchReplacements, false, "testing"))(
  "rejects canned implementations explicitly typed as native fetch: %s",
  (_code, result) => {
    expect(result.status).toBe(1);
  },
);

const realFetchTransports = [
  "const factory = () => Response.json({});",
  "const factory: () => Response = () => Response.json({});",
  "type Factory = () => Promise<Response>; const factory: Factory = async () => new Response();",
  "const transport: typeof fetch = fetch;",
  "const transport: typeof fetch = (...args) => fetch(...args);",
  'const transport: typeof fetch = vi.spyOn(globalThis, "fetch");',
  "const transport: typeof fetch = globalThis.fetch.bind(globalThis);",
  "function run(fetch) { const transport: typeof fetch = async () => Response.json({}); }",
  "function run(globalThis) { const transport: typeof globalThis.fetch = async () => Response.json({}); }",
  "function run(window) { const transport: typeof window.fetch = async () => Response.json({}); }",
  'import { fetch } from "other"; const transport: typeof fetch = async () => Response.json({});',
  "type Transport = typeof fetch; function run() { type Transport = () => Promise<Response>; const transport: Transport = async () => new Response(); }",
  "type First = Second; type Second = First; const transport: First = async () => new Response();",
  'const observer: MockInstance<typeof fetch> = vi.spyOn(globalThis, "fetch");',
];

test.each(lintBatch(realFetchTransports, false, "testing"))(
  "retains callbacks and genuine or unproven native fetch transports: %s",
  (_code, result) => {
    expect(result.status).toBe(0);
  },
);

test("reports a typed native fetch replacement once when reused as SDK transport", () => {
  const result = lint(
    'import Knock from "@knocklabs/node"; const transport: typeof fetch = async () => Response.json({}); new Knock({ fetch: transport });',
    false,
    "testing",
  );

  expect(result.status).toBe(1);

  expect(
    result.output.match(/Do not replace test dependency behavior/gu),
  ).toHaveLength(1);
});

test.each([
  "vi.mock('client', { spy: true });",
  "vi['mock'](import('client'), { 'spy': true });",
  "import { vi } from 'vitest'; vi.mock(import('client'), { spy: true });",
  "import { vi as observe } from 'vitest'; observe.mock('client', { spy: true });",
])("allows observation-only module instrumentation: %s", (code) => {
  expect(lint(code, false, "testing").status).toBe(0);
});

test.each([
  "vi.mock('client');",
  "vi.mock('client', () => ({ get: () => null }));",
  "vi.mock('client', { spy: false });",
  "vi.mock('client', { spy: true, factory: replacement });",
  "vi.mock('client', { spy: true, ...options });",
  "vi.mock('client', { get spy() { return true; } });",
  "vi.mock('client', { spy: true }, replacement);",
  "jest.mock('client', { spy: true });",
  "import { jest as vi } from '@jest/globals'; vi.mock('client', { spy: true });",
  "import { vi as mocker } from 'vitest'; mocker.mock('client', () => ({}));",
  "vi.unstable_mockModule('client', { spy: true });",
])("rejects behavior-changing module instrumentation: %s", (code) => {
  const result = lint(code, false, "testing");

  expect(result.status).toBe(1);
  expect(result.output).toContain("no-test-doubles");
});
