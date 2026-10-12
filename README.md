# Waste Classification

A computer vision application that classifies an uploaded image into one of ten waste categories using ResNet18, PyTorch, and FastAPI. A static browser interface provides the upload flow.

## Implementation and engineering decisions

The training notebook starts with ImageNet-pretrained ResNet18, replaces the classification head, trains the head, and fine-tunes the last residual block. Serving creates the same architecture with `weights=None`, loads the bundled state dictionary with `weights_only=True`, selects CUDA when available (CPU otherwise), and uses evaluation mode with gradients disabled. It requires no pretrained-weight download at inference time.

Images are converted to RGB, resized to 256 pixels, center-cropped to 224 × 224, converted to tensors, and normalized with ImageNet mean/std. The reported confidence is the maximum softmax percentage; it is not a calibrated measure of reliability.

Categories come from `models/class_to_idx.json`: battery, biological, cardboard, clothes, glass, metal, paper, plastic, shoes, trash.

## Architecture and structure

Browser multipart upload → `api/main.py` → temporary file → `src/inference.py` → ResNet18 → label and confidence. Temporary uploads are deleted on success and failure. Invalid image bytes receive HTTP 400; unexpected errors return a generic response.

| Path | Purpose |
| --- | --- |
| `api/main.py` | `/health`, `/predict`, static frontend, CORS |
| `src/inference.py` | Model loading, transforms, prediction |
| `models/` | State dictionary and class mapping |
| `frontend/` | Browser interface |
| `notebooks/01_data_audit.ipynb` | Data audit, splits, training, saved evaluation |
| `data/` | Placeholder; original image dataset is not bundled |
| `tests/test_api.py` | Upload validation, cleanup, model contract, real CPU inference |

## Run locally

Use Python 3.12 for the tested dependency set. The model file is included in the repository; allow space for its weights and the PyTorch installation.

```bash
git clone https://github.com/Fady-Fawzy/Waste-Classification-System-ComputerVision.git
cd Waste-Classification-System-ComputerVision
python -m venv .venv
# Linux/macOS: source .venv/bin/activate
# Windows PowerShell: .venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
python -m uvicorn api.main:app --reload
```

For CPU-only Linux environments, including CI, install the matching Torch packages from the official CPU index using `requirements-cpu.txt` before installing the remaining requirements. No API keys or environment variables are needed.

Open http://127.0.0.1:8000/ or http://127.0.0.1:8000/docs.

```bash
curl http://127.0.0.1:8000/health
curl -F "file=@example.jpg" http://127.0.0.1:8000/predict
```

`POST /predict` returns `prediction` (class name) and `confidence` (percentage, rounded to two decimals). It requires an image MIME type and readable image bytes.

## Evaluation provenance

The notebook uses stratified 70/15/15 splits with `random_state=42`. Its saved outputs report **90.97% test accuracy on 1,839 images**, macro F1 **0.9021**, and weighted F1 **0.9092**. These are existing notebook results; this review did not reproduce training or independently verify the original dataset. The final export cell is commented out, so the exact linkage between the notebook run and the committed weights cannot be established from the notebook alone.

Reproducing training requires supplying the original dataset at `data/original`, installing the notebook's analysis dependencies (Pandas, NumPy, Matplotlib, scikit-learn), and running the notebook from `notebooks/`. A dataset source/license and immutable split manifest should be documented before claiming full training reproducibility.

## Verification

```bash
python -m pip install -r requirements-dev.txt
python -m ruff check api src tests
python -m ruff format --check api src tests
python -m pytest
```

Tests include real inference on a generated RGB image to verify the weights, transforms, label mapping, and response shape. That smoke test is not a model-accuracy benchmark.

## Limitations and future work

- Single-label classification cannot locate or separate multiple objects.
- No authentication, rate limiting, or upload size cap; image decoding and inference run in the request path.
- Permissive CORS is a local-demo default.
- Health confirms API startup, not predictive accuracy.
- Add dataset provenance, split manifests, per-class error analysis, calibrated confidence, and deployment-specific resource limits.
