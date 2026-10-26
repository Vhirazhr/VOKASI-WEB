// Component behavior test with mocked auth. Does not contact Supabase or prove browser focus trapping.
// npm install --prefix /tmp/landing-tests react@19.3.1 react-test-renderer@19.3.1
// LANDING_TEST_RUNTIME=/tmp/landing-tests node tests/landing-access.mjs
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
const runtime = createRequire(
  `${process.env.LANDING_TEST_RUNTIME}/package.json`,
);
const React = runtime("react"),
  { act, create } = runtime("react-test-renderer");
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let account = null,
  failure = null,
  delayed = null,
  config = true,
  focused = 0,
  scrolled = 0;
const routes = [],
  calls = [];
const fakeDialog = {
  open: false,
  showModal() {
    this.open = true;
  },
  close() {
    this.open = false;
  },
};
const document = {
  body: { style: { overflow: "auto" } },
  activeElement: {
    focus() {
      focused++;
    },
  },
  getElementById() {
    return {
      scrollIntoView() {
        scrolled++;
      },
    };
  },
};
const exports = {};
const code = ts.transpileModule(
  fs.readFileSync("components/landing/LandingAccess.tsx", "utf8"),
  {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: true,
    },
  },
).outputText;
vm.runInNewContext(code, {
  exports,
  document,
  Error,
  require: (name) => {
    if (name === "react" || name === "react/jsx-runtime") return runtime(name);
    if (name === "next/navigation")
      return { useRouter: () => ({ push: (r) => routes.push(r) }) };
    if (name === "lucide-react")
      return Object.fromEntries(
        ["Eye", "EyeOff", "ShieldCheck", "X"].map((k) => [k, () => null]),
      );
    if (name === "@/lib/supabase") return { configured: () => config };
    if (name === "@/lib/auth")
      return {
        currentRole: async () => account,
        signIn: async (...args) => {
          calls.push(args);
          if (delayed) await delayed;
          if (failure) throw failure;
        },
      };
    if (name === "./SchoolMark")
      return { __esModule: true, default: () => null };
    throw Error(name);
  },
});
let renderer;
await act(async () => {
  renderer = create(
    React.createElement(
      exports.default,
      null,
      React.createElement(exports.AccessLink, { className: "login" }, "Login"),
      React.createElement(
        exports.AccessLink,
        { className: "rank", intent: "leaderboard" },
        "Lihat peringkat",
      ),
      React.createElement(
        exports.AccessLink,
        { className: "admin", role: "admin" },
        "Admin",
      ),
    ),
    {
      createNodeMock: (element) =>
        element.type === "dialog" ? fakeDialog : { focus() {} },
    },
  );
});
const root = renderer.root;
const click = async (className) => {
  await act(async () =>
    root
      .findAllByType("a")
      .find((node) => node.props.className === className)
      .props.onClick({ button: 0, preventDefault() {} }),
  );
};
const fill = async () => {
  await act(async () => {
    root
      .findByProps({ id: "vkw-identity" })
      .props.onChange({ target: { value: "Nama Siswa" } });
    root
      .findByProps({ id: "vkw-password" })
      .props.onChange({ target: { value: "test-only-password" } });
  });
};
const submit = async () => {
  await act(async () =>
    root.findByType("form").props.onSubmit({ preventDefault() {} }),
  );
};
const close = async () => {
  await act(async () =>
    root.findByProps({ "aria-label": "Tutup login" }).props.onClick(),
  );
};
await click("login");
assert.ok(fakeDialog.open);
assert.equal(document.body.style.overflow, "hidden");
await fill();
failure = Error("Password tidak cocok.");
await submit();
assert.equal(
  root.findByProps({ role: "alert" }).children.join(""),
  "Password tidak cocok.",
);
assert.equal(root.findByProps({ id: "vkw-password" }).props.value, "");
await close();
assert.ok(!fakeDialog.open);
assert.equal(document.body.style.overflow, "auto");
assert.ok(focused > 0);
failure = null;
await click("login");
await fill();
await submit();
assert.equal(routes.pop(), "/siswa");
assert.equal(calls.at(-1)[2], "student");
await click("admin");
await fill();
await submit();
assert.equal(routes.pop(), "/admin");
assert.equal(calls.at(-1)[2], "admin");
account = { role: "student" };
await click("login");
assert.equal(routes.pop(), "/siswa");
assert.ok(!fakeDialog.open);
await click("rank");
assert.equal(scrolled, 1);
assert.equal(routes.length, 0);
account = null;
await click("rank");
await fill();
await submit();
assert.equal(scrolled, 2);
assert.equal(routes.length, 0);
await click("login");
await fill();
let release;
delayed = new Promise((resolve) => (release = resolve));
let submitting;
await act(async () => {
  submitting = root.findByType("form").props.onSubmit({ preventDefault() {} });
});
await close();
await act(async () => {
  release();
  await submitting;
});
assert.equal(routes.length, 0, "No late redirect after modal closes");
delayed = null;
config = false;
await click("admin");
assert.ok(root.findByProps({ type: "submit" }).props.disabled);
await close();
await act(async () => renderer.unmount());
assert.equal(document.body.style.overflow, "auto");
console.log(
  "PASS: modal open/close, errors, password clearing, student/admin redirects, existing sessions, inline leaderboard login, stale async response, unavailable service.",
);
