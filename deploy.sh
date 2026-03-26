#!/bin/bash
# ============================================================
#  deploy.sh — Build, push, and deploy BDA Portal to K8s
#
#  Usage:
#    chmod +x deploy.sh
#    ./deploy.sh <dockerhub-username> [tag]
#
#  Example:
#    ./deploy.sh myusername v1.0.0
# ============================================================

set -e

DOCKER_USER="${1:?Usage: $0 <dockerhub-username> [tag]}"
TAG="${2:-latest}"

BACKEND_IMAGE="$DOCKER_USER/bda-backend:$TAG"
FRONTEND_IMAGE="$DOCKER_USER/bda-frontend:$TAG"

echo ""
echo "═══════════════════════════════════════════"
echo "  BDA Portal — Build & Deploy"
echo "  Backend  → $BACKEND_IMAGE"
echo "  Frontend → $FRONTEND_IMAGE"
echo "═══════════════════════════════════════════"

# 1. Docker login
echo ""
echo "🔐 [1/6] Docker Hub login…"
docker login

# 2. Build images (context = project root so Dockerfiles can reach app/)
echo ""
echo "🔨 [2/6] Building backend image…"
docker build \
  -f dockerfiles/Dockerfile.backend \
  -t "$BACKEND_IMAGE" \
  .

echo ""
echo "🔨 [3/6] Building frontend image…"
docker build \
  -f dockerfiles/Dockerfile.frontend \
  -t "$FRONTEND_IMAGE" \
  .

# 3. Push
echo ""
echo "📤 [4/6] Pushing to Docker Hub…"
docker push "$BACKEND_IMAGE"
docker push "$FRONTEND_IMAGE"
echo "   ✅ $BACKEND_IMAGE"
echo "   ✅ $FRONTEND_IMAGE"

# 4. Patch image names into K8s manifests
echo ""
echo "📝 [5/6] Patching K8s manifests…"
sed -i "s|<YOUR_DOCKERHUB_USERNAME>/bda-backend:latest|$BACKEND_IMAGE|g"  k8s/02-backend.yaml
sed -i "s|<YOUR_DOCKERHUB_USERNAME>/bda-frontend:latest|$FRONTEND_IMAGE|g" k8s/03-frontend.yaml

# 5. Apply manifests
echo ""
echo "🚀 [6/6] Applying to Kubernetes…"
kubectl apply -f k8s/00-namespace.yaml
kubectl apply -f k8s/04-config-secret.yaml
kubectl apply -f k8s/01-pvc.yaml
kubectl apply -f k8s/02-backend.yaml
kubectl apply -f k8s/03-frontend.yaml
kubectl apply -f k8s/05-hpa.yaml

# 6. Wait for rollout
echo ""
echo "⏳ Waiting for rollout…"
kubectl rollout status deployment/bda-backend  -n bda-portal --timeout=120s
kubectl rollout status deployment/bda-frontend -n bda-portal --timeout=120s

# 7. Print URLs
echo ""
BACKEND_LB=$(kubectl get svc bda-backend-svc  -n bda-portal -o jsonpath='{.status.loadBalancer.ingress[0].hostname}' 2>/dev/null || echo "<pending>")
FRONTEND_LB=$(kubectl get svc bda-frontend-svc -n bda-portal -o jsonpath='{.status.loadBalancer.ingress[0].hostname}' 2>/dev/null || echo "<pending>")

echo "═══════════════════════════════════════════"
echo "  🎉 Done!"
echo "  Frontend  → http://$FRONTEND_LB"
echo "  Backend   → http://$BACKEND_LB:3000"
echo ""
echo "  ⚠️  If <pending>, run: kubectl get svc -n bda-portal -w"
echo "  📌 Then update k8s/04-config-secret.yaml api-url"
echo "     and: kubectl apply -f k8s/04-config-secret.yaml"
echo "          kubectl rollout restart deployment/bda-frontend -n bda-portal"
echo "═══════════════════════════════════════════"
