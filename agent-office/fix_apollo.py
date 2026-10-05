import re

with open("src/demo-parallel-failure.ts", "r") as f:
    code = f.read()

# find the apollo.invoke block
pattern = r"apollo\.invoke\s*=\s*async\s*\([^)]*\)\s*=>\s*\{.*?(?:return\s+\{\s*success:\s*true.*?;\s*\n\s*\};\n|\n\s*\};\n|return.*?;\s*\n\s*\};)"

apollo_mock = """apollo.invoke = async (prompt, context) => {
        apolloCallCount++;
        if (apolloCallCount === 1) {
            return {
                success: true,
                data: {
                    status: "FAIL",
                    evidence: ["Tests failed"],
                    failures: ["Server crashed"],
                    requiredFixes: ["Fix server crash"]
                }
            };
        }
        return {
            success: true,
            data: {
                status: "PASS",
                evidence: ["Tests passed"],
                failures: [],
                requiredFixes: []
            }
        };
    };"""

# Replace all occurrences of apollo.invoke = async ...
code = re.sub(pattern, apollo_mock, code, flags=re.DOTALL)

with open("src/demo-parallel-failure.ts", "w") as f:
    f.write(code)
