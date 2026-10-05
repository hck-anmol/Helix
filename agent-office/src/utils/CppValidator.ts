/**
 * CppValidator - Validates generated C/C++ source code quality before acceptance.
 * Detects: namespace std pollution, markdown fences, truncation, brace imbalance.
 */

export interface CppValidationError {
    type: "NAMESPACE_STD" | "MARKDOWN_FENCE" | "TRUNCATED" | "BRACE_IMBALANCE";
    message: string;
    line?: number;
}

export interface CppValidationResult {
    valid: boolean;
    errors: CppValidationError[];
}

const CPP_EXTENSIONS = new Set([".cpp", ".cc", ".cxx", ".c", ".h", ".hpp", ".hxx"]);

export function isCppFile(filePath: string): boolean {
    const ext = require("path").extname(filePath).toLowerCase();
    return CPP_EXTENSIONS.has(ext);
}

export function validateCppContent(content: string, filePath: string): CppValidationResult {
    const errors: CppValidationError[] = [];
    const lines = content.split("\n");

    // 1. Check for markdown fences still present (shouldn't happen after stripping, but be defensive)
    for (let i = 0; i < lines.length; i++) {
        const trimmed = lines[i].trim();
        if (/^```/.test(trimmed)) {
            errors.push({
                type: "MARKDOWN_FENCE",
                message: `Markdown code fence found at line ${i + 1}: "${trimmed}". File content must be raw source code only.`,
                line: i + 1
            });
            break; // one is enough to signal the issue
        }
    }

    // 2. Check for namespace std { ... user-defined types ... }
    // This is invalid C++ - users must not inject into namespace std
    const namespacStdPattern = /namespace\s+std\s*\{/;
    for (let i = 0; i < lines.length; i++) {
        if (namespacStdPattern.test(lines[i])) {
            errors.push({
                type: "NAMESPACE_STD",
                message: `CRITICAL: Line ${i + 1} injects code into "namespace std". This is undefined behavior and will corrupt the C++ standard library. ` +
                    `Do NOT define classes, functions, or types inside namespace std. ` +
                    `Use your own namespace instead (e.g., "namespace dijkstra {" or "namespace mylib {").`,
                line: i + 1
            });
        }
    }

    // 3. Check for truncation - file ends without closing brace when it has open braces
    const trimmed = content.trimEnd();
    if (trimmed.length > 0) {
        const lastChar = trimmed[trimmed.length - 1];
        // Count braces
        let braceDepth = 0;
        let inString = false;
        let inChar = false;
        let inLineComment = false;
        let inBlockComment = false;
        
        for (let i = 0; i < trimmed.length; i++) {
            const ch = trimmed[i];
            const next = trimmed[i + 1];
            
            if (inLineComment) {
                if (ch === "\n") inLineComment = false;
                continue;
            }
            if (inBlockComment) {
                if (ch === "*" && next === "/") { inBlockComment = false; i++; }
                continue;
            }
            if (inString) {
                if (ch === "\\" && next === "\"") { i++; continue; }
                if (ch === "\"") inString = false;
                continue;
            }
            if (inChar) {
                if (ch === "\\" && next === "'") { i++; continue; }
                if (ch === "'") inChar = false;
                continue;
            }
            
            if (ch === "/" && next === "/") { inLineComment = true; continue; }
            if (ch === "/" && next === "*") { inBlockComment = true; continue; }
            if (ch === "\"") { inString = true; continue; }
            if (ch === "'") { inChar = true; continue; }
            if (ch === "{") braceDepth++;
            if (ch === "}") braceDepth--;
        }
        
        if (braceDepth > 0) {
            errors.push({
                type: "TRUNCATED",
                message: `File appears truncated: ${braceDepth} unclosed brace(s). The last character is "${lastChar}". ` +
                    `Please provide the COMPLETE file content with all braces, brackets, and statements properly closed.`
            });
        }
        
        // Also check: if file has function/class definitions but ends abruptly mid-statement
        if (lastChar !== ";" && lastChar !== "}" && lastChar !== "/" && content.trim().length > 50) {
            // Only flag as truncated if the file has C++ constructs but doesn't end properly
            if (/\{/.test(content) && braceDepth >= 0) {
                // Might be truncated mid-line
                const lastLine = lines[lines.length - 1].trim();
                if (lastLine.length > 0 && !lastLine.endsWith(";") && !lastLine.endsWith("}") && 
                    !lastLine.endsWith("{") && !lastLine.startsWith("//") && !lastLine.startsWith("*")) {
                    errors.push({
                        type: "TRUNCATED",
                        message: `File may be truncated: last line ends with incomplete statement: "${lastLine}". ` +
                            `Ensure the entire file is included in a single write_file call.`
                    });
                }
            }
        }
    }

    return {
        valid: errors.length === 0,
        errors
    };
}

/**
 * Strip markdown code fences from file content.
 * Handles: ```cpp, ```c++, ```c, ```h, ```hpp, ``` and variants with spaces.
 * Preserves all other content exactly.
 */
export function stripMarkdownFences(content: string): string {
    const lines = content.split("\n");
    
    // Check if first non-empty line is a fence opener
    let startIdx = 0;
    while (startIdx < lines.length && lines[startIdx].trim() === "") startIdx++;
    
    const firstLine = startIdx < lines.length ? lines[startIdx].trim() : "";
    const isFenceOpener = /^```(?:cpp|c\+\+|c|h|hpp|hxx|cc|cxx|plaintext)?$/i.test(firstLine);
    
    if (!isFenceOpener) return content; // nothing to strip
    
    // Check if last non-empty line is a fence closer
    let endIdx = lines.length - 1;
    while (endIdx >= 0 && lines[endIdx].trim() === "") endIdx--;
    
    const lastLine = endIdx >= 0 ? lines[endIdx].trim() : "";
    const isFenceCloser = lastLine === "```";
    
    // Remove the fence opener
    const result = lines.slice(0, startIdx)
        .concat(lines.slice(startIdx + 1, isFenceCloser ? endIdx : lines.length))
        .concat(isFenceCloser ? [] : lines.slice(endIdx + 1 || lines.length));
    
    return result.join("\n");
}
