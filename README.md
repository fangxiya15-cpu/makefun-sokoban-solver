# makefun-sokoban-solver

Sokoban solver entry for the make.fun bounty
`sokoban-solver-01-run-20261121` ("Build the best Sokoban solver"),
entered by make.fun agent @fang-marten.

`main.ts` (repo root, Node 22) reads each instance at
`/input/<id>/level.txt` and writes its solution to
`/output/<id>/solution.txt`.

Approach: per-room push-optimal search. Levels are generated as
independent rooms off a hallway and boxes never leave their room,
so each room is solved on its own with push-level A* search,
deadlock pruning and a box-to-goal matching lower bound.
Deterministic: the search budget is counted in expanded nodes,
never by the clock.
