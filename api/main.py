from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from pathlib import Path
import tempfile
import os

from src.inference import predict_image


# =========================
# App
# =========================

app = FastAPI(
    title="Waste Classification API",
    version="1.0.0"
)


# =========================
# CORS
# =========================

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


# =========================
# Health Check
# =========================

@app.get("/health")
def health():
    return {
        "message": "Waste Classification API is running"
    }


# =========================
# Prediction Endpoint
# =========================

@app.post("/predict")
async def predict(file: UploadFile = File(...)):

    # Make sure uploaded file is an image
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(
            status_code=400,
            detail="Uploaded file must be an image."
        )

    suffix = Path(file.filename).suffix

    temp_path = None

    try:

        # Read uploaded image
        contents = await file.read()

        # Save temporarily
        with tempfile.NamedTemporaryFile(
            delete=False,
            suffix=suffix
        ) as temp_file:

            temp_file.write(contents)

            temp_path = temp_file.name


        # Run model
        predicted_class, confidence = predict_image(
            temp_path
        )


        return {
            "prediction": predicted_class,
            "confidence": round(confidence, 2)
        }


    except Exception as e:

        raise HTTPException(
            status_code=500,
            detail=str(e)
        )


    finally:

        # Delete temporary image
        if temp_path and os.path.exists(temp_path):
            os.remove(temp_path)


FRONTEND_DIR = Path(__file__).resolve().parent.parent / "frontend"

app.mount(
    "/",
    StaticFiles(directory=FRONTEND_DIR, html=True),
    name="frontend"
)
