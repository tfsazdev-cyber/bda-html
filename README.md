# BDA Portal

Full-stack Business Data Analytics portal — containerised and ready for Kubernetes.

---

## 📁 Folder Structure

```
bda-project/                        ← ONE root folder
│
├── app/                            ← All application source code
│   ├── backend/
│   │   ├── server.js               ← Express API (auth, users, analytics)
│   │   └── package.json
│   │
│   └── frontend/
│       ├── index.html              ← Login page
│       ├── dashboard.html          ← Dashboard with charts
│       ├── nginx.conf              ← Nginx site config
│       └── entrypoint.sh          ← Injects API URL at container start
│
├── dockerfiles/                    ← Dockerfiles (separate from code)
│   ├── Dockerfile.backend
│   └── Dockerfile.frontend
│
├── k8s/                            ← Kubernetes manifests
│   ├── 00-namespace.yaml
│   ├── 01-pvc.yaml                 ← Persistent storage for SQLite
│   ├── 02-backend.yaml             ← Backend Deployment + Service
│   ├── 03-frontend.yaml            ← Frontend Deployment + Service
│   ├── 04-config-secret.yaml       ← ConfigMap (API URL) + JWT Secret
│   └── 05-hpa.yaml                 ← Auto-scaling
│
├── docker-compose.yml              ← Local testing
├── deploy.sh                       ← One-command build + push + deploy
└── README.md
```

> ⚠️ **Build context is always the project root** so Dockerfiles can reach `app/`.

---

## 🖥️ Local Test (Docker Compose)

```bash
cd bda-project
docker compose up --build
```

Open → **http://localhost:8080**
Login → `admin@bda.com` / `Admin@123`

---

## 🐳 Build Docker Images Manually

Run all commands from the **project root** (`bda-project/`):

```bash
# Backend
docker build \
  -f dockerfiles/Dockerfile.backend \
  -t yourusername/bda-backend:latest \
  .

# Frontend
docker build \
  -f dockerfiles/Dockerfile.frontend \
  -t yourusername/bda-frontend:latest \
  .
```

Push to Docker Hub:
```bash
docker login
docker push yourusername/bda-backend:latest
docker push yourusername/bda-frontend:latest
```

---

## ☸️ Deploy to Kubernetes (EKS)

### Step 1 — Apply namespace & config
```bash
kubectl apply -f k8s/00-namespace.yaml
kubectl apply -f k8s/04-config-secret.yaml   # update api-url after step 3
kubectl apply -f k8s/01-pvc.yaml             # uncomment storageClassName: gp2 for EKS
```

### Step 2 — Edit image names
In `k8s/02-backend.yaml` and `k8s/03-frontend.yaml`, replace:
```
<YOUR_DOCKERHUB_USERNAME>/bda-backend:latest
<YOUR_DOCKERHUB_USERNAME>/bda-frontend:latest
```
with your actual Docker Hub image names.

### Step 3 — Deploy backend, get its URL
```bash
kubectl apply -f k8s/02-backend.yaml
kubectl get svc bda-backend-svc -n bda-portal   # wait for EXTERNAL-IP
```

### Step 4 — Update frontend config with backend URL
Edit `k8s/04-config-secret.yaml`:
```yaml
api-url: "http://<BACKEND_EXTERNAL_IP>:3000"
```
```bash
kubectl apply -f k8s/04-config-secret.yaml
```

### Step 5 — Deploy frontend + autoscaler
```bash
kubectl apply -f k8s/03-frontend.yaml
kubectl apply -f k8s/05-hpa.yaml
kubectl get svc bda-frontend-svc -n bda-portal   # get frontend URL
```

---

## ⚡ One-Command Deploy

```bash
chmod +x deploy.sh
./deploy.sh yourusername v1.0.0
```

---

## 🔑 Demo Credentials

| Role    | Email           | Password  |
|---------|-----------------|-----------|
| Admin   | admin@bda.com   | Admin@123 |
| Manager | john@bda.com    | Admin@123 |
| Analyst | jane@bda.com    | Admin@123 |
| Viewer  | bob@bda.com     | Admin@123 |

---

## 🛠️ Useful kubectl Commands

```bash
# Watch pods
kubectl get pods -n bda-portal -w

# Logs
kubectl logs -f deployment/bda-backend  -n bda-portal
kubectl logs -f deployment/bda-frontend -n bda-portal

# Restart after config change
kubectl rollout restart deployment/bda-backend  -n bda-portal
kubectl rollout restart deployment/bda-frontend -n bda-portal

# Port-forward for local debug
kubectl port-forward svc/bda-backend-svc 3000:3000 -n bda-portal

# Check autoscaler
kubectl get hpa -n bda-portal
```

---

## 🌐 API Endpoints

| Method | Path                  | Auth | Description        |
|--------|-----------------------|------|--------------------|
| GET    | /health               | No   | Health check       |
| POST   | /login                | No   | Login → JWT token  |
| GET    | /users                | Yes  | List all users     |
| POST   | /users                | Yes* | Create user        |
| DELETE | /users/:id            | Yes* | Delete user        |
| GET    | /analytics/dashboard  | Yes  | Dashboard stats    |
| GET    | /activity             | Yes  | Activity log       |

*Admin or Manager role required
