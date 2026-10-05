// dijkstra.cpp — example driver (compiled alongside tests/test_dijkstra.cpp)
// This file only defines runExample(); main() is in tests/test_dijkstra.cpp.
#include <iostream>
#include "graph.h"

void runExample() {
    // Example graph (5 vertices, directed weighted edges)
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

    std::vector<int> dist = g.shortestPath(0);

    std::cout << "\nExample: Dijkstra from vertex 0\n";
    std::cout << "Vertex\tDistance from 0\n";
    for (int i = 0; i < 5; ++i) {
        std::cout << i << "\t" << dist[i] << "\n";
    }
}
