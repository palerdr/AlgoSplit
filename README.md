# Split.AI - Workout Split Analysis & Optimization

An intelligent workout analysis tool that evaluates training splits using research-backed muscle stimulus and fatigue models (Schoenfeld & Pelland curves).

## Features

- **Exercise Pattern Recognition**: Automatically classifies exercises into movement patterns
- **Muscle Stimulus Calculation**: Computes weekly stimulus for 16 muscle groups
- **Atrophy Modeling**: Accounts for recovery windows and training frequency
- **Optimization Suggestions**: Provides actionable recommendations for improving your split
- **REST API**: FastAPI backend for easy integration

## Project Structure

```
split-ai/
├── backend/
│   ├── api/              # FastAPI routes
│   ├── core/             # Core analysis engine
│   ├── schemas/          # Pydantic models
│   └── main.py           # FastAPI application
├── legacy/               # Old prototype code
├── requirements.txt      # Python dependencies
└── README.md
```

## Setup

### Prerequisites
- Python 3.12+
- [uv](https://docs.astral.sh/uv/) (recommended) — `curl -LsSf https://astral.sh/uv/install.sh | sh`

### Installation (uv, recommended)

```bash
git clone <repo-url> && cd AlgoSplit

# Resolves + installs runtime + dev deps into backend/.venv from uv.lock.
uv sync --project backend
```

The Python interpreter is pinned to 3.12 via `backend/pyproject.toml`. uv will
auto-install it if missing.

### Installation (pip fallback)

`backend/requirements.txt` and the root `requirements.txt` are auto-generated
from `backend/uv.lock` (see header in each file). They stay in the tree so
deployment targets without uv (Render, etc.) can still install with pip:

```bash
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r backend/requirements.txt
```

### Regenerating the lockfile

After editing `backend/pyproject.toml`:

```bash
cd backend && uv lock
# Sync both requirements.txt files from the lock:
uv export --no-dev --no-hashes --no-emit-project --format requirements-txt -o requirements.txt
cd .. && uv export --project backend --no-dev --no-hashes --no-emit-project --format requirements-txt -o requirements.txt
```

### Running the API

Start the development server:
```bash
uv run --project backend uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

Or with the pip-installed venv activated:
```bash
cd backend && uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

The API will be available at:
- **API**: http://localhost:8000
- **Interactive Docs**: http://localhost:8000/docs
- **ReDoc**: http://localhost:8000/redoc

## API Endpoints

### 1. Analyze Split
`POST /api/analyze-split`

Analyzes a complete training split and returns muscle stimulus breakdown with optimization suggestions.

**Request:**
```json
{
  "name": "PPL Split",
  "sessions": [
    {
      "name": "Push",
      "day": 1,
      "exercises": [
        {"name": "Bench Press", "sets": 4},
        {"name": "Overhead Press", "sets": 3}
      ]
    }
  ],
  "stimulus_duration": 48,
  "maintenance_volume": 4,
  "dataset": "average"
}
```

**Response:**
```json
{
  "split_name": "PPL Split",
  "muscles": [
    {
      "name": "pecs",
      "stimulus": 5.23,
      "atrophy": 1.12,
      "net_stimulus": 4.11,
      "primary_sets": 6,
      "frequency": 2
    }
  ],
  "suggestions": [
    {
      "priority": "HIGH",
      "muscle": "biceps",
      "issue": "Under-stimulated",
      "suggestion": "Net stimulus is only 0.82. Consider adding 2-4 more sets."
    }
  ],
  "summary": {
    "total_sets": 42,
    "muscles_trained": 12,
    "avg_net_stimulus": 3.45
  }
}
```

### 2. Parse Exercise
`POST /api/parse-exercise`

Validates and classifies a single exercise.

**Request:**
```json
{
  "text": "Bench Press"
}
```

**Response:**
```json
{
  "original_text": "Bench Press",
  "recognized": true,
  "pattern": "horizontal press",
  "targets": {
    "pecs": 0.80,
    "front_delt": 0.10,
    "triceps": 0.10
  },
  "unilateral": false,
  "confidence": "high"
}
```

### 3. Get Movement Patterns
`GET /api/movement-patterns`

Returns all available movement patterns and their muscle targets.

**Response:**
```json
{
  "patterns": [
    {
      "name": "horizontal press",
      "display_name": "Horizontal Press",
      "targets": {
        "pecs": 0.80,
        "front_delt": 0.10,
        "triceps": 0.10
      }
    }
  ],
  "total_count": 32
}
```

## Scientific Model

Split.AI uses peer-reviewed research on muscle stimulus and fatigue:

### Stimulus Calculation
- **Diminishing Returns**: Uses Schoenfeld & Pelland curves for set-by-set stimulus
- **CNS Fatigue**: Global fatigue accumulates across the workout
- **Recovery Penalty**: Insufficient recovery reduces stimulus effectiveness
- **Unilateral Bonus**: Single-arm/leg movements get 5% MUR boost

### Atrophy Model
- **Stimulus Window**: Default 48 hours for muscle protein synthesis
- **Decay Rate**: Linear atrophy after stimulus window closes
- **Frequency Optimization**: Automatic detection of suboptimal training frequency

## Example Use Cases

### 1. Validate a Training Split
```bash
curl -X POST http://localhost:8000/api/analyze-split \
  -H "Content-Type: application/json" \
  -d @example_split.json
```

### 2. Check Exercise Recognition
```bash
curl -X POST http://localhost:8000/api/parse-exercise \
  -H "Content-Type: application/json" \
  -d '{"text": "Bulgarian Split Squat"}'
```

## Development

### Running Tests
```bash
pytest
```

### Code Structure
- **MainClasses.py**: Core `Split`, `Session`, and `Muscle` classes
- **movementMatching.py**: Regex-based exercise classifier
- **movement_patterns.py**: Database of 60+ movement patterns
- **schemas/models.py**: Pydantic validation models
- **api/routes.py**: FastAPI route handlers

## Deployment

### Railway (Backend)
1. Create Railway account
2. Connect GitHub repository
3. Deploy from `backend/` directory
4. Set `START_COMMAND`: `uvicorn main:app --host 0.0.0.0 --port $PORT`

### Vercel (Frontend - Coming Soon)
Frontend will be built with Next.js and deployed separately.

## Roadmap

- [x] Core analysis engine
- [x] REST API
- [ ] Next.js frontend
- [ ] User authentication
- [ ] Database integration (PostgreSQL)
- [ ] Workout history tracking
- [ ] Progress visualization
- [ ] Mobile app (React Native)

## Contributing

This is a personal project, but suggestions and feedback are welcome!

## License

MIT License - See LICENSE file for details

## Acknowledgments

Built on exercise science research by Brad Schoenfeld, Chris Beardsley, and others in the hypertrophy research community.
