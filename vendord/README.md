# Vendord deployment

Vendord is a Nitro service that reads the same PostgreSQL database as the
main Orderr app. It listens on port 3000 in the container. Its scheduled
scrape runs daily at 00:00 UTC, so the Deployment uses one replica and a
`Recreate` update strategy to avoid duplicate runs.

## Publish to GHCR

The [`vendord image` workflow](../.github/workflows/vendord-image.yml) builds
from the repository root, since Vendord imports shared code from `server/utils`.
Push to `main` with relevant changes, or run the workflow manually. It
publishes `ghcr.io/frctools/order-list-vendord:latest` and a commit-specific
`sha-<commit>` tag. The workflow uses its `GITHUB_TOKEN`; no registry password
is needed in GitHub Actions.

To build locally from the repository root:

```sh
docker build -f vendord/Dockerfile -t vendord:local .
```

## Deploy to Kubernetes

Create a secret in the target namespace with a PostgreSQL connection string.
The database must already have the Orderr schema. Meilisearch values are
optional, but needed for the scheduled index sync. Keep the env file outside
the repository.

```sh
cat > /tmp/vendord.env <<'EOF'
DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/DATABASE
MEILISEARCH_HOST=http://meilisearch:7700
MEILISEARCH_API_KEY=YOUR_KEY
EOF
chmod 600 /tmp/vendord.env
kubectl create secret generic vendord-config --from-env-file=/tmp/vendord.env
kubectl apply -k vendord/k8s
kubectl rollout status deployment/vendord
```

Run these commands in the intended kubectl context and namespace. For later
secret updates, use `kubectl create secret generic ... --dry-run=client -o yaml
| kubectl apply -f -` and restart the Deployment.

The manifests use `latest` for the first install. For a traceable release,
deploy the commit tag produced by the workflow:

```sh
FULL_COMMIT_SHA=replace-with-the-40-character-commit-sha
kubectl set image deployment/vendord \
  vendord=ghcr.io/frctools/order-list-vendord:sha-${FULL_COMMIT_SHA}
kubectl rollout status deployment/vendord
```

The Service is internal (`ClusterIP`) at `vendord:80`. Route traffic to it
through your existing ingress if needed. `/health` is available for probes.

If the GHCR package is private, create a pull secret in the same namespace
using a GitHub token with `read:packages`, then attach it to the Deployment:

```sh
kubectl create secret docker-registry ghcr-pull \
  --docker-server=ghcr.io \
  --docker-username=GITHUB_USERNAME \
  --docker-password=GITHUB_TOKEN_WITH_READ_PACKAGES
kubectl patch deployment vendord --type=json \
  -p='[{"op":"add","path":"/spec/template/spec/imagePullSecrets","value":[{"name":"ghcr-pull"}]}]'
```

For a persistent private-package setup, add `imagePullSecrets` to your own
Deployment overlay. Public GHCR images need no pull secret.
