#ifndef GRAPH_H
#define GRAPH_H

#include <vector>
#include <queue>
#include <limits>
#include <utility>

struct Edge {
    int to;
    int weight;
};

// Graph with adjacency list and Dijkstra's algorithm built in
class Graph {
public:
    explicit Graph(int vertices);
    void addEdge(int from, int to, int weight);

    // Returns a vector of shortest distances from 'start' to every vertex.
    // Unreachable vertices have value INT_MAX.
    std::vector<int> shortestPath(int start) const;

private:
    int V;
    std::vector<std::vector<Edge>> adj;
};

#endif // GRAPH_H
