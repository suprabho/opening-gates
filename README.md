# STEP Viewer — Animated Gates

Interactive browser-based viewer for the gate assembly model, built from a `.STEP` file with no external viewer dependency.

---

## Files

| File | Size | Description |
|------|------|-------------|
| `step_viewer_demo.html` | ~408 KB | Generic STEP viewer — demo mechanical part |
| `gate_viewer.html` | ~7 MB | Gate-specific STEP viewer — interactive sliding gate |
| `build_step_viewer.py` | ~29 KB | Python CLI — converts any `.step` / `.stp` to a standalone HTML viewer |

---

## Part 1 — Generic STEP Viewer (`build_step_viewer.py` + `step_viewer_demo.html`)

### What was done

A Python CLI tool that converts any `.step` / `.stp` file into a self-contained HTML viewer with no server required.

### Pipeline

```
input.step
    │
    ▼
cadquery.importers.importStep()   ← OpenCASCADE (OCC) under the hood
    │
    ▼
Shell.tessellate(tolerance)       ← Triangulates NURBS/B-Rep surfaces
    │
    ▼  For each triangle:
       - Extract vertex positions (v0, v1, v2)
       - Compute flat face normal via cross product
       - Flatten to Float32 arrays
    │
    ▼
JSON { positions[], normals[], indices[] }
    │
    ▼
Embedded in self-contained HTML
    │
    ▼
Three.js BufferGeometry + MeshStandardMaterial
```

### Usage

```bash
pip install cadquery

python3 build_step_viewer.py input.step             # outputs input.html
python3 build_step_viewer.py input.step output.html # explicit output path
```

### Viewer features

- Shaded / Wireframe / X-Ray display modes
- Standard views: Isometric, Top, Front, Right
- Live appearance controls: model colour, background, roughness, metalness, opacity
- Lighting controls: key light colour, fill light colour, exposure
- Edge overlay and grid toggles
- Stats: solid count, triangle count, vertex count, bounding dimensions
- Drag to rotate, scroll to zoom, right-click to pan; touch supported

---

## Part 2 — Gate STEP Viewer (`gate_viewer.html`)

### Source file

`gate_stp_file.STEP` — ISO 10303 (STEP AP214) sliding gate assembly

| Property | Value |
|----------|-------|
| Format | STEP / ISO 10303-21 |
| Total width | 30.48 m |
| Total height | 3.96 m |
| Depth | 1.22 m |
| X range | −17,575 mm → +12,905 mm |
| Total shells | 114 |
| Gate travel | 12,190 mm |

### Shell decomposition

The file is a single compound solid with 114 shells. Each shell was profiled by bounding box centre to identify functional groups:

```
114 Shells
 ├── Shells 0–4      → Fixed Frame        (5 shells)   cx ≈ 6,000–11,000 mm
 ├── Shell  5        → Gate Leaf          (1 shell)    cx ≈ −2,335 mm (spans full width)
 ├── Shells 6–57     → Left Drive Unit    (52 shells)  cx ≈ 273–993 mm
 ├── Shell  111      → Left Motor Box     (1 shell)    cx ≈ 558 mm
 ├── Shells 58–110   → Right Drive Unit   (53 shells)  cx ≈ 3,900–4,700 mm
 ├── Shell  113      → Right Post Fix     (1 shell)    cx ≈ 12,048 mm
 └── Shell  112      → Gate Motor Box     (1 shell)    cx ≈ −3,100 mm  ← travels with gate
```

### Why the gate leaf spans the full width

Shell 5 extends from x = −17,575 mm to x = +12,905 mm (the full 30.48 m). In the model's stored position, the gate is partially open. The viewer treats the modelled position as "closed = 0%" and slides the gate group leftward along the −X axis by up to 12,190 mm to reach "open = 100%".

### Mobile vs fixed separation

| Group | Three.js Group | Moves with gate? |
|-------|---------------|-----------------|
| Fixed Frame | `frameGroup` | ✗ |
| Left Drive Unit | `mechGroup` | ✗ |
| Right Drive Unit | `mechGroup` | ✗ |
| Gate Leaf | `gateGroup` | **✓** |
| Gate Motor Box | `motorGroup` | **✓** |

Both `gateGroup` and `motorGroup` have their X position updated in lockstep on every frame, producing physically correct motion.

### Tessellation tolerances

Different tolerances were chosen per group to balance accuracy vs. file size:

| Group | Tolerance | Triangles |
|-------|-----------|-----------|
| Gate leaf | 20 mm | 72 |
| Fixed frame | 20 mm | 25,076 |
| Left drive unit | 500 mm | ~5,800 |
| Right drive unit | 500 mm | ~5,900 |
| Motor box | 20 mm | 84 |

The drive unit shells contain highly complex curved geometry (gearboxes, rollers) that produced 700,000+ triangles at fine tolerance. A 500 mm tolerance reduces this to ~6,000 triangles per unit while preserving the overall form.

### Viewer features

- **Gate slider** — drag to position gate anywhere between 0% (closed) and 100% (open)
- **Animate** button — loops open/close automatically with adjustable speed and mode (loop / open only / close only)
- **Layer toggles** — independently show/hide Gate, Frame, Drive Units, Motor
- **Display modes** — Shaded, Wireframe, X-Ray
- **Per-group colour pickers** — Gate, Frame, Mechanism
- **Live material controls** — metalness, roughness sliders applied globally
- **Camera controls** — drag rotate, scroll zoom, right-drag pan, touch support
- **Standard views** — Isometric, Top, Front
- **HUD** — live gate X position (metres) and open percentage

---

## Technical notes

### Coordinate system

The STEP file uses millimetres. The viewer normalises to Three.js units using:

```
1 Three.js unit = 100 mm
```

The model centre `(cx, cy, cz)` is subtracted from all group positions so the scene is centred on the world origin.

### Dependencies

| Tool | Purpose |
|------|---------|
| `cadquery` (+ `cadquery-ocp`) | STEP import, tessellation via OpenCASCADE |
| `three.js r128` | WebGL rendering (loaded from cdnjs CDN) |
| Python 3.12 | Tessellation script |

### Running the Python script

```bash
pip install cadquery

# Convert any STEP file
python3 build_step_viewer.py your_model.step

# Specify output path
python3 build_step_viewer.py your_model.step viewer.html
```

---

*Generated 23 Feb 2026 — TDP_GATE_260207 gate assembly viewer project*
