/**
 * cpp_validation.test.ts
 * Deterministic tests for CppValidator and WriteFileTool integration.
 */
import assert from "assert";
import fs from "fs";
import path from "path";
import os from "os";
import { stripMarkdownFences, validateCppContent, isCppFile } from "../src/utils/CppValidator";
import { WriteFileTool } from "../src/tools/FileTools";

export async function run() {
    await runTests();
}

async function runTests() {
    console.log("Running C++ Validation Tests...");
    const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "cpp-test-"));

    // ── 1. Markdown fence stripping ──────────────────────────────────────────

    // 1a. Strip ```cpp fence
    const fenced1 = "```cpp\n#include <iostream>\nint main() { return 0; }\n```";
    const stripped1 = stripMarkdownFences(fenced1);
    assert.strictEqual(stripped1.includes("```"), false, "Should strip ```cpp fence");
    assert.ok(stripped1.includes("#include <iostream>"), "Should preserve content");
    console.log("✅ 1a. Strips ```cpp fence");

    // 1b. Strip generic ``` fence
    const fenced2 = "```\nint x = 5;\n```";
    const stripped2 = stripMarkdownFences(fenced2);
    assert.strictEqual(stripped2.includes("```"), false, "Should strip generic ``` fence");
    assert.ok(stripped2.includes("int x = 5;"), "Should preserve content");
    console.log("✅ 1b. Strips generic ``` fence");

    // 1c. No fence — return unchanged
    const noFence = "#include <vector>\nint main() { return 0; }";
    const stripped3 = stripMarkdownFences(noFence);
    assert.strictEqual(stripped3, noFence, "Should not modify non-fenced content");
    console.log("✅ 1c. No fence → unchanged");

    // 1d. Preserve legitimate backslash in C++ string literal
    const cppWithEscape = '```cpp\nstd::cout << "\\n";\n```';
    const stripped4 = stripMarkdownFences(cppWithEscape);
    assert.ok(stripped4.includes('"\\n"'), "Should preserve \\n in string literals");
    console.log("✅ 1d. Preserves \\n in string literals after fence strip");

    // ── 2. Namespace std rejection ───────────────────────────────────────────

    // 2a. Reject namespace std with class
    const nsStd = `#include <vector>\nnamespace std {\n    class priority_queue {};\n}`;
    const v1 = validateCppContent(nsStd, "test.cpp");
    assert.strictEqual(v1.valid, false, "Should reject namespace std");
    assert.ok(v1.errors.some(e => e.type === "NAMESPACE_STD"), "Should have NAMESPACE_STD error");
    console.log("✅ 2a. Rejects namespace std injection");

    // 2b. Accept valid user namespace
    const userNs = `#include <vector>\nnamespace mylib {\n    class Graph {};\n}`;
    const v2 = validateCppContent(userNs, "graph.cpp");
    assert.strictEqual(v2.valid, true, "Should accept user namespace");
    console.log("✅ 2b. Accepts valid user namespace");

    // ── 3. Truncation detection ──────────────────────────────────────────────

    // 3a. Reject clearly truncated source (unmatched brace)
    const truncated = `#include <iostream>\nclass Graph {\npublic:\n    void addEdge(int u, int v) {`;
    const v3 = validateCppContent(truncated, "graph.cpp");
    assert.strictEqual(v3.valid, false, "Should reject truncated source");
    assert.ok(v3.errors.some(e => e.type === "TRUNCATED"), "Should have TRUNCATED error");
    console.log("✅ 3a. Rejects truncated source (unmatched brace)");

    // 3b. Accept complete source
    const complete = `#include <iostream>\nint main() {\n    std::cout << "Hello" << std::endl;\n    return 0;\n}`;
    const v4 = validateCppContent(complete, "main.cpp");
    assert.strictEqual(v4.valid, true, `Should accept complete source. Errors: ${JSON.stringify(v4.errors)}`);
    console.log("✅ 3b. Accepts complete valid C++ source");

    // ── 4. Markdown fence in content (without outer fence) ───────────────────

    // 4a. Reject content that still has a fence line (missed stripping)
    const withFenceLine = "#include <iostream>\n```\nint main() { return 0; }\n```";
    const v5 = validateCppContent(withFenceLine, "main.cpp");
    assert.strictEqual(v5.valid, false, "Should reject content with fence inside");
    assert.ok(v5.errors.some(e => e.type === "MARKDOWN_FENCE"), "Should have MARKDOWN_FENCE error");
    console.log("✅ 4a. Rejects content with embedded markdown fence");

    // ── 5. WriteFileTool integration ─────────────────────────────────────────

    const writeTool = new WriteFileTool();

    // 5a. Write fenced C++ → fence stripped, file valid
    const fencedCpp = "```cpp\n#include <iostream>\nint main() { return 0; }\n```";
    await writeTool.execute({ path: "main.cpp", content: fencedCpp }, { workspaceRoot, projectId: "test" });
    const written = fs.readFileSync(path.join(workspaceRoot, "main.cpp"), "utf8");
    assert.strictEqual(written.includes("```"), false, "Written file should have no fences");
    assert.ok(written.includes("#include <iostream>"), "Written file should have content");
    console.log("✅ 5a. WriteFileTool strips fence before writing");

    // 5b. Write valid C++ → succeeds
    const validCpp = "#include <iostream>\nint main() {\n    std::cout << 42;\n    return 0;\n}";
    await writeTool.execute({ path: "valid.cpp", content: validCpp }, { workspaceRoot, projectId: "test" });
    assert.ok(fs.existsSync(path.join(workspaceRoot, "valid.cpp")), "valid.cpp should exist");
    console.log("✅ 5b. WriteFileTool writes valid C++ successfully");

    // 5c. Write namespace std C++ → throws
    const invalidCpp = "namespace std {\n    class bad {};\n}";
    let threw = false;
    try {
        await writeTool.execute({ path: "bad.cpp", content: invalidCpp }, { workspaceRoot, projectId: "test" });
    } catch (e: any) {
        threw = true;
        assert.ok(e.message.includes("C++ validation failed"), "Error should mention C++ validation");
    }
    assert.strictEqual(threw, true, "Should throw on namespace std injection");
    console.log("✅ 5c. WriteFileTool rejects namespace std injection");

    // 5d. Write truncated C++ → throws
    const truncCpp = "#include <iostream>\nvoid foo() {";
    let threwTrunc = false;
    try {
        await writeTool.execute({ path: "trunc.cpp", content: truncCpp }, { workspaceRoot, projectId: "test" });
    } catch (e: any) {
        threwTrunc = true;
    }
    assert.strictEqual(threwTrunc, true, "Should throw on truncated C++");
    console.log("✅ 5d. WriteFileTool rejects truncated C++");

    // 5e. Write non-C++ file → no C++ validation applied
    await writeTool.execute({ path: "readme.txt", content: "namespace std { this is fine in txt }" }, { workspaceRoot, projectId: "test" });
    assert.ok(fs.existsSync(path.join(workspaceRoot, "readme.txt")), "readme.txt should exist");
    console.log("✅ 5e. WriteFileTool does not apply C++ validation to non-C++ files");

    // ── 6. isCppFile detection ───────────────────────────────────────────────
    assert.strictEqual(isCppFile("main.cpp"), true);
    assert.strictEqual(isCppFile("graph.h"), true);
    assert.strictEqual(isCppFile("priority_queue.hpp"), true);
    assert.strictEqual(isCppFile("main.cc"), true);
    assert.strictEqual(isCppFile("app.js"), false);
    assert.strictEqual(isCppFile("index.ts"), false);
    assert.strictEqual(isCppFile("Makefile"), false);
    console.log("✅ 6. isCppFile correctly identifies C/C++ files");

    // Cleanup
    fs.rmSync(workspaceRoot, { recursive: true, force: true });

    console.log("\nAll C++ validation tests passed!");
}

runTests().catch(e => {
    console.error("FAILED:", e.message || e);
    process.exit(1);
});
