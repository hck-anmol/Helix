#include "graph.h"

Graph::Graph(int vertices) : V(vertices), adj(vertices) {}

void Graph::addEdge(int from, int to, int weight) {
    adj[from].push_back({to, weight});
}

std::vector<int> Graph::shortestPath(int start) const {
    std::vector<int> dist(V, std::numeric_limits<int>::max());
    // min-heap: (distance, vertex)
    std::priority_queue<
        std::pair<int,int>,
        std::vector<std::pair<int,int>>,
        std::greater<std::pair<int,int>>
    > pq;

    dist[start] = 0;
    pq.push({0, start});

    while (!pq.empty()) {
        int d = pq.top().first;
        int u = pq.top().second;
        pq.pop();

        if (d > dist[u]) continue; // stale entry

        for (const auto& edge : adj[u]) {
            int v      = edge.to;
            int newDist = dist[u] + edge.weight;
            if (newDist < dist[v]) {
                dist[v] = newDist;
                pq.push({newDist, v});
            }
        }
    }

    return dist;
}
