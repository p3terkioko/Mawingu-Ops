#!/usr/bin/env python3
"""Evaluate a trained MawinguOps planting model.

Re-engineers features/labels from a CHIRPS CSV, loads the saved model and
encoder, and prints accuracy, a classification report, the confusion matrix and
ranked feature importances. Read-only — it does not retrain or overwrite models.

Usage:
  python evaluate.py [path/to/chirps_machakos.csv]
"""

import os
import sys

import joblib
import pandas as pd
from sklearn.metrics import (
    accuracy_score,
    classification_report,
    confusion_matrix,
)

from features import FEATURE_NAMES, engineer_season_features
from labels import generate_labels, label_distribution

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
DEFAULT_CSV = os.path.join(SCRIPT_DIR, "..", "pipeline", "data", "chirps_machakos.csv")
MODELS_DIR = os.path.join(SCRIPT_DIR, "models")


def load_or_exit(path, label):
    if not os.path.exists(path):
        print(f"ERROR: {label} not found at {path}")
        print("Train the model first (python train.py) or download it from Colab.")
        sys.exit(1)
    return joblib.load(path)


def main():
    csv_path = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_CSV
    if not os.path.exists(csv_path):
        print(f"ERROR: CHIRPS CSV not found at {csv_path}")
        sys.exit(1)

    model = load_or_exit(os.path.join(MODELS_DIR, "planting_model.pkl"), "model")
    encoder = load_or_exit(os.path.join(MODELS_DIR, "label_encoder.pkl"), "label encoder")

    chirps = pd.read_csv(csv_path)
    features_df = engineer_season_features(chirps)
    labels = generate_labels(features_df)
    print(f"Evaluating on {len(features_df)} season rows")
    print(f"Label distribution: {label_distribution(labels)}")

    X = features_df[FEATURE_NAMES]
    y_true = encoder.transform(labels)
    y_pred = model.predict(X)

    label_indices = list(range(len(encoder.classes_)))
    print(f"\nOverall accuracy: {accuracy_score(y_true, y_pred):.3f}\n")
    print("=== Classification report ===")
    print(
        classification_report(
            y_true,
            y_pred,
            labels=label_indices,
            target_names=encoder.classes_,
            zero_division=0,
        )
    )
    print("=== Confusion matrix ===")
    print(confusion_matrix(y_true, y_pred, labels=label_indices))

    print("\n=== Feature importances (ranked) ===")
    ranked = sorted(
        zip(FEATURE_NAMES, model.feature_importances_),
        key=lambda kv: kv[1],
        reverse=True,
    )
    for name, score in ranked:
        print(f"  {name:<26} {score:.4f}")


if __name__ == "__main__":
    main()
