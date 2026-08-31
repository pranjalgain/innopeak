#!/bin/bash

set -euo pipefail

RELEASE_NAME="kube-state-metrics"
NAMESPACE="kube-system"
REPO_NAME="prometheus-community"
CHART_NAME="kube-state-metrics"
REPO_URL="https://prometheus-community.github.io/helm-charts"

# Add Helm repo if not already added
if ! helm repo list | grep -q "^${REPO_NAME}"; then
  echo "🌀 Adding Helm repo: $REPO_NAME..."
  helm repo add "$REPO_NAME" "$REPO_URL"
else
  echo "✅ Helm repo '$REPO_NAME' already exists. Skipping add."
fi

# Update Helm repos
echo "🔄 Updating Helm repositories..."
helm repo update

# Ensure namespace exists
if ! kubectl get namespace "$NAMESPACE" >/dev/null 2>&1; then
  echo "📁 Namespace '$NAMESPACE' does not exist. Creating it..."
  kubectl create namespace "$NAMESPACE"
else
  echo "✅ Namespace '$NAMESPACE' already exists. Skipping creation."
fi

# Check if release exists
if helm status "$RELEASE_NAME" -n "$NAMESPACE" >/dev/null 2>&1; then
  echo "🚫 Helm release '$RELEASE_NAME' already exists in namespace '$NAMESPACE'. Skipping install."
else
  echo "🚀 Installing Helm release '$RELEASE_NAME'..."
  helm install "$RELEASE_NAME" "${REPO_NAME}/${CHART_NAME}" \
    --namespace "$NAMESPACE" \
    --set rbac.create=true
  echo "✅ Installation complete."
fi
