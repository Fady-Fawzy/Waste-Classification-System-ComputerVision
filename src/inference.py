from pathlib import Path
import json

import torch
import torch.nn as nn
from torchvision.models import resnet18
from torchvision import transforms
from PIL import Image


# ==========================================
# Paths
# ==========================================

PROJECT_ROOT = Path(__file__).resolve().parent.parent

MODEL_PATH = PROJECT_ROOT / "models" / "final_resnet18_waste_classifier.pth"
CLASSES_PATH = PROJECT_ROOT / "models" / "class_to_idx.json"


# ==========================================
# Device
# ==========================================

device = torch.device(
    "cuda" if torch.cuda.is_available() else "cpu"
)

print("Device:", device)


# ==========================================
# Load class mapping
# ==========================================

with open(CLASSES_PATH, "r") as f:
    class_to_idx = json.load(f)

idx_to_class = {
    idx: class_name
    for class_name, idx in class_to_idx.items()
}

num_classes = len(class_to_idx)


# ==========================================
# Load model
# ==========================================

model = resnet18(weights=None)

num_features = model.fc.in_features

model.fc = nn.Linear(
    num_features,
    num_classes
)

state_dict = torch.load(
    MODEL_PATH,
    map_location=device,
    weights_only=True
)

model.load_state_dict(state_dict)

model = model.to(device)

model.eval()


# ==========================================
# Image preprocessing
# ==========================================

transform = transforms.Compose([
    transforms.Resize(256),
    transforms.CenterCrop(224),

    transforms.ToTensor(),

    transforms.Normalize(
        mean=[0.485, 0.456, 0.406],
        std=[0.229, 0.224, 0.225]
    )
])


# ==========================================
# Prediction function
# ==========================================

def predict_image(image_path):

    image = Image.open(image_path).convert("RGB")

    image = transform(image)

    # [3, 224, 224]
    # ->
    # [1, 3, 224, 224]
    image = image.unsqueeze(0)

    image = image.to(device)

    with torch.no_grad():

        outputs = model(image)

        probabilities = torch.softmax(
            outputs,
            dim=1
        )

        confidence, predicted_idx = torch.max(
            probabilities,
            dim=1
        )

    predicted_class = idx_to_class[
        predicted_idx.item()
    ]

    confidence = confidence.item() * 100

    return predicted_class, confidence


# ==========================================
# Run
# ==========================================

if __name__ == "__main__":

    image_path = input(
        "Enter image path: "
    ).strip().strip('"')

    predicted_class, confidence = predict_image(
        image_path
    )

    print()
    print("Prediction:", predicted_class)
    print(f"Confidence: {confidence:.2f}%")