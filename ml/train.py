#!/usr/bin/env python3
"""Train the MawinguOps planting Random Forest.

Pipeline:
  1. Load a CHIRPS daily series (pipeline/data/chirps_machakos.csv by default).
  2. Engineer per-season features (features.py) and labels (labels.py).
  3. Train/test split 80/20, RandomForestClassifier(n_estimators=100, random_state=42).
  4. Print a classification report and confusion matrix.
  5. Save planting_model.pkl, label_encoder.pkl and feature_importance.json
     into ml/models/.

Usage:
  python train.py [path/to/chirps_machakos.csv]
"""

import json
import os
import sys

import joblib
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import classification_report, confusion_matrix
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import LabelEncoder

from features import FEATURE_NAMES, engineer_season_features
from labels import generate_labels, label_distribution

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
DEFAULT_CSV = os.path.join(SCRIPT_DIR, "..", "pipeline", "data", "chirps_machakos.csv")
MODELS_DIR = os.path.join(SCRIPT_DIR, "models")


def load_chirps(csv_path):
    if not os.path.exists(csv_path):
        print(f"ERROR: CHIRPS CSV not found at {csv_path}")
        print("Export it from the Colab notebook (chirps_machakos.csv) into pipeline/data/.")
        sys.exit(1)
    df = pd.read_csv(csv_path)
    if not {"date", "rainfall_mm"}.issubset(df.columns):
        print("ERROR: CSV must have columns 'date' and 'rainfall_mm'")
        sys.exit(1)
    print(f"Loaded {len(df)} daily rainfall rows from {csv_path}")
    return df


def main():
    csv_path = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_CSV
    os.makedirs(MODELS_DIR, exist_ok=True)

    chirps = load_chirps(csv_path)

    print("Engineering features...")
    features_df = engineer_season_features(chirps)
    print(f"Built {len(features_df)} season rows")

    print("Generating labels...")
    labels = generate_labels(features_df)
    print(f"Label distribution: {label_distribution(labels)}")

    X = features_df[FEATURE_NAMES]
    encoder = LabelEncoder()
    y = encoder.fit_transform(labels)

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y if len(set(y)) > 1 else None
    )

    print("Training RandomForestClassifier(n_estimators=100, random_state=42)...")
    model = RandomForestClassifier(n_estimators=100, random_state=42)
    model.fit(X_train, y_train)

    y_pred = model.predict(X_test)
    # Pass explicit label indices so every class is reported even when a small
    # class is absent from the test split (the dataset is small and imbalanced).
    label_indices = list(range(len(encoder.classes_)))
    print("\n=== Classification report ===")
    print(
        classification_report(
            y_test,
            y_pred,
            labels=label_indices,
            target_names=encoder.classes_,
            zero_division=0,
        )
    )
    print("=== Confusion matrix ===")
    print(confusion_matrix(y_test, y_pred, labels=label_indices))

    model_path = os.path.join(MODELS_DIR, "planting_model.pkl")
    encoder_path = os.path.join(MODELS_DIR, "label_encoder.pkl")
    importance_path = os.path.join(MODELS_DIR, "feature_importance.json")

    joblib.dump(model, model_path)
    joblib.dump(encoder, encoder_path)

    importance = {
        name: float(score)
        for name, score in zip(FEATURE_NAMES, model.feature_importances_)
    }
    with open(importance_path, "w") as f:
        json.dump(importance, f, indent=2)

    print(f"\nSaved model      -> {model_path}")
    print(f"Saved encoder    -> {encoder_path}")
    print(f"Saved importance -> {importance_path}")


if __name__ == "__main__":
    main()
