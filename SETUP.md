# AGATE — Local Setup (this machine)

Verified setup for `C:\Users\Krushna Rangankar\agate` on Windows 11, PowerShell 5.1.
Generated 2026-09-29.

> **Read §4 before running anything.** The repo's own `CONTRIBUTING.md` contradicts
> `AGATE_HANDOFF.md` on two points (pgvector, database port). The handoff doc is correct;
> this file follows it.

---

## 1. Toolchain on this machine

| Tool | Version | Note |
|---|---|---|
| Python | 3.14.7 | `requirements.txt` pins `numpy==2.5.2`, which needs ≥3.12 |
| Node.js | 24.21.0 | Repo requires ≥18 |
| Git | 2.55.0 | **Was not installed.** Installed during this setup — see §2 |
| Docker | 29.8.0 | CLI was present; daemon started via Docker Desktop |

---

## 2. Clone

Git was not on this machine, so it was installed first:

```powershell
winget install --id Git.Git -e --source winget --accept-package-agreements --accept-source-agreements
```

The current shell will not see the new `PATH` until it is refreshed. Either open a new
terminal, or run this in the existing one:

```powershell
$env:PATH = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + `
            [System.Environment]::GetEnvironmentVariable("Path","User")
```

Then:

```powershell
git clone https://github.com/AnshulJangley/agate.git
cd agate
```

---

## 3. PostgreSQL + PostGIS container

Docker Desktop must be running first (`docker ps` should not error).

```powershell
docker run -d --name agate-postgres `
  -e POSTGRES_PASSWORD=postgres `
  -e POSTGRES_DB=agate_nwis `
  -p 5432:5432 `
  -v agate_pgdata:/var/lib/postgresql/data `
  postgis/postgis:16-3.4
```

Verify:

```powershell
docker ps --filter "name=agate-postgres"
docker exec agate-postgres psql -U postgres -d agate_nwis `
  -c "SELECT extname, extversion FROM pg_extension WHERE extname LIKE 'postgis%';"
```

Expected: container `Up`, and `postgis 3.4.3` / `postgis_topology 3.4.3`.

**Do not touch the unrelated `agentic-rag-postgres` and `agentic-rag-neo4j` containers.**
They belong to a different project. `agentic-rag-postgres` also uses port 5432, so if it is
ever started it will conflict with `agate-postgres` — the handoff doc used 5433 for exactly
this reason. If you hit a bind error, change `-p 5433:5432` here **and** the port in
`DATABASE_URL` in `.env`.

---

## 4. Python environment

```powershell
python -m venv venv
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

Deactivate with `deactivate`; re-activate with `.\venv\Scripts\Activate.ps1`.

> `easyocr` pulls **torch**, which is the bulk of the download (~2–3 GB). This step is slow.
>
> All compiled dependencies in `requirements.txt` publish `cp314` win_amd64 wheels, so
> Python 3.14 is fine here — verified against PyPI for torch, shap, scipy, pandas, pyarrow,
> scikit-learn, pymupdf and psycopg2-binary.

All commands below use `.\venv\Scripts\python.exe` directly, so activating is optional.

---

## 5. Environment file

`.env` is gitignored. It was created by copying `.env.example`:

```powershell
Copy-Item .env.example .env
```

### Database

```
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/agate_nwis
```

This must match the `docker run` port in §3.

### LLM — routing to DeepSeek

DeepSeek is reached through the **OpenAI-compatible provider path** in
`backend/nlp/llm_factory.py`. No code change is required: `get_llm()` passes
`base_url=cfg.get("base_url")` from the `OPENAI_BASE_URL` env var.

```
LLM_PROVIDER=openai
OPENAI_API_KEY=<your DeepSeek key>
OPENAI_BASE_URL=https://api.deepseek.com/v1
OPENAI_MODEL_NAME=deepseek-chat
```

`LLM_PROVIDER=openai` is set **explicitly** rather than left at `auto`. Auto-detect priority
is Gemini → Claude → OpenAI → Ollama, so adding a Gemini key later for embeddings would
silently move chat off DeepSeek.

Provider detection only checks whether a key variable is non-empty — a placeholder value
makes `/api/ai/status` report "connected" while every real call returns 401. Keep unused
keys commented out.

### Embeddings — currently inactive (measured)

```
EMBEDDING_MODEL=gemini-embedding-001
EMBEDDING_DIM=768
```

**DeepSeek has no embeddings endpoint**, so chat and embeddings need different providers.

Measured state on this machine: **all 22 events have `embedding IS NULL`**
(`SELECT count(embedding) FROM synthetic_event;` → `0`). Seeding does not embed anything —
`seed_database.py` loads the CSV as-is, and the shipped CSV has no vectors.

Consequence, confirmed against `/api/events/search`: the `vector` term in `score_breakdown`
returns a **constant `0.75` for every query and every event**, so `hybrid_score` tracks `bm25`
exactly. Only lexical matching is ranking results. Semantically-similar-but-differently-worded
queries will therefore miss.

To restore real semantic search:

1. Add a Gemini key (free at https://aistudio.google.com) as `GEMINI_API_KEY` in `.env`.
2. Rebuild the vectors:

```powershell
.\venv\Scripts\python.exe scripts\backfill_embeddings.py --force
```

**Do not run the backfill without a real embedding provider.** Without a key, `EmbeddingService`
substitutes a deterministic local surrogate. It warns loudly, is dimensionally correct (768),
and is text-dependent — but carries no semantic meaning, so it would replace a constant
uninformative score with a *varying* uninformative one. The codebase is deliberately "loud"
here because a silent version of this exact bug hid a zero-embedding problem for weeks
(see `AGATE_HANDOFF.md` §5.1).

If `EMBEDDING_MODEL` or `EMBEDDING_DIM` is ever changed, every stored vector is invalidated
and must be rebuilt with `--force`.

---

## 6. Seed the database

**Do NOT run `scripts/run_pipeline.py` on a fresh clone**, even though
`CONTRIBUTING.md` §2.1 step 4 says to. That pipeline reads its inputs from `data/raw/`,
which **is not in this repository** — only `data/processed/` ships, already built.

`scripts/config.py` creates an empty `data/raw/` on import, so the pipeline runs without
erroring and silently regenerates the processed CSVs from nothing:

| File | Ships as | After `run_pipeline.py` |
|---|---|---|
| `wells_master.csv` | 28 rows | **8** — `01_build_wells_master.py` falls back to hardcoded OIL defaults |
| `drilling_params.csv` | 40 rows | rebuilt from empty `raw/` |
| `well_logs.csv` | 1200 rows | rebuilt from empty `raw/` |
| `synthetic_events.csv` | 22 rows | regenerated against the downgraded 8-well master |

The shipped `data/processed/*.csv` **are** the pipeline output — run the pipeline only if
you have the original raw survey exports to put in `data/raw/`.

Seed straight from the shipped CSVs:

```powershell
.\venv\Scripts\python.exe scripts\seed_database.py
```

> ⚠️ **Run this exactly once.** `seed_database.py` uses `bulk_insert_mappings`, which
> **appends** — it is not idempotent. Re-running it inserts a second copy of every row
> instead of upserting. To reseed, drop and recreate the tables first, or use
> `scripts/reseed_events.py` (which is the idempotent replacement for the event table).

Then create the feature tables (knowledge graph, chat, documents) — these are separate,
idempotent DDL scripts and are **not** covered by the two commands above:

```powershell
.\venv\Scripts\python.exe scripts\create_graph_tables.py
.\venv\Scripts\python.exe scripts\create_chat_tables.py
.\venv\Scripts\python.exe scripts\create_document_tables.py
```

---

## 7. Frontend dependencies

```powershell
npm install                              # root — only installs `concurrently`
npm --prefix frontend install            # the React app
```

---

## 8. Running

Both services together, from the repo root:

```powershell
npm run dev
```

Or separately:

```powershell
.\venv\Scripts\python.exe -m uvicorn backend.main:app --host 127.0.0.1 --port 8000 --reload
npm --prefix frontend run dev
```

| Service | URL |
|---|---|
| Dashboard | http://localhost:5173 |
| API docs | http://localhost:8000/docs |

`start.bat` also launches both, but it assumes the venv is named `venv` — which it is here.

---

## 9. Verify

```powershell
# Backend identity
curl.exe http://localhost:8000/api/health

# Which provider is CONFIGURED (does not test the key — see warning below)
curl.exe http://localhost:8000/api/ai/status

# Database reached, not silently falling back to JSON
curl.exe "http://127.0.0.1:8000/api/graph/stats"
```

`/api/graph/stats` must report `"data_source": "postgres"`. This codebase answers database
failures with **silent JSON fallbacks**, so a misconfigured `DATABASE_URL` looks like
"working, but thin data" rather than an error — always check `data_source`.

> ⚠️ **`/api/ai/status` does not prove your key works.** It only reports whether each key
> variable is non-empty. A dead key still shows `"is_connected": true, "mode": "live_llm"`.

### Proving DeepSeek actually answers

Use `/api/chat`, whose `provider` field is set per *successful* call, and is therefore not
masked by the failover chain:

```powershell
$body = @{ message = "What mitigation worked for stuck pipe in the Barail formation?"; max_records = 5 } | ConvertTo-Json
Invoke-RestMethod "http://127.0.0.1:8000/api/chat" -Method Post -ContentType "application/json" -Body $body |
  Select-Object provider, model, mode, evidence_count, guardrail_verified
```

Expect `provider=openai`, `model=deepseek-chat`, `mode=live_llm`.

**Check `provider`, not just that a response came back.** `get_llm_candidates()` fails over
openai → claude, so if DeepSeek rejects the key, a healthy Claude key would answer instead
and the call would still look successful while reporting `provider: claude`.

### Observed state after this setup (2026-09-29)

| Check | Result |
|---|---|
| `/api/health` | `healthy` / `AGATE API` |
| `/api/ai/status` | `active_provider: openai`, `active_model: deepseek-chat`, `live_llm` |
| `/api/chat` ×4 | `provider=openai`, `model=deepseek-chat`, `live_llm` on all four |
| `/api/graph/rebuild` | 66 nodes / 135 edges written, 0 pruned |
| `/api/graph/stats` | `data_source: postgres` |
| `npm run build` | clean, 33.8s (chunk-size warning expected — Plotly + MapLibre) |
| `git status` | only `SETUP.md` untracked — `.env` correctly gitignored |

### Known behaviour: the guardrail can reject DeepSeek's answers

Of four test questions, three passed `guardrail_verified=true`. The gas-kick question was
**blocked**, because the model recommended *"Immediate space-out and BOP shut-in"* — which
`GuardrailsService` rejects as an autonomous-control instruction, per `CONTRIBUTING.md` §4.
The user-visible answer becomes `"Guardrail intervention: reverted to deterministic result
due to validation failure."` This is the guardrail working as designed, not a setup fault,
but it means DeepSeek follows the "no autonomous rig control" system prompt less reliably
than Gemini/Claude. Expect occasional guarded refusals.

### Tests

```powershell
.\venv\Scripts\python.exe -m pytest tests/
npm --prefix frontend run build
```

`pyproject.toml` pins `testpaths`, so run pytest from the repo root and let it collect
all 56 tests rather than naming a single directory.

---

## 10. Traps worth knowing

1. **No root `README.md`.** It does not exist in this repo, though `AGATE_HANDOFF.md` and
   `CONTRIBUTING.md` both reference it. Setup docs are those two files.
2. **`CONTRIBUTING.md` is wrong about pgvector.** It lists pgvector as a prerequisite.
   `backend/models.py:96` stores embeddings as a plain Postgres `ARRAY(Float)` and computes
   cosine in Python; the `pgvector` entry in `requirements.txt` is an unused Python client,
   and `postgis/postgis:16-3.4` does not ship the `vector` extension. PostGIS alone is correct.
3. **`CONTRIBUTING.md` claims a SQLite fallback.** There is none — `backend/database.py`
   hardcodes PostgreSQL URLs and has no SQLite path.
4. **`AGATE_HANDOFF.md` describes the original author's machine**, not this one. It refers to
   `C:\Users\Anshul Jangley\Desktop\PetrolQ`, a venv at `./venv`, and Postgres on port **5433**.
5. **Port 5433 appears nowhere else.** It is specific to the author's setup; this machine
   uses 5432 per §3.
6. **`frontend` reports 2 critical npm advisories.** Left unresolved deliberately —
   `npm audit fix` can break pinned builds.
