// Sokoban solver for make.fun sokoban-solver-01: push-optimal search, room by room.
//
// Method (written for this entry):
// - Parse the XSB level, pad the outer frame as walls.
// - Dead squares: reverse-pull from every goal over open floor; a box on a square that cannot
//   reach any goal can never be solved, so pushes onto dead squares are pruned.
// - Room decomposition: the hallway is the player's row; its dead squares are cut, and each
//   remaining floor component that holds boxes is a room. A box can never leave its room
//   (a push through the door lands on a dead hallway square), so rooms are independent and
//   the level's push optimum is the sum of the rooms' optima.
// - Each room is solved with breadth-first search over pushes (uniform cost, so the first
//   solution found is push-optimal). A state is the sorted box squares plus the canonical
//   (lowest) square of the player's reachable region. Pruning: dead squares and frozen
//   2x2 blocks of walls/boxes with a box off goal. If BFS exceeds its state budget, an A*
//   over pushes with an admissible matching heuristic takes over (still push-optimal when
//   it finishes within its own budget).
// - Deterministic: expansion order is fixed (boxes sorted, directions u,d,l,r), budgets are
//   counted in states, never in time, and nothing reads the clock or the environment beyond
//   the input/output directory variables the harness itself sets.
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const I = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const O = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// Fixed direction order: up, down, left, right.
const DX = [0, 0, -1, 1];
const DY = [-1, 1, 0, 0];
const WALK = ['u', 'd', 'l', 'r'];
const PUSH = ['U', 'D', 'L', 'R'];

const BFS_STATE_BUDGET = 900000; // per room, counted in states
const ASTAR_STATE_BUDGET = 1500000; // per room fallback

function parseLevel(text) {
  const rows = text.split('\n').filter((r) => r.length > 0);
  const h = rows.length;
  const w = Math.max(...rows.map((r) => r.length));
  const wall = new Uint8Array(w * h).fill(1);
  const goals = [];
  const boxes = [];
  let player = -1;
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const ch = row[x];
      const i = y * w + x;
      if (ch === '#') continue;
      wall[i] = 0;
      if (ch === '.' || ch === '*' || ch === '+') goals.push(i);
      if (ch === '$' || ch === '*') boxes.push(i);
      if (ch === '@' || ch === '+') player = i;
    }
  });
  for (let x = 0; x < w; x++) { wall[x] = 1; wall[(h - 1) * w + x] = 1; }
  for (let y = 0; y < h; y++) { wall[y * w] = 1; wall[y * w + w - 1] = 1; }
  boxes.sort((a, b) => a - b);
  goals.sort((a, b) => a - b);
  return { w, h, wall, goals, boxes, player };
}

// Squares from which one box alone can be pushed onto some goal (reverse pulls from goals).
function liveSquares(w, wall, goals) {
  const live = new Uint8Array(wall.length);
  const queue = [];
  for (const g of goals) { live[g] = 1; queue.push(g); }
  for (let qi = 0; qi < queue.length; qi++) {
    const x = queue[qi];
    for (let k = 0; k < 4; k++) {
      const d = DY[k] * w + DX[k];
      const y = x - d; // box came from y, player stood at y - d
      if (!wall[y] && !wall[y - d] && !live[y]) { live[y] = 1; queue.push(y); }
    }
  }
  return live;
}

// Flood fill of the player's reachable region; returns its lowest square. Marks `seen` with `stamp`.
function reachLowest(w, wall, occupied, from, seen, stamp, stack) {
  let low = from;
  let n = 0;
  stack[n++] = from;
  seen[from] = stamp;
  while (n > 0) {
    const p = stack[--n];
    if (p < low) low = p;
    const q0 = p - w, q1 = p + w, q2 = p - 1, q3 = p + 1;
    if (!wall[q0] && !occupied[q0] && seen[q0] !== stamp) { seen[q0] = stamp; stack[n++] = q0; }
    if (!wall[q1] && !occupied[q1] && seen[q1] !== stamp) { seen[q1] = stamp; stack[n++] = q1; }
    if (!wall[q2] && !occupied[q2] && seen[q2] !== stamp) { seen[q2] = stamp; stack[n++] = q2; }
    if (!wall[q3] && !occupied[q3] && seen[q3] !== stamp) { seen[q3] = stamp; stack[n++] = q3; }
  }
  return low;
}

// Is the box just pushed to t part of a frozen 2x2 block (walls/boxes) with a box off its goal?
function frozenBlock(w, wall, occupied, goal, t) {
  for (const a of [t, t - 1, t - w, t - w - 1]) {
    const b = a + 1, c = a + w, d = c + 1;
    if (!(wall[a] || occupied[a]) || !(wall[b] || occupied[b]) || !(wall[c] || occupied[c]) || !(wall[d] || occupied[d])) continue;
    if ((occupied[a] && !goal[a]) || (occupied[b] && !goal[b]) || (occupied[c] && !goal[c]) || (occupied[d] && !goal[d])) return true;
  }
  return false;
}

// Shortest walk (lowercase LURD) from `from` to `to` avoiding walls and boxes; '' if already there.
function walkPath(w, wall, occupied, from, to) {
  if (from === to) return '';
  const prev = new Int32Array(wall.length).fill(-1);
  const how = new Int8Array(wall.length).fill(-1);
  const queue = [from];
  prev[from] = from;
  for (let qi = 0; qi < queue.length; qi++) {
    const p = queue[qi];
    if (p === to) break;
    for (let k = 0; k < 4; k++) {
      const q = p + DY[k] * w + DX[k];
      if (wall[q] || occupied[q] || prev[q] !== -1) continue;
      prev[q] = p; how[q] = k; queue.push(q);
    }
  }
  if (!(prev[to] >= 0)) return null;
  let s = '';
  for (let p = to; p !== from; p = prev[p]) {
    if (!(p >= 0) || how[p] < 0) return null;
    s = WALK[how[p]] + s;
  }
  return s;
}

function endPosition(w, from, moves) {
  let p = from;
  for (const ch of moves.toLowerCase()) p += ch === 'u' ? -w : ch === 'd' ? w : ch === 'l' ? -1 : 1;
  return p;
}

// Minimum-push distance from every square to each goal, one box alone (reverse BFS in push space).
function pushDistances(w, wall, goals) {
  const size = wall.length;
  const per = [];
  for (const g of goals) {
    const dist = new Int32Array(size).fill(-1);
    dist[g] = 0;
    const queue = [g];
    for (let qi = 0; qi < queue.length; qi++) {
      const x = queue[qi];
      for (let k = 0; k < 4; k++) {
        const d = DY[k] * w + DX[k];
        const y = x - d;
        if (!wall[y] && !wall[y - d] && dist[y] === -1) { dist[y] = dist[x] + 1; queue.push(y); }
      }
    }
    per.push(dist);
  }
  return per;
}

// Admissible heuristic: minimum-cost matching of boxes to goals over push distances (Hungarian
// on the small box x goal matrix; boxes <= 6 here in the fallback path, brute-force permutations
// are cheaper and exact for <= 8).
function matchingLB(boxes, perGoal) {
  const n = boxes.length;
  if (n === 0) return 0;
  const cost = boxes.map((b) => perGoal.map((dist) => dist[b]));
  if (cost.some((row) => row.some((v) => v < 0))) return Infinity;
  let best = Infinity;
  const used = new Array(n).fill(false);
  const dfs = (i, acc) => {
    if (acc >= best) return;
    if (i === n) { best = acc; return; }
    for (let j = 0; j < n; j++) {
      if (used[j]) continue;
      used[j] = true;
      dfs(i + 1, acc + cost[i][j]);
      used[j] = false;
    }
  };
  dfs(0, 0);
  return best;
}

// Push-optimal solver for one (sub)level: { w, wall, goals, boxes, player }.
// Returns { pushes, moves } or null. BFS first (optimal, usually small in a room);
// A* fallback with the matching lower bound if BFS would exceed its budget.
function solveOptimal(sub, bfsBudget, astarBudget) {
  const { w, wall, goals, boxes: startBoxes, player: startPlayer } = sub;
  const size = wall.length;
  const goal = new Uint8Array(size);
  for (const g of goals) goal[g] = 1;
  const live = liveSquares(w, wall, goals);
  if (startBoxes.some((b) => !live[b])) return null;
  const solved = (bs) => bs.every((b) => goal[b]);
  if (solved(startBoxes)) return { pushes: 0, moves: '' };

  const occupied = new Uint8Array(size);
  const seen = new Int32Array(size);
  const mark = new Int32Array(size);
  const stack = new Int32Array(size);
  let stamp = 0;
  const nb = startBoxes.length;
  // Numeric state key while the board is small enough for exact base-size encoding.
  const useNumKey = Math.pow(size, nb + 1) < 9007199254740992;
  const keyOf = (boxes, low) => {
    if (useNumKey) { let k = low; for (const b of boxes) k = k * size + b; return k; }
    return low + '|' + boxes.join(',');
  };

  function expand(stateBoxes, statePlayer, seenStampHolder, visit) {
    // Generates each legal push once. visit(nextBoxes, playerAfter) returns true to stop.
    for (const b of stateBoxes) occupied[b] = 1;
    reachLowest(w, wall, occupied, statePlayer, seen, ++stamp, stack);
    const here = stamp;
    let stop = false;
    for (let bi = 0; bi < stateBoxes.length && !stop; bi++) {
      const b = stateBoxes[bi];
      for (let k = 0; k < 4; k++) {
        const d = DY[k] * w + DX[k];
        const t = b + d;
        if (seen[b - d] !== here || wall[t] || occupied[t] || !live[t]) continue;
        occupied[b] = 0; occupied[t] = 1;
        const frozen = frozenBlock(w, wall, occupied, goal, t);
        occupied[t] = 0; occupied[b] = 1;
        if (frozen) continue;
        const next = stateBoxes.slice();
        next[bi] = t;
        next.sort((a, b2) => a - b2);
        if (visit(next, b)) { stop = true; break; }
      }
    }
    for (const b of stateBoxes) occupied[b] = 0;
    return stop;
  }

  // regionLow uses its own occupancy scratch: it is called from inside expand's push
  // generation, where `occupied` already holds the current state's boxes and must not
  // be disturbed.
  const occR = new Uint8Array(size);
  function regionLow(boxes, player) {
    for (const b of boxes) occR[b] = 1;
    const low = reachLowest(w, wall, occR, player, mark, ++stamp, stack);
    for (const b of boxes) occR[b] = 0;
    return low;
  }

  function reconstruct(statesBoxes, statesPlayer, parent, found) {
    const path = [];
    for (let s = found; s > 0; s = parent[s]) path.push(s);
    path.reverse();
    let moves = '';
    let player = startPlayer;
    let boxes = startBoxes;
    for (const s of path) {
      const nextBoxes = statesBoxes[s];
      let from = -1, to = -1;
      for (const b of boxes) if (!nextBoxes.includes(b)) from = b;
      for (const b of nextBoxes) if (!boxes.includes(b)) to = b;
      const d = to - from;
      const k = d === -w ? 0 : d === w ? 1 : d === -1 ? 2 : 3;
      for (const b of boxes) occupied[b] = 1;
      const walk = walkPath(w, wall, occupied, player, from - d);
      for (const b of boxes) occupied[b] = 0;
      if (walk === null) return null;
      moves += walk + PUSH[k];
      player = from;
      boxes = nextBoxes;
    }
    return { pushes: path.length, moves };
  }

  // --- BFS over pushes ---
  {
    const statesBoxes = [startBoxes];
    const statesPlayer = [startPlayer];
    const parent = [-1];
    const index = new Map();
    index.set(keyOf(startBoxes, regionLow(startBoxes, startPlayer)), 0);
    let found = -1;
    let head = 0;
    while (head < statesBoxes.length && found < 0) {
      const s = head++;
      expand(statesBoxes[s], statesPlayer[s], null, (next, playerAfter) => {
        const key = keyOf(next, regionLow(next, playerAfter));
        if (index.has(key)) return false;
        if (statesBoxes.length >= bfsBudget) return true; // signal stop: budget out
        index.set(key, statesBoxes.length);
        statesBoxes.push(next);
        statesPlayer.push(playerAfter);
        parent.push(s);
        if (solved(next)) found = statesBoxes.length - 1;
        return found >= 0;
      });
      if (found < 0 && statesBoxes.length >= bfsBudget && head >= statesBoxes.length) break;
      if (found < 0 && statesBoxes.length >= bfsBudget) {
        // BFS hit its budget with a frontier left: fall through to A*.
        head = statesBoxes.length; // exit loop
        found = -2;
      }
    }
    if (found >= 0) return reconstruct(statesBoxes, statesPlayer, parent, found);
    if (found === -1) return null; // frontier exhausted: unsolvable within this sublevel
  }

  // --- A* over pushes with matching lower bound (still optimal on completion) ---
  const perGoal = pushDistances(w, wall, goals);
  const h0 = matchingLB(startBoxes, perGoal);
  if (!Number.isFinite(h0)) return null;
  const statesBoxes = [startBoxes];
  const statesPlayer = [startPlayer];
  const parent = [-1];
  const gScore = [0];
  const best = new Map();
  best.set(keyOf(startBoxes, regionLow(startBoxes, startPlayer)), 0);
  // Binary heap on f = g + h, ties to larger g.
  const heap = [[h0, 0, 0]];
  const less = (a, b) => a[0] < b[0] || (a[0] === b[0] && a[1] > b[1]);
  const hpush = (e) => {
    let i = heap.length; heap.push(e);
    while (i > 0) { const p = (i - 1) >> 1; if (!less(heap[i], heap[p])) break; [heap[i], heap[p]] = [heap[p], heap[i]]; i = p; }
  };
  const hpop = () => {
    const top = heap[0]; const last = heap.pop();
    if (heap.length > 0) {
      heap[0] = last;
      for (let i = 0; ;) {
        let c = 2 * i + 1;
        if (c >= heap.length) break;
        if (c + 1 < heap.length && less(heap[c + 1], heap[c])) c++;
        if (!less(heap[c], heap[i])) break;
        [heap[i], heap[c]] = [heap[c], heap[i]]; i = c;
      }
    }
    return top;
  };
  let expanded = 0;
  while (heap.length > 0 && expanded < astarBudget) {
    const [, g, s] = hpop();
    if (g !== gScore[s]) continue;
    const bs = statesBoxes[s];
    if (solved(bs)) return reconstruct(statesBoxes, statesPlayer, parent, s);
    expanded++;
    let aborted = false;
    expand(bs, statesPlayer[s], null, (next, playerAfter) => {
      const ng = g + 1;
      const key = keyOf(next, regionLow(next, playerAfter));
      const seenG = best.get(key);
      if (seenG !== undefined && seenG <= ng) return false;
      const h = matchingLB(next, perGoal);
      if (!Number.isFinite(h)) return false;
      best.set(key, ng);
      const t = statesBoxes.length;
      statesBoxes.push(next); statesPlayer.push(playerAfter); parent.push(s); gScore.push(ng);
      hpush([ng + h, ng, t]);
      return false;
    });
    if (aborted) break;
  }
  return null;
}

// Split the level into rooms by cutting the dead squares of the player's row (the hallway).
// Returns an array of { squares, boxes, goals } or null when the level is not room-shaped.
function roomsOf(level) {
  const { w, wall, goals, boxes, player } = level;
  const live = liveSquares(w, wall, goals);
  const row = Math.floor(player / w);
  const cut = new Uint8Array(wall.length);
  for (let i = row * w; i < (row + 1) * w; i++) if (!wall[i] && !live[i]) cut[i] = 1;
  if (boxes.some((b) => cut[b])) return null;
  const part = new Int32Array(wall.length).fill(-1);
  const rooms = [];
  for (let s = 0; s < wall.length; s++) {
    if (wall[s] || cut[s] || part[s] >= 0) continue;
    const squares = [s];
    part[s] = rooms.length;
    for (let i = 0; i < squares.length; i++) {
      for (let k = 0; k < 4; k++) {
        const q = squares[i] + DY[k] * w + DX[k];
        if (!wall[q] && !cut[q] && part[q] < 0) { part[q] = rooms.length; squares.push(q); }
      }
    }
    rooms.push({ squares, boxes: [], goals: [] });
  }
  for (const b of boxes) rooms[part[b]].boxes.push(b);
  for (const g of goals) if (part[g] >= 0) rooms[part[g]].goals.push(g);
  if (goals.some((g) => part[g] < 0) || rooms.some((r) => r.boxes.length !== r.goals.length)) return null;
  return rooms.filter((r) => r.boxes.length > 0);
}

function solveLevel(text) {
  const level = parseLevel(text);
  if (level.boxes.length === 0) return '';
  const rooms = roomsOf(level);
  if (rooms === null) {
    const r = solveOptimal(level, BFS_STATE_BUDGET, ASTAR_STATE_BUDGET);
    return r ? r.moves : '';
  }
  let player = level.player;
  let moves = '';
  for (const room of rooms) {
    const wall = level.wall.slice();
    for (const other of rooms) {
      if (other === room) continue;
      for (const b of other.done ? other.goals : other.boxes) wall[b] = 1;
    }
    const sub = {
      w: level.w, h: level.h, wall,
      goals: room.goals.slice().sort((a, b) => a - b),
      boxes: room.boxes.slice().sort((a, b) => a - b),
      player,
    };
    const r = solveOptimal(sub, BFS_STATE_BUDGET, ASTAR_STATE_BUDGET);
    if (r === null) return '';
    moves += r.moves;
    player = endPosition(level.w, player, r.moves);
    room.done = true;
  }
  return moves;
}

for (const id of readdirSync(I).sort()) {
  const moves = solveLevel(readFileSync(join(I, id, 'level.txt'), 'utf8'));
  mkdirSync(join(O, id), { recursive: true });
  writeFileSync(join(O, id, 'solution.txt'), `${moves}\n`);
}
