// test_dijkstra.cpp — unit tests + integration entry point
// Compiled with: g++ -std=c++17 src/graph.cpp src/dijkstra.cpp tests/test_dijkstra.cpp -o build/dijkstra
#include <iostream>
#include <cassert>
#include <climits>
#include "src/graph.h"

void runExample(); // declared in src/dijkstra.cpp

static int passed = 0;
static int failed = 0;

#define ASSERT_EQ(got, expected, label)                             \
    do {                                                            \
        if ((got) == (expected)) {                                  \
            std::cout << "  [PASS] " << label << "\n";             \
            ++passed;                                               \
        } else {                                                    \
            std::cout << "  [FAIL] " << label                      \
                      << " — expected " << (expected)              \
                      << ", got " << (got) << "\n";                 \
            ++failed;                                               \
        }                                                           \
    } while(0)

void test_simple_path() {
    // 0 --(4)--> 1 --(2)--> 2
    // 0 --(10)-> 2
    // Shortest 0->2 should be 6 (via 1)
    Graph g(3);
    g.addEdge(0, 1, 4);
    g.addEdge(1, 2, 2);
    g.addEdge(0, 2, 10);

    auto dist = g.shortestPath(0);
    ASSERT_EQ(dist[0], 0,  "simple: dist[0]==0");
    ASSERT_EQ(dist[1], 4,  "simple: dist[1]==4");
    ASSERT_EQ(dist[2], 6,  "simple: dist[2]==6");
}

void test_unreachable() {
    // Isolated vertex 2
    Graph g(3);
    g.addEdge(0, 1, 5);

    auto dist = g.shortestPath(0);
    ASSERT_EQ(dist[0], 0, "unreachable: dist[0]==0");
    ASSERT_EQ(dist[1], 5, "unreachable: dist[1]==5");
    ASSERT_EQ(dist[2], INT_MAX, "unreachable: dist[2]==INT_MAX");
}

void test_5node_graph() {
    // Same graph as the example in dijkstra.cpp
    Graph g(5);
    g.addEdge(0, 1, 10);
    g.addEdge(0, 4, 3);
    g.addEdge(1, 2, 2);
    g.addEdge(1, 4, 4);
    g.addEdge(2, 3, 9);
    g.addEdge(3, 2, 7);
    g.addEdge(4, 1, 1);
    g.addEdge(4, 2, 8);
    g.addEdge(4, 3, 2);

    auto dist = g.shortestPath(0);
    // 0->4: 3, 0->4->1: 4, 0->4->1->2: 6, 0->4->3: 5
    ASSERT_EQ(dist[0], 0, "5node: dist[0]");
    ASSERT_EQ(dist[4], 3, "5node: dist[4]");
    ASSERT_EQ(dist[1], 4, "5node: dist[1]");
    ASSERT_EQ(dist[2], 6, "5node: dist[2]");
    ASSERT_EQ(dist[3], 5, "5node: dist[3]");
}

int main() {
    std::cout << "=== Dijkstra Test Suite ===\n";

    std::cout << "\n[Test 1] Simple path:\n";
    test_simple_path();

    std::cout << "\n[Test 2] Unreachable vertex:\n";
    test_unreachable();

    std::cout << "\n[Test 3] 5-node graph:\n";
    test_5node_graph();

    std::cout << "\n=== Results: " << passed << " passed, " << failed << " failed ===\n";

    // Print the example output
    runExample();

    return (failed == 0) ? 0 : 1;
}
