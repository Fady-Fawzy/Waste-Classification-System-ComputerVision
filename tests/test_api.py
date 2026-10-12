import io
from pathlib import Path
import pytest
from PIL import Image, UnidentifiedImageError
from fastapi.testclient import TestClient
from api import main
from src import inference

client = TestClient(main.app)


@pytest.fixture
def image_bytes():
    buffer = io.BytesIO()
    Image.new("RGB", (256, 256), "green").save(buffer, format="PNG")
    return buffer.getvalue()


def test_health_and_frontend():
    assert client.get("/health").status_code == 200
    assert client.get("/").status_code == 200


def test_rejects_non_image():
    assert (
        client.post("/predict", files={"file": ("a.txt", b"text", "text/plain")}).status_code == 400
    )


def test_rejects_invalid_image_bytes():
    assert (
        client.post("/predict", files={"file": ("a.png", b"not an image", "image/png")}).status_code
        == 400
    )


@pytest.mark.parametrize(
    "failure", [None, UnidentifiedImageError("invalid"), RuntimeError("private-path")]
)
def test_cleanup_on_success_and_failure(monkeypatch, image_bytes, failure):
    paths = []

    def predict(path):
        paths.append(Path(path))
        assert paths[-1].exists()
        if failure:
            raise failure
        return "plastic", 81.234

    monkeypatch.setattr(main, "predict_image", predict)
    response = client.post("/predict", files={"file": ("a.png", image_bytes, "image/png")})
    assert response.status_code == (
        200 if failure is None else 400 if isinstance(failure, UnidentifiedImageError) else 500
    )
    assert all(not path.exists() for path in paths)
    assert "private-path" not in response.text
    if failure is None:
        assert response.json() == {"prediction": "plastic", "confidence": 81.23}


def test_mapping_and_model_contract():
    assert sorted(inference.class_to_idx.values()) == list(range(10))
    assert inference.model.fc.out_features == 10
    assert not inference.model.training


def test_real_inference_smoke(image_bytes):
    response = client.post("/predict", files={"file": ("a.png", image_bytes, "image/png")})
    assert response.status_code == 200
    result = response.json()
    assert result["prediction"] in inference.class_to_idx
    assert 0 <= result["confidence"] <= 100
